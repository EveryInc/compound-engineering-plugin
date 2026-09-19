import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { FakeLivePage, FIXTURES_DIR, readFixture } from "../helpers/fakeLivePage"
import { APP_ORIGIN, FakeLiveAgent, FakeOpenAI, directRequest, runHelper, parseJsonLine, waitUntil } from "../helpers/fakeLiveAgent"

setDefaultTimeout(30_000)

// Scenario suite for skills/ce-polish/scripts/live-endpoint.js against the
// riffrec stream-contract fixtures (tests/fixtures/ce-polish-live/). The
// one-checkpoint round trip and the credential classes are also smoke-tested
// in ce-polish-live-endpoint.smoke.test.ts; this file covers the U10 plan
// scenarios at the helper seam. Both fakes live in tests/helpers/.

const agents: FakeLiveAgent[] = []
const stubs: FakeOpenAI[] = []

// A rejected request fails with the helper's reason in the message, not a bare status.
function expectOk(result: { status: number; body: Record<string, unknown> }): void {
  expect(result.status, JSON.stringify(result.body)).toBe(200)
}

async function startAgent(options: Parameters<typeof FakeLiveAgent.start>[0] = {}): Promise<FakeLiveAgent> {
  const agent = await FakeLiveAgent.start(options)
  agents.push(agent)
  return agent
}

function startOpenAI(): FakeOpenAI {
  const stub = new FakeOpenAI()
  stubs.push(stub)
  return stub
}

const pages: FakeLivePage[] = []

/** Every page is registered so an assertion failure cannot leave a stream reader open past the test. */
function pageFor(url: string, token: string, sessionId?: string): FakeLivePage {
  const page = new FakeLivePage(url, token, sessionId)
  pages.push(page)
  return page
}

afterEach(async () => {
  while (pages.length > 0) await pages.pop()!.closeStream()
  while (agents.length > 0) await agents.pop()!.dispose()
  while (stubs.length > 0) stubs.pop()!.stop()
})

// Every page-envelope fixture, in seq order; wake-batch and the mint pair are not page envelopes.
const PAGE_FIXTURES = [
  "click", "network-request", "console-error", "navigation", "transcript", "unit", "unit-update",
  "unit-withdraw", "annotation", "checkpoint", "answer", "frame", "mic", "mode", "stream-state",
]

describe("live endpoint: stream contract intake", () => {
  test("every fixture envelope is accepted with acked_seq advancing; a replayed seq does not duplicate the unit; a foreign schema_version returns 409", async () => {
    const agent = await startAgent()
    const fixtures = await Promise.all(PAGE_FIXTURES.map(readFixture))
    const sessionId = fixtures[0].session_id
    expect(new Set(fixtures.map((fixture) => fixture.session_id)).size).toBe(1)
    const page = pageFor(agent.url, agent.pageToken, sessionId)

    let expectedAck = 0
    for (const fixture of fixtures.sort((a, b) => a.seq - b.seq)) {
      // The fixtures are posted verbatim: same seq, same payload. Frames post alone.
      const result = await page.post(fixture)
      expect(result.status, `${fixture.type} (seq ${fixture.seq}) -> ${JSON.stringify(result.body)}`).toBe(200)
      expectedAck = fixture.seq
      expect(result.body.acked_seq).toBe(expectedAck)
    }
    expect(page.ackedSeq).toBe(15)

    const status = await agent.statusHttp()
    expect(status.body.acked_seq).toBe(15)
    const units = status.body.units as { total: number }
    expect(units.total).toBe(1)
    expect(status.body.annotations).toBe(1)
    expect(status.body.frame_count).toBe(1)
    expect(status.body.transcript_count).toBe(1)
    expect(status.body.answers).toBe(1)
    expect(status.body.mode).toBe("collect")

    const replayed = await page.post(await readFixture("unit"))
    expect(replayed.status).toBe(200)
    expect(replayed.body.acked_seq).toBe(15)
    expect(((await agent.statusHttp()).body.units as { total: number }).total).toBe(1)

    const foreign = await page.post({ ...(await readFixture("mic")), seq: 16, schema_version: "live/2" })
    expect(foreign.status).toBe(409)
    expect(foreign.body).toEqual({ expected_schema_version: "live/1" })

    // The stored frame landed under state/log/frames with the fixture bytes.
    // The file name is the helper's own layout; only the frame id must appear in it.
    const frame = await readFixture("frame")
    const framesDir = path.join(agent.stateDir, "log", "frames")
    const frameFiles = (await fs.readdir(framesDir)).filter((name) => name.includes(String(frame.payload.id)) && name.endsWith(".jpg"))
    expect(frameFiles).toHaveLength(1)
    const stored = await fs.readFile(path.join(framesDir, frameFiles[0]))
    expect(Buffer.from(stored).toString("base64")).toBe(String(frame.payload.jpeg_base64))
  })

  test("the wake-batch fixture is the shape /wait serves", async () => {
    const agent = await startAgent()
    const wakeFixture = JSON.parse(await fs.readFile(path.join(FIXTURES_DIR, "wake-batch.json"), "utf8"))
    const page = pageFor(agent.url, agent.pageToken)
    const unit = await readFixture("unit")
    const annotation = await readFixture("annotation")
    expectOk(await page.post([page.fromFixture(unit), page.fromFixture(annotation)]))
    expectOk(await page.sendCheckpoint("cp_0001", "silence", "smart"))

    const wake = await agent.waitHttp()
    expect(wake.status).toBe(200)
    expect(Object.keys(wake.envelope!).sort()).toEqual(Object.keys(wakeFixture).sort())
    expect(wake.envelope!.checkpoint_id).toBe("cp_0001")
    expect(wake.envelope!.kind).toBe("silence")
    expect(wake.envelope!.mode_at_checkpoint).toBe("smart")
    expect(wake.envelope!.session_status).toBe("live")
    expect(wake.envelope!.units[0].id).toBe("unit_0001")
    expect(wake.envelope!.units[0].status).toBe("triaging")
    expect(wake.envelope!.annotations[0].id).toBe("ann_0001")
    expect(wake.envelope!.answers).toEqual([])
  })
})

describe("live endpoint: checkpoints (AE1, AE2, AE12)", () => {
  test("AE1: three units then a page_change checkpoint produce exactly one wake with three units; an empty silence checkpoint produces no wake", async () => {
    const agent = await startAgent()
    const page = pageFor(agent.url, agent.pageToken)
    await page.sendUnit("u1", "make the header red")
    await page.sendUnit("u2", "move the toggle right")
    await page.sendUnit("u3", "bigger avatar")
    expectOk(await page.sendCheckpoint("ck-nav", "page_change", "smart"))

    const first = await agent.waitCli()
    expect(first.exitCode, first.stderr).toBe(0)
    const wake = first.envelope as { checkpoint_id: string; kind: string; units: Array<{ id: string; status: string }> }
    expect(wake.checkpoint_id).toBe("ck-nav")
    expect(wake.kind).toBe("page_change")
    expect(wake.units.map((unit) => unit.id)).toEqual(["u1", "u2", "u3"])
    expect(wake.units.every((unit) => unit.status === "triaging")).toBe(true)
    expectOk(await agent.ack("ck-nav"))

    expectOk(await page.sendCheckpoint("ck-silence", "silence", "smart"))
    // Nothing held: the wake parks and times out instead of returning an empty batch.
    const second = await agent.waitHttp()
    expect(second.status).toBe(204)
    const board = await agent.statusHttp()
    expect((board.body.batches as { unserved: number; unacked: number })).toEqual({ unserved: 0, unacked: 0 })
    expect(board.body.checkpoints).toBe(1)
  })

  test("AE2: in Collect, after three released units were accepted, an empty final checkpoint still wakes the agent and carries those three (KTD12)", async () => {
    const agent = await startAgent()
    const page = pageFor(agent.url, agent.pageToken)
    await page.send("mode", { mode: "collect" })
    await page.sendUnit("u1", "make the header red")
    await page.sendUnit("u2", "move the toggle right")
    await page.sendUnit("u3", "bigger avatar")
    await page.sendCheckpoint("ck1", "silence", "collect")
    const first = await agent.waitHttp()
    expect(first.status).toBe(200)
    expect(first.envelope!.mode_at_checkpoint).toBe("collect")
    expectOk(await agent.ack("ck1"))
    for (const id of ["u1", "u2", "u3"]) expectOk(await agent.postStatus(id, "accepted"))

    expectOk(await page.sendCheckpoint("ck-final", "final", "collect"))
    const final = await agent.waitHttp()
    expect(final.status).toBe(200)
    expect(final.envelope!.kind).toBe("final")
    expect(final.envelope!.mode_at_checkpoint).toBe("collect")
    expect(final.envelope!.units.map((unit) => unit.id).sort()).toEqual(["u1", "u2", "u3"])
    expect(final.envelope!.units.every((unit) => unit.status === "accepted")).toBe(true)
    expectOk(await agent.ack("ck-final"))
    // A unit the agent applied or blocked has left the backlog and is not carried again.
  })

  test("AE2: in Collect, a mode event switching to Smart produces a mode_change wake carrying the accepted units; applied and blocked ones drop out of the backlog (KTD12)", async () => {
    const agent = await startAgent()
    const page = pageFor(agent.url, agent.pageToken)
    // The page keeps its stream open, so an `applied` notice below is not a page-lost episode.
    await page.openStream()
    await page.send("mode", { mode: "collect" })
    await page.sendUnit("u1", "make the header red")
    await page.sendUnit("u2", "move the toggle right")
    await page.sendUnit("u3", "bigger avatar")
    await page.sendCheckpoint("ck1", "silence", "collect")
    expectOk(await agent.waitHttp())
    expectOk(await agent.ack("ck1"))
    for (const id of ["u1", "u2", "u3"]) expectOk(await agent.postStatus(id, "accepted"))
    // Nothing wakes while Collect holds the backlog.
    expect((await agent.waitHttp()).status).toBe(204)

    expectOk(await page.send("mode", { mode: "smart" }))
    const wake = await agent.waitHttp()
    expect(wake.status).toBe(200)
    expect(wake.envelope!.kind).toBe("mode_change")
    expect(wake.envelope!.mode_at_checkpoint).toBe("smart")
    expect(wake.envelope!.units.map((unit) => unit.id).sort()).toEqual(["u1", "u2", "u3"])
    expect(wake.envelope!.annotations).toEqual([])
    expect(wake.envelope!.answers).toEqual([])
    expectOk(await agent.ack(wake.envelope!.checkpoint_id))

    // Smart applies two, blocks one; switching back to Collect and out again carries nothing.
    expectOk(await agent.postStatus("u1", "applied"))
    expectOk(await agent.postStatus("u2", "blocked", { note: "beyond polish" }))
    expectOk(await page.send("mode", { mode: "collect" }))
    expect((await agent.waitHttp()).status).toBe(204)
    expectOk(await page.send("mode", { mode: "instant" }))
    const again = await agent.waitHttp()
    expect(again.status).toBe(200)
    expect(again.envelope!.kind).toBe("mode_change")
    expect(again.envelope!.mode_at_checkpoint).toBe("instant")
    expect(again.envelope!.units.map((unit) => unit.id)).toEqual(["u3"])
    await page.closeStream()
  })

  test("AE12: a unit_withdraw before the checkpoint excludes the unit; one after release appears in the next batch as withdrawn", async () => {
    const agent = await startAgent()
    const page = pageFor(agent.url, agent.pageToken)
    await page.openStream()
    await page.sendUnit("u1", "make this red")
    await page.sendUnit("u2", "keep this one")
    await page.send("unit_withdraw", { unit_id: "u1", reason: "no, forget that" })
    await page.sendCheckpoint("ck1", "silence", "smart")

    const first = await agent.waitHttp()
    expect(first.status).toBe(200)
    expect(first.envelope!.units.map((unit) => unit.id)).toEqual(["u2"])
    expectOk(await agent.ack("ck1"))
    await page.waitForEvent((event) => event.event === "unit_status" && event.data.unit_id === "u2" && event.data.status === "triaging")

    // u2 was released; the riffer withdraws it after the fact.
    await page.send("unit_withdraw", { unit_id: "u2", reason: "changed my mind" })
    await page.sendUnit("u3", "and a new one")
    await page.sendCheckpoint("ck2", "send", "smart")
    const second = await agent.waitHttp()
    expect(second.status).toBe(200)
    expect(second.envelope!.units.map((unit) => `${unit.id}:${unit.status}`).sort()).toEqual(["u2:withdrawn", "u3:triaging"])
    expectOk(await agent.ack("ck2"))

    // A withdrawal that arrives after release without any new unit still wakes on its own.
    await page.send("unit_withdraw", { unit_id: "u3" })
    await page.sendCheckpoint("ck3", "silence", "smart")
    const third = await agent.waitHttp()
    expect(third.status).toBe(200)
    expect(third.envelope!.units.map((unit) => `${unit.id}:${unit.status}`)).toEqual(["u3:withdrawn"])
    await page.closeStream()
  })
})

describe("live endpoint: /mint (KTD4, I2)", () => {
  test("without a key /mint returns 503 no_key", async () => {
    const agent = await startAgent({ env: { OPENAI_API_KEY: undefined } })
    const page = pageFor(agent.url, agent.pageToken)
    const minted = await page.mint(JSON.parse(await fs.readFile(path.join(FIXTURES_DIR, "mint-request.json"), "utf8")))
    expect(minted.status).toBe(503)
    expect(minted.body).toEqual({ reason: "no_key" })
  })

  test("upstream 401 -> 502 with upstream_status; a brief with sk- -> 503 brief_contains_secret; the sixth mint in a minute -> 429; state/ holds neither the key nor the secret", async () => {
    const openai = startOpenAI()
    const stubKey = "sk-stub-key-for-tests-0123456789abcdef"
    const agent = await startAgent({ env: { OPENAI_API_KEY: stubKey, OPENAI_BASE_URL: openai.baseUrl } })
    const page = pageFor(agent.url, agent.pageToken)
    const mintResponseFixture = JSON.parse(await fs.readFile(path.join(FIXTURES_DIR, "mint-response.json"), "utf8"))

    // Mint 1: upstream accepts; the response carries the I2 shape (fixture keys).
    const secret = "ek_test_minted_secret_9f8e7d6c"
    openai.respondWith(200, { value: secret, expires_at: 1789686600, session: { model: "gpt-realtime" } })
    const ok = await page.mint()
    expect(ok.status).toBe(200)
    expect(Object.keys(ok.body).sort()).toEqual(Object.keys(mintResponseFixture).sort())
    expect(ok.body.client_secret).toBe(secret)
    expect(ok.body.expires_at).toBe(1789686600)
    expect(openai.requests).toHaveLength(1)
    expect(openai.requests[0].url).toBe("/v1/realtime/client_secrets")
    expect(openai.requests[0].authorization).toBe(`Bearer ${stubKey}`)
    const session = openai.requests[0].body.session as { tools: Array<{ name: string }>; instructions: string; audio: unknown }
    expect(session.tools.map((tool) => tool.name)).toEqual(["record_unit", "update_unit", "withdraw_unit", "relay_answer", "look_at_screen"])
    // Verbatim riffrec LIVE_TOOLS and DEFAULT_INTERVIEWER_INSTRUCTIONS: the page
    // reconciles the minted session after connect and patches only what differs,
    // so a byte-identical copy is what keeps it from touching the session.
    expect(session.tools).toEqual(JSON.parse(await fs.readFile(path.join(FIXTURES_DIR, "live-tools.json"), "utf8")))
    const persona = await fs.readFile(path.join(FIXTURES_DIR, "interviewer-instructions.txt"), "utf8")
    expect(session.instructions).toBe(persona)
    expect(session.instructions).toContain("[SCREEN CONTEXT]")
    expect(session.audio).toBeDefined()

    // Mint 2: upstream rejects the key; the body is not echoed.
    const rejected = await page.mint()
    expect(rejected.status).toBe(502)
    expect(rejected.body).toEqual({ reason: "openai_error", upstream_status: 401 })

    // A brief carrying a key shape refuses before any upstream call.
    await fs.writeFile(path.join(agent.stateDir, "brief.md"), "Routes: /, /settings\nAlso: OPENAI_API_KEY=sk-leaked-0123456789abcdef\n")
    const leaked = await page.mint()
    expect(leaked.status).toBe(503)
    expect(leaked.body).toEqual({ reason: "brief_contains_secret" })
    expect(openai.requests).toHaveLength(2)

    await fs.writeFile(path.join(agent.stateDir, "brief.md"), "Routes: /, /settings\nComponents: SidebarToggle, SettingsPanel\n")
    for (let i = 0; i < 3; i++) expect((await page.mint()).status).toBe(502)
    const limited = await page.mint()
    expect(limited.status).toBe(429)
    expect(typeof limited.body.retry_after).toBe("number")
    expect(openai.requests).toHaveLength(5)
    // The brief rode along in the instructions after the persona, under riffrec's label.
    const withBrief = openai.requests[4].body.session as { instructions: string }
    expect(withBrief.instructions).toBe(`${persona}\n\n[SESSION BRIEF]\nRoutes: /, /settings\nComponents: SidebarToggle, SettingsPanel\n`)

    // Neither the API key nor the minted secret is persisted anywhere under state/.
    const files = await collectFiles(agent.stateDir)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const text = await fs.readFile(file, "utf8").catch(() => "")
      expect(text, file).not.toContain(stubKey)
      expect(text, file).not.toContain(secret)
    }
  })

  test("a non-loopback plain-HTTP peer gets 403 tls_required; X-Forwarded-Proto: https lifts it", async () => {
    const lanAddress = Object.values(os.networkInterfaces())
      .flat()
      .find((iface) => iface && !iface.internal && iface.family === "IPv4")?.address
    if (!lanAddress) {
      // No non-loopback interface on this machine; the TLS gate cannot be reached.
      return
    }
    // node:http, not fetch: an ambient HTTP_PROXY whose NO_PROXY omits this address must not swallow the request.
    const mintDirect = async (agent: FakeLiveAgent, extra: Record<string, string> = {}) => {
      const page = pageFor(`http://${lanAddress}:${agent.port}`, agent.pageToken)
      const response = await directRequest(`${page.url}/mint`, { method: "POST", headers: page.headers(extra), body: JSON.stringify({ session_id: page.sessionId }) })
      return { status: response.status, body: response.json() }
    }
    const agent = await startAgent({ host: "0.0.0.0", env: { OPENAI_API_KEY: undefined } })
    // An advertised address is not a reachable one: some runners refuse hairpin
    // connections to their own interface, or a network policy answers in the
    // helper's place. Only this helper's own status proves the route.
    const probe = await directRequest(`http://${lanAddress}:${agent.port}/status`, { method: "GET", headers: agent.headers(), timeoutMs: 2000 }).catch(() => null)
    if (!probe || probe.status !== 200 || probe.json().schema_version !== "live/1") {
      return
    }
    const plain = await mintDirect(agent)
    expect(plain.status).toBe(403)
    expect(plain.body).toEqual({ reason: "tls_required" })
    // The header alone proves nothing: only a proxy named with --trust-proxy may assert it.
    const untrusted = await mintDirect(agent, { "X-Forwarded-Proto": "https" })
    expect(untrusted.status).toBe(403)
    expect(untrusted.body).toEqual({ reason: "tls_required" })

    const trusted = await startAgent({ host: "0.0.0.0", env: { OPENAI_API_KEY: undefined }, startArgs: ["--trust-proxy", lanAddress] })
    const forwarded = await mintDirect(trusted, { "X-Forwarded-Proto": "https" })
    // Past the TLS gate the request reaches the key check.
    expect(forwarded.status).toBe(503)
    expect(forwarded.body).toEqual({ reason: "no_key" })
    expect((await mintDirect(trusted)).status).toBe(403)
  })
})

describe("live endpoint: wake ownership, credentials, and caps (KTD7, I3, I4)", () => {
  test("a second concurrent wait receives 409 and the CLI exits 3 with wait-taken", async () => {
    const agent = await startAgent()
    // Ownership is observed, not assumed: two waits race and whichever answers
    // first is the one refused, because the holder stays parked until aborted.
    const controller = new AbortController()
    const waits = [0, 1].map(() => fetch(`${agent.url}/wait`, { headers: agent.headers(), signal: controller.signal }).catch(() => null))
    const refused = await Promise.race(waits)
    expect(refused?.status).toBe(409)
    expect(await refused!.json()).toEqual({ status: "wait-taken" })
    const cli = await agent.waitCli()
    expect(cli.exitCode).toBe(3)
    expect(cli.envelope).toEqual({ status: "wait-taken" })
    controller.abort()
    await Promise.all(waits)
    // The wake is free again once the holder is gone: the next wait parks and times out empty.
    await waitUntil(async () => (await agent.waitHttp()).status === 204, 10_000, 50)
  })

  test("every route without a credential returns 401; wrong credential class returns 403; ?token= is ignored; Origin on an agent route is 403; OPTIONS /events returns the exact app origin without a credentials flag", async () => {
    const agent = await startAgent()
    const routes: Array<[string, string]> = [
      ["POST", "/events"], ["GET", "/stream"], ["POST", "/mint"], ["POST", "/session/end"],
      ["GET", "/wait"], ["GET", "/status"], ["POST", "/checkpoints/ck1/ack"], ["POST", "/units/u1/status"], ["POST", "/units/u1/ask"],
    ]
    for (const [method, route] of routes) {
      const response = await fetch(`${agent.url}${route}`, { method, headers: { "X-Riffrec-Session": "s1" }, body: method === "POST" ? "{}" : undefined })
      expect(response.status, `${method} ${route}`).toBe(401)
    }
    for (const [method, route] of routes) {
      const url = new URL(`${agent.url}${route}`)
      url.searchParams.set("token", route === "/events" || route === "/stream" || route === "/mint" || route === "/session/end" ? agent.pageToken : agent.agentToken)
      const response = await fetch(url, { method, headers: { "X-Riffrec-Session": "s1" }, body: method === "POST" ? "{}" : undefined })
      expect(response.status, `${method} ${route}?token=`).toBe(401)
    }
    // Page token on agent routes, agent token on page routes.
    for (const [method, route] of routes.slice(4)) {
      const response = await fetch(`${agent.url}${route}`, { method, headers: { Authorization: `Bearer ${agent.pageToken}` }, body: method === "POST" ? "{}" : undefined })
      expect(response.status, `${method} ${route} with page token`).toBe(403)
    }
    for (const [method, route] of routes.slice(0, 4)) {
      const response = await fetch(`${agent.url}${route}`, {
        method,
        headers: { Authorization: `Bearer ${agent.agentToken}`, "X-Riffrec-Session": "s1" },
        body: method === "POST" ? "{}" : undefined,
      })
      expect(response.status, `${method} ${route} with agent token`).toBe(403)
    }
    for (const [method, route] of routes.slice(4)) {
      const response = await fetch(`${agent.url}${route}`, { method, headers: { ...agent.headers(), Origin: APP_ORIGIN }, body: method === "POST" ? "{}" : undefined })
      expect(response.status, `${method} ${route} with Origin`).toBe(403)
      expect(response.headers.get("access-control-allow-origin")).toBeNull()
    }
    // A page request from a foreign origin is refused even with the right token.
    const foreignOrigin = await fetch(`${agent.url}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${agent.pageToken}`, "X-Riffrec-Session": "s1", Origin: "http://evil.example" },
      body: "[]",
    })
    expect(foreignOrigin.status).toBe(403)

    const preflight = await fetch(`${agent.url}/events`, { method: "OPTIONS", headers: { Origin: APP_ORIGIN, "Access-Control-Request-Method": "POST" } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN)
    expect(preflight.headers.get("access-control-allow-headers")).toBe("Authorization, Content-Type, X-Riffrec-Session, X-Riffrec-OpenAI-Key")
    expect(preflight.headers.get("access-control-allow-methods")).toBe("GET, POST")
    expect(preflight.headers.get("vary")).toBe("Origin")
    expect(preflight.headers.get("access-control-allow-credentials")).toBeNull()
    // Nothing is served from the run directory (R40).
    expect((await fetch(`${agent.url}/state/session.json`)).status).toBe(404)
    expect((await fetch(`${agent.url}/`)).status).toBe(404)

    // Every refusal above left a line in agent.ndjson naming method, path,
    // status, and reason; none of them carries a token or the query string.
    const agentLog = await fs.readFile(path.join(agent.stateDir, "log", "agent.ndjson"), "utf8")
    const rejected = agentLog.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>).filter((r) => r.kind === "rejected")
    expect(rejected.length).toBeGreaterThanOrEqual(routes.length * 3 + 1)
    for (const record of rejected) expect(Object.keys(record).sort()).toEqual(["kind", "method", "reason", "route", "status", "t"])
    expect(rejected.filter((r) => r.status === 401 && r.reason === "unauthorized" && r.route === "/wait").length).toBe(2)
    expect(rejected).toContainEqual(expect.objectContaining({ method: "POST", route: "/events", status: 403, reason: "origin" }))
    expect(rejected).toContainEqual(expect.objectContaining({ method: "GET", route: "/status", status: 403, reason: "wrong_credential" }))
    expect(rejected).toContainEqual(expect.objectContaining({ method: "GET", route: "/status", status: 403, reason: "browser_origin" }))
    expect(rejected).toContainEqual(expect.objectContaining({ method: "GET", route: "/state/session.json", status: 404, reason: "not found" }))
    expect(agentLog).not.toContain(agent.pageToken)
    expect(agentLog).not.toContain(agent.agentToken)
    expect(agentLog).not.toContain("token=")
  })

  test("a 3 MB batch returns 413; a 100 KB non-frame batch returns 413 with the 64 KB cap; a lone 1.5 MB frame is accepted", async () => {
    const agent = await startAgent()
    const page = pageFor(agent.url, agent.pageToken)
    const frame = page.envelope("frame", { id: "f-ok", t: 2, route: "/", kind: "gesture", jpeg_base64: "B".repeat(Math.floor(1.5 * 1024 * 1024)) })
    const accepted = await page.post(frame)
    expect(accepted.status).toBe(200)
    expect(accepted.body.acked_seq).toBe(frame.seq)

    const big = page.envelope("frame", { id: "f-big", t: 1, route: "/", kind: "periodic", jpeg_base64: "A".repeat(3 * 1024 * 1024) })
    const tooBig = await page.postRaw(JSON.stringify([big]))
    expect(tooBig.status).toBe(413)
    expect(typeof tooBig.body.max_bytes).toBe("number")

    const batch = Array.from({ length: 40 }, (_, i) => page.envelope("transcript", { id: `tr-${i}`, role: "riffer", text: "x".repeat(2600), t_start: i, t_end: i + 1, final: true }))
    const overCap = await page.postRaw(JSON.stringify(batch))
    expect(overCap.status).toBe(413)
    expect(overCap.body).toEqual({ max_bytes: 64 * 1024 })
    // Refused bodies do not count: the ack stays where the accepted frame left it.
    expect((await agent.statusHttp()).body.acked_seq).toBe(frame.seq)

    // A frame batched with another envelope is refused (KTD2: frames post alone).
    const mixed = await page.postRaw(JSON.stringify([page.envelope("mic", { state: "granted" }), page.envelope("frame", { id: "f-2", t: 3, route: "/", kind: "gesture", jpeg_base64: "QQ==" })]))
    expect(mixed.status).toBe(400)
  })

  test("the start envelope omits agent_token, state/ is 0700, and state/session.json is 0600 with the I4 fields", async () => {
    const agent = await startAgent()
    expect(Object.keys(agent.startEnvelope).sort()).toEqual(["page_token", "port", "status", "url"])
    expect(agent.startEnvelope.status).toBe("started")
    expect((await fs.stat(agent.stateDir)).mode & 0o777).toBe(0o700)
    expect((await fs.stat(path.join(agent.stateDir, "session.json"))).mode & 0o777).toBe(0o600)
    const session = await agent.session()
    for (const key of ["page_token", "agent_token", "url", "app_origin", "port", "pid", "owner_pid", "ended"]) expect(session).toHaveProperty(key)
    expect(session.ended).toBe(false)
    expect(session.app_origin).toBe(APP_ORIGIN)
    expect(session.agent_token).not.toBe(session.page_token)
    // A second start against a running root reports it without minting.
    const again = await runHelper(["start", "--root", agent.root, "--app-origin", APP_ORIGIN])
    expect(again.exitCode).toBe(0)
    const envelope = parseJsonLine(again.stdout)
    expect(envelope.status).toBe("running")
    expect(envelope.page_token).toBe(agent.pageToken)
    expect(envelope).not.toHaveProperty("agent_token")
  })
})

describe("live endpoint: session end, stop, replay (KTD18, KTD22)", () => {
  test("I4 token lifecycle: /session/end ends the board but retires no token; the ended session id is 410 on page routes; the agent token serves and acks final, wait then exits 1, status and re-ack still work, and stop retires it (KTD18)", async () => {
    const agent = await startAgent()
    const page = pageFor(agent.url, agent.pageToken)
    await page.openStream()
    await page.sendUnit("u1", "make the header red")
    await page.send("unit_update", { unit_id: "u1", confirmed: { element: true, change: true } })

    const archive = new TextEncoder().encode("PK\u0003\u0004fake-zip-archive-bytes")
    const ended = await page.endSession(archive, "application/zip")
    expect(ended.status).toBe(200)
    expect(ended.body.status).toBe("session-ended")
    expect(ended.body.archive_bytes).toBe(archive.byteLength)
    const stored = await fs.readFile(path.join(agent.stateDir, "log", "archive.zip"))
    expect(Buffer.from(stored).equals(Buffer.from(archive))).toBe(true)
    await page.waitForEvent((event) => event.event === "session_ended")
    await page.closeStream()

    const session = await agent.session()
    expect(session.ended).toBe(true)
    expect(session.page_token).toBe(agent.pageToken)
    expect(session.agent_token).toBe(agent.agentToken)
    // The ended session id is refused on every page route...
    expect((await page.send("mic", { state: "muted" })).status).toBe(410)
    expect((await page.mint()).status).toBe(410)
    // ...while the agent token serves the final batch.
    const final = await agent.waitCli()
    expect(final.exitCode, final.stderr).toBe(0)
    const envelope = final.envelope as { kind: string; checkpoint_id: string; units: Array<{ id: string; confirmed: unknown }> }
    expect(envelope.kind).toBe("final")
    expect(envelope.units.map((unit) => unit.id)).toEqual(["u1"])
    expect(envelope.units[0].confirmed).toEqual({ element: true, change: true })
    // Ack first, then status-post: the token is not retired by the ack (I4).
    expectOk(await agent.ack(envelope.checkpoint_id))
    expectOk(await agent.postStatus("u1", "applied", { note: "done in the final pass" }))
    // Drained: wait is session-ended (exit 1) with the still-valid token; status keeps working; a re-ack is idempotent.
    const drained = await agent.waitHttp()
    expect(drained.status).toBe(410)
    expect(drained.body).toEqual({ status: "session-ended" })
    const drainedCli = await agent.waitCli()
    expect(drainedCli.exitCode).toBe(1)
    expect(drainedCli.envelope).toEqual({ status: "session-ended" })
    const status = await agent.statusHttp()
    expectOk(status)
    expect((status.body.units as { by_status: Record<string, number> }).by_status).toEqual({ applied: 1 })
    expect(await agent.statusCli()).toMatchObject({ status: "running", session_ended: true })
    expect(await agent.ack(envelope.checkpoint_id)).toMatchObject({ status: 200, body: { already_acked: true } })
    expect((await agent.board()).acked_checkpoint_ids).toEqual([envelope.checkpoint_id])
    expect((await agent.session()).agent_token).toBe(agent.agentToken)

    // stop is the explicit end: both tokens gone, batches/ dropped, log/ kept, agent routes rejected.
    const stopped = await agent.stopCli()
    expect(stopped.exitCode).toBe(0)
    const after = await agent.session()
    expect(after.agent_token).toBeNull()
    expect(after.page_token).toBeNull()
    expect(await fs.exists(path.join(agent.stateDir, "batches"))).toBe(false)
    expect(await fs.exists(path.join(agent.stateDir, "log", "events.ndjson"))).toBe(true)
    expect(await fs.exists(path.join(agent.stateDir, "log", "archive.zip"))).toBe(true)
    const afterStop = await agent.waitCli()
    expect(afterStop.exitCode).toBe(1)
    expect(afterStop.envelope).toEqual({ status: "session-ended" })
    expect(await agent.listening()).toBe(false)

    // A start on the ended, drained root is a fresh session, not a resume.
    const fresh = await agent.restart()
    expect(fresh.status).toBe("started")
    expect(fresh.page_token).not.toBe(session.page_token)
    expect(agent.agentToken).not.toBe(session.agent_token)
    expect((await agent.statusHttp()).body.ended).toBe(false)
  })

  test("GET /session reports live, then ended with accepts_new_session once drained; it binds no session id; 401 without the page token, 403 with the agent token", async () => {
    const agent = await startAgent()
    const probe = (headers: Record<string, string>) =>
      fetch(`${agent.url}/session`, { headers: { Origin: APP_ORIGIN, ...headers } }).then(async (response) => ({ response, body: await response.json() }))
    const pageAuth = { Authorization: `Bearer ${agent.pageToken}` }

    const fresh = await probe(pageAuth)
    expect(fresh.response.status).toBe(200)
    expect(fresh.response.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN)
    expect(fresh.body).toEqual({ status: "live", session_id: null, accepts_new_session: false })
    // No session header needed, and none is bound by one.
    expect((await probe({ ...pageAuth, "X-Riffrec-Session": "sess_probe" })).body.session_id).toBeNull()
    expect((await agent.board()).session_id).toBeNull()

    const preflight = await fetch(`${agent.url}/session`, { method: "OPTIONS", headers: { Origin: APP_ORIGIN, "Access-Control-Request-Method": "GET" } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN)

    expect((await probe({})).response.status).toBe(401)
    expect((await probe({ Authorization: "Bearer not-a-token" })).response.status).toBe(401)
    const wrong = await probe({ Authorization: `Bearer ${agent.agentToken}` })
    expect(wrong.response.status).toBe(403)
    expect(wrong.body).toMatchObject({ reason: "wrong_credential" })

    const page = pageFor(agent.url, agent.pageToken)
    await page.sendUnit("u1", "make the header red")
    expect((await probe(pageAuth)).body).toEqual({ status: "live", session_id: page.sessionId, accepts_new_session: false })
    expectOk(await page.endSession("{}", "application/json"))
    // The final batch is still held: ended, but not yet open to a new session.
    expect((await probe(pageAuth)).body).toEqual({ status: "ended", session_id: page.sessionId, accepts_new_session: false })
    const final = await agent.waitHttp()
    expectOk(await agent.ack(final.envelope!.checkpoint_id))
    // Acknowledged, but u1 is still the agent's to finish: not drained until its status is terminal.
    expect((await probe(pageAuth)).body).toEqual({ status: "ended", session_id: page.sessionId, accepts_new_session: false })
    expectOk(await agent.postStatus("u1", "applied"))
    expect((await probe(pageAuth)).body).toEqual({ status: "ended", session_id: page.sessionId, accepts_new_session: true })
  })

  test("polling GET /session is not activity: the idle timeout still stops the endpoint", async () => {
    const agent = await startAgent({ env: { CE_LIVE_IDLE_TIMEOUT_MS: "1500", CE_LIVE_LIFECYCLE_CHECK_MS: "100" } })
    const started = Date.now()
    while (await agent.listening()) {
      await fetch(`${agent.url}/session`, { headers: { Authorization: `Bearer ${agent.pageToken}` } }).catch(() => undefined)
      expect(Date.now() - started).toBeLessThan(10_000)
      await Bun.sleep(100)
    }
  })

  test("a new session id on an ended, drained board opens a fresh board with the same link: 200, board reset, log rotated, and wait serves the new session", async () => {
    const agent = await startAgent()
    const first = pageFor(agent.url, agent.pageToken, "sess_first")
    await first.sendUnit("u1", "make the header red")
    expectOk(await first.endSession("PK\u0003\u0004first-archive", "application/zip"))
    const final = await agent.waitHttp()
    expect(final.envelope!.kind).toBe("final")
    expectOk(await agent.ack(final.envelope!.checkpoint_id))
    expect((await agent.waitCli()).exitCode).toBe(1)

    // The ack alone does not drain the session: u1 is still triaging, so a new
    // session id is refused until the agent's close-out has moved it.
    const tooEarly = await pageFor(agent.url, agent.pageToken, "sess_second").sendUnit("u2", "make the footer blue")
    expect(tooEarly.status).toBe(409)
    expect(tooEarly.body).toEqual({ error: "previous_session_draining" })
    expectOk(await agent.postStatus("u1", "blocked", { note: "session ended before apply" }))
    expect(await agent.board()).toMatchObject({ session_id: "sess_first", ended: true })

    const second = pageFor(agent.url, agent.pageToken, "sess_second")
    await second.openStream()
    expect(second.ackedSeq).toBe(0)
    const opened = await second.sendUnit("u2", "make the footer blue")
    expectOk(opened)
    expect(opened.body.acked_seq).toBe(1)

    const board = await agent.board()
    expect(board).toMatchObject({ session_id: "sess_second", ended: false, acked_seq: 1, acked_checkpoint_ids: [] })
    expect(Object.keys(board.units as Record<string, unknown>)).toEqual(["u2"])
    const session = await agent.session()
    expect(session).toMatchObject({ ended: false, page_token: agent.pageToken, agent_token: agent.agentToken })
    expect(await agent.statusCli()).toMatchObject({ status: "running", session_ended: false })

    // The ended session's log moved aside; the new log starts with the opening.
    const rotated = (await fs.readdir(agent.stateDir)).filter((name) => name.startsWith("log-ended-"))
    expect(rotated).toHaveLength(1)
    expect(await fs.exists(path.join(agent.stateDir, rotated[0], "archive.zip"))).toBe(true)
    expect(await fs.exists(path.join(agent.stateDir, "log", "archive.zip"))).toBe(false)
    const agentLog = (await fs.readFile(path.join(agent.stateDir, "log", "agent.ndjson"), "utf8")).trim().split("\n").map((line) => JSON.parse(line))
    expect(agentLog[0]).toMatchObject({ kind: "session_opened", session_id: "sess_second" })
    const events = (await fs.readFile(path.join(agent.stateDir, "log", "events.ndjson"), "utf8")).trim().split("\n").map((line) => JSON.parse(line))
    expect(events.map((event) => [event.seq, event.payload.id])).toEqual([[1, "u2"]])

    // wait parks for, and serves, the new session.
    const parked = agent.waitCli()
    await Bun.sleep(200)
    expectOk(await second.sendCheckpoint("ck2", "silence", "smart"))
    const served = await parked
    expect(served.exitCode, served.stderr).toBe(0)
    const envelope = served.envelope as { checkpoint_id: string; units: Array<{ id: string }> }
    expect(envelope.checkpoint_id).toBe("ck2")
    expect(envelope.units.map((unit) => unit.id)).toEqual(["u2"])

    // The ended id stays refused, and the new session owns the board.
    expect((await first.send("mic", { state: "muted" })).status).toBe(409)
  })

  test("a new session id while the ended session still holds a batch answers 409 previous_session_draining and changes nothing; the ended id stays 410", async () => {
    const agent = await startAgent()
    const first = pageFor(agent.url, agent.pageToken, "sess_first")
    await first.sendUnit("u1", "make the header red")
    expectOk(await first.endSession("{}", "application/json"))

    const second = pageFor(agent.url, agent.pageToken, "sess_second")
    for (const attempt of [() => second.sendUnit("u2", "make the footer blue"), () => second.mint(), () => second.endSession("{}", "application/json")]) {
      const refused = await attempt()
      expect(refused.status).toBe(409)
      expect(refused.body).toEqual({ error: "previous_session_draining" })
    }
    const stream = await fetch(`${agent.url}/stream`, { headers: second.headers() })
    expect(stream.status).toBe(409)
    expect(await stream.json()).toEqual({ error: "previous_session_draining" })
    expect((await first.send("mic", { state: "muted" })).status).toBe(410)

    expect(await agent.board()).toMatchObject({ session_id: "sess_first", ended: true })
    expect((await fs.readdir(agent.stateDir)).filter((name) => name.startsWith("log-ended-"))).toEqual([])
    // The held batch is still served; once it is acked and its unit is terminal the new session opens.
    const final = await agent.waitHttp()
    expect(final.envelope!.kind).toBe("final")
    expectOk(await agent.ack(final.envelope!.checkpoint_id))
    expectOk(await agent.postStatus("u1", "applied"))
    expectOk(await second.sendUnit("u2", "make the footer blue"))
    expect(await agent.board()).toMatchObject({ session_id: "sess_second", ended: false })
  })

  test("/mint that completes after /session/end answers 410 and mints nothing usable", async () => {
    const openai = startOpenAI()
    const agent = await startAgent({ env: { OPENAI_API_KEY: "sk-stub-key-for-tests-0123456789abcdef", OPENAI_BASE_URL: openai.baseUrl } })
    const page = pageFor(agent.url, agent.pageToken)
    openai.respondWith(200, { value: "ek_test_minted_after_end", expires_at: 1789686600, session: { model: "gpt-realtime" } }, 400)
    const inFlight = page.mint()
    await waitUntil(() => openai.requests.length === 1)
    expectOk(await page.endSession("{}", "application/json"))
    const minted = await inFlight
    expect(minted.status, JSON.stringify(minted.body)).toBe(410)
    expect(minted.body).toEqual({ status: "session-ended" })
    expect(JSON.stringify(minted.body)).not.toContain("ek_test_minted_after_end")
  })

  test("a storage failure answers 500 storage_failed with the last durable acked_seq; the same seq is accepted on retry and the batch is served once", async () => {
    const agent = await startAgent()
    const page = pageFor(agent.url, agent.pageToken)
    expectOk(await page.sendUnit("u1", "make the header red"))
    // A checkpoint persists a batch file; a regular file where batches/ should be makes that write fail.
    const batchesDir = path.join(agent.stateDir, "batches")
    await fs.rm(batchesDir, { recursive: true, force: true })
    await fs.writeFile(batchesDir, "not a directory")
    const checkpoint = page.envelope("checkpoint", { id: "ck1", trigger: "silence", mode: "smart" })
    const failed = await page.post(checkpoint)
    expect(failed.status).toBe(500)
    expect(failed.body).toMatchObject({ error: "storage_failed", acked_seq: 1 })
    expect(typeof failed.body.code).toBe("string")
    expect((await agent.statusHttp()).body.acked_seq).toBe(1)
    expect((await agent.waitHttp()).status).toBe(204)
    await fs.rm(batchesDir, { force: true })
    await fs.mkdir(batchesDir, { recursive: true })
    const retried = await page.post(checkpoint)
    expectOk(retried)
    expect(retried.body.acked_seq).toBe(2)
    const wake = await agent.waitHttp()
    expect(wake.status).toBe(200)
    expect(wake.envelope!.checkpoint_id).toBe("ck1")
    expect(wake.envelope!.units.map((unit) => unit.id)).toEqual(["u1"])
    // One log line per seq, no duplicate from the failed attempt.
    const log = (await fs.readFile(path.join(agent.stateDir, "log", "events.ndjson"), "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { seq: number })
    expect(log.map((line) => line.seq)).toEqual([1, 2])
  })

  test("unit_update refines statement and anchors only while the unit is initial and unreleased; confirmed applies at any time (KTD5, KTD22)", async () => {
    const agent = await startAgent()
    const page = pageFor(agent.url, agent.pageToken)
    expectOk(await page.sendUnit("u1", "make the header red"))
    expectOk(await page.send("unit_update", { unit_id: "u1", statement: "make the header dark red", anchors_add: [{ route: "/", selector: "header h1", rect: { x: 0, y: 0, width: 50, height: 20 }, t: 2 }] }))
    let unit = ((await agent.statusHttp()).body.units as { list: Array<{ id: string; statement: string }> }).list[0]
    expect(unit.statement).toBe("make the header dark red")
    expectOk(await page.sendCheckpoint("ck1", "silence", "smart"))
    const wake = await agent.waitHttp()
    expect(wake.envelope!.units[0]).toMatchObject({ id: "u1", statement: "make the header dark red" })
    expect((wake.envelope!.units[0] as { anchors: unknown[] }).anchors).toHaveLength(2)
    expectOk(await agent.ack("ck1"))
    // Released: the wording is frozen, the confirmation still lands.
    expectOk(await page.send("unit_update", { unit_id: "u1", statement: "actually make it blue", confirmed: { element: true, change: false } }))
    unit = ((await agent.statusHttp()).body.units as { list: Array<{ id: string; statement: string; confirmed: unknown }> }).list[0]
    expect(unit).toMatchObject({ statement: "make the header dark red", confirmed: { element: true, change: false } })
  })

  test("a frame the page dropped for quota or size is accepted with its metadata and no image bytes", async () => {
    const agent = await startAgent()
    const page = pageFor(agent.url, agent.pageToken)
    const frame = await readFixture("frame")
    const dropped = page.envelope("frame", { ...frame.payload, id: "frame_dropped", jpeg_base64: "", dropped: "quota" })
    expectOk(await page.post(dropped))
    expect((await page.post(page.envelope("frame", { ...frame.payload, id: "frame_bad", dropped: "because" }))).body).toMatchObject({ reason: "invalid_payload" })
    expect((await agent.statusHttp()).body.frame_count).toBe(1)
    const framesDir = path.join(agent.stateDir, "log", "frames")
    const files = await fs.readdir(framesDir).catch(() => [] as string[])
    expect(files.filter((name) => name.includes("frame_dropped"))).toEqual([])
    const log = (await fs.readFile(path.join(agent.stateDir, "log", "events.ndjson"), "utf8")).trim().split("\n").map((line) => JSON.parse(line))
    expect(log[0]).toMatchObject({ type: "frame", frame_file: null, payload: { id: "frame_dropped", dropped: "quota" } })
  })

  test("replay --profile anchors_transcript_only re-emits the log to a second helper with frames and telemetry stripped", async () => {
    const source = await startAgent()
    const page = pageFor(source.url, source.pageToken)
    const fixtures = await Promise.all(["transcript", "unit", "annotation", "frame", "click", "navigation", "network-request", "console-error"].map(readFixture))
    for (const fixture of fixtures) expectOk(await page.post(page.fromFixture(fixture)))
    await page.sendUnit("u2", "second unit", { evidence: { frame_ids: ["frame_0007"], annotation_ids: ["ann_0001"], transcript_span: { t_start: 0, t_end: 1 }, audio_clip_id: "clip_0002" } })
    await page.sendCheckpoint("ck1", "silence", "smart")
    expect((await source.statusHttp()).body.frame_count).toBe(1)

    const target = await startAgent()
    const replayed = await source.replayCli("anchors_transcript_only", target.url, target.pageToken)
    expect(replayed.exitCode, replayed.stderr).toBe(0)
    const summary = parseJsonLine(replayed.stdout)
    expect(summary.status).toBe("replayed")
    expect(summary.profile).toBe("anchors_transcript_only")
    // Skipped: the frame, the annotation, and the four telemetry envelopes.
    expect(summary.envelopes_skipped).toBe(6)
    expect(summary.envelopes_sent).toBe(4)

    const targetStatus = (await target.statusHttp()).body
    expect(targetStatus.frame_count).toBe(0)
    expect(targetStatus.annotations).toBe(0)
    expect(targetStatus.transcript_count).toBe(1)
    expect((targetStatus.units as { total: number }).total).toBe(2)
    const targetBoard = (await target.board()) as { units: Record<string, { evidence: Record<string, unknown> }> }
    for (const id of ["unit_0001", "u2"]) {
      expect(targetBoard.units[id].evidence.frame_ids).toEqual([])
      expect(targetBoard.units[id].evidence.annotation_ids).toEqual([])
      expect(targetBoard.units[id].evidence).not.toHaveProperty("audio_clip_id")
      expect(targetBoard.units[id].evidence).not.toHaveProperty("telemetry_window")
    }
    const targetLog = await fs.readFile(path.join(target.stateDir, "log", "events.ndjson"), "utf8")
    expect(targetLog).not.toContain('"type":"frame"')
    for (const telemetry of ["click", "navigation", "network_request", "console_error"]) expect(targetLog).not.toContain(`"type":"${telemetry}"`)
    expect(await fs.readdir(path.join(target.stateDir, "log", "frames"))).toEqual([])
    // The replayed checkpoint released both units to the target's own wake.
    const wake = await target.waitHttp()
    expect(wake.status).toBe(200)
    expect(wake.envelope!.units.map((unit) => unit.id).sort()).toEqual(["u2", "unit_0001"])
  })
})

describe("live endpoint: agent state, working status, closed tabs", () => {
  test("the stream reports the agent listening while a wait is parked and working once a batch is served", async () => {
    const agent = await startAgent()
    const page = pageFor(agent.url, agent.pageToken)
    await page.sendUnit("u1", "make the header red")
    await page.openStream()

    const parked = agent.waitHttp()
    await page.waitForEvent((event) => event.event === "agent" && (event.data as { state: string }).state === "listening")
    expectOk(await page.sendCheckpoint("cp_0001", "silence", "smart"))
    const wake = await parked
    expect(wake.status).toBe(200)
    const working = await page.waitForEvent((event) => event.event === "agent" && (event.data as { state: string }).state === "working")
    expect((working.data as { checkpoint_id: string }).checkpoint_id).toBe("cp_0001")
  })

  test("accepts working as a unit status and streams it to the page", async () => {
    const agent = await startAgent()
    const page = pageFor(agent.url, agent.pageToken)
    await page.sendUnit("u1", "make the header red")
    expectOk(await page.sendCheckpoint("cp_0001", "silence", "smart"))
    const wake = await agent.waitHttp()
    expectOk(await agent.ack(wake.envelope!.checkpoint_id))
    await page.openStream()

    expectOk(await agent.postStatus("u1", "working"))
    const event = await page.waitForEvent((e) => e.event === "unit_status" && (e.data as { status: string }).status === "working")
    expect((event.data as { unit_id: string }).unit_id).toBe("u1")
  })

  test("a page whose tab closed gives way to a new session; a live page still refuses one", async () => {
    const agent = await startAgent()
    const first = pageFor(agent.url, agent.pageToken, "sess_first")
    await first.sendUnit("u1", "make the header red")
    await first.openStream()

    const rival = pageFor(agent.url, agent.pageToken, "sess_second")
    const refused = await rival.send("mic", { state: "unmuted" })
    expect(refused.status).toBe(409)

    expectOk(await first.send("stream_state", { state: "unloading" }))
    await first.closeStream()
    await waitUntil(async () => ((await agent.board()) as { page: { stream: string } }).page.stream !== "connected")

    const takeover = await rival.send("mic", { state: "unmuted" })
    expectOk(takeover)
    expect(((await agent.board()) as { session_id: string }).session_id).toBe("sess_second")
  })
})

async function collectFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await collectFiles(full)))
    else out.push(full)
  }
  return out
}