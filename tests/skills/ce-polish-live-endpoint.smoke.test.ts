import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"

setDefaultTimeout(20_000)
import { promises as fs } from "fs"
import os from "os"
import path from "path"

// Smoke coverage for skills/ce-polish/scripts/live-endpoint.js: the start
// envelope, credential classes, one checkpoint -> wake -> ack round trip,
// and the CLI lifecycle. The full scenario suite lives in
// ce-polish-live-endpoint.test.ts.

const script = path.join(import.meta.dir, "..", "..", "skills", "ce-polish", "scripts", "live-endpoint.js")
const APP_ORIGIN = "http://localhost:3000"
const rootsToStop: string[] = []

type Run = { exitCode: number; stdout: string; stderr: string }

async function run(args: string[], env: Record<string, string> = {}): Promise<Run> {
  const proc = Bun.spawn(["node", script, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, CE_LIVE_WAIT_TIMEOUT_MS: "2000", ...env },
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

async function startEndpoint(): Promise<{ root: string; url: string; pageToken: string; agentToken: string; envelope: Record<string, unknown> }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-polish-live-"))
  rootsToStop.push(root)
  const result = await run(["start", "--root", root, "--app-origin", APP_ORIGIN, "--port", "0"])
  expect(result.exitCode, result.stderr).toBe(0)
  const envelope = JSON.parse(result.stdout.trim())
  const session = JSON.parse(await fs.readFile(path.join(root, "state", "session.json"), "utf8"))
  return { root, url: String(envelope.url), pageToken: String(envelope.page_token), agentToken: String(session.agent_token), envelope }
}

afterEach(async () => {
  while (rootsToStop.length > 0) {
    const root = rootsToStop.pop()!
    await run(["stop", "--root", root])
    await fs.rm(root, { recursive: true, force: true })
  }
})

function envelope(sessionId: string, seq: number, type: string, payload: object) {
  return { schema_version: "live/1", session_id: sessionId, seq, t: Date.now(), type, payload }
}

describe("ce-polish live endpoint smoke", () => {
  test("start prints the page token only and writes a private session file", async () => {
    const { root, envelope: started } = await startEndpoint()
    expect(started.page_token).toBeString()
    expect(started).not.toHaveProperty("agent_token")
    const stateMode = (await fs.stat(path.join(root, "state"))).mode & 0o777
    const sessionMode = (await fs.stat(path.join(root, "state", "session.json"))).mode & 0o777
    expect(stateMode).toBe(0o700)
    expect(sessionMode).toBe(0o600)
    const status = await run(["status", "--root", root])
    expect(status.exitCode).toBe(0)
    const board = JSON.parse(status.stdout.trim())
    expect(board.status).toBe("running")
    expect(board.board.units.total).toBe(0)
  })

  test("credential classes and CORS follow the contract", async () => {
    const { url, pageToken, agentToken } = await startEndpoint()
    const noCred = await fetch(`${url}/events`, { method: "POST", body: "[]" })
    expect(noCred.status).toBe(401)
    const queryToken = await fetch(`${url}/status?token=${agentToken}`)
    expect(queryToken.status).toBe(401)
    const pageOnAgent = await fetch(`${url}/status`, { headers: { Authorization: `Bearer ${pageToken}` } })
    expect(pageOnAgent.status).toBe(403)
    const agentOnPage = await fetch(`${url}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${agentToken}`, "X-Riffrec-Session": "s1" },
      body: "[]",
    })
    expect(agentOnPage.status).toBe(403)
    const browserOnAgent = await fetch(`${url}/status`, { headers: { Authorization: `Bearer ${agentToken}`, Origin: APP_ORIGIN } })
    expect(browserOnAgent.status).toBe(403)
    const preflight = await fetch(`${url}/events`, { method: "OPTIONS", headers: { Origin: APP_ORIGIN } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN)
    expect(preflight.headers.get("access-control-allow-headers")).toBe("Authorization, Content-Type, X-Riffrec-Session, X-Riffrec-OpenAI-Key")
    expect(preflight.headers.get("access-control-allow-credentials")).toBeNull()
    expect(preflight.headers.get("vary")).toBe("Origin")
    const notServed = await fetch(`${url}/state/session.json`)
    expect(notServed.status).toBe(404)
  })

  test("a checkpoint releases held units to one wake, which is re-served until acknowledged", async () => {
    const { root, url, pageToken, agentToken } = await startEndpoint()
    const sessionId = "s1"
    const page = { Authorization: `Bearer ${pageToken}`, "X-Riffrec-Session": sessionId, "Content-Type": "application/json" }
    const agent = { Authorization: `Bearer ${agentToken}`, "Content-Type": "application/json" }
    const unit = (id: string, seq: number) =>
      envelope(sessionId, seq, "unit", { id, statement: `change ${id}`, transcript_excerpt: id, anchors: [], evidence: { frame_ids: [], annotation_ids: [], transcript_span: { t_start: 0, t_end: 1 } }, status: "initial" })

    const posted = await fetch(`${url}/events`, { method: "POST", headers: page, body: JSON.stringify([unit("u1", 1), unit("u2", 2)]) })
    expect(await posted.json()).toEqual({ acked_seq: 2 })

    const wrongSchema = await fetch(`${url}/events`, {
      method: "POST",
      headers: page,
      body: JSON.stringify([{ ...unit("u3", 3), schema_version: "live/0" }]),
    })
    expect(wrongSchema.status).toBe(409)
    expect(await wrongSchema.json()).toEqual({ expected_schema_version: "live/1" })

    const emptyCheckpoint = await fetch(`${url}/events`, {
      method: "POST",
      headers: page,
      body: JSON.stringify([envelope(sessionId, 3, "checkpoint", { id: "ck0", trigger: "silence", mode: "smart" })]),
    })
    expect(emptyCheckpoint.status).toBe(200)
    // ck0 released u1 and u2; the next checkpoint holds nothing and must not wake.
    const secondEmpty = await fetch(`${url}/events`, {
      method: "POST",
      headers: page,
      body: JSON.stringify([envelope(sessionId, 4, "checkpoint", { id: "ck1", trigger: "send", mode: "collect" })]),
    })
    expect(secondEmpty.status).toBe(200)

    const first = await run(["wait", "--root", root])
    expect(first.exitCode, first.stderr).toBe(0)
    const wake = JSON.parse(first.stdout.trim())
    expect(wake.checkpoint_id).toBe("ck0")
    expect(wake.kind).toBe("silence")
    expect(wake.mode_at_checkpoint).toBe("smart")
    expect(wake.session_status).toBe("live")
    expect(wake.units.map((u: { id: string; status: string }) => `${u.id}:${u.status}`)).toEqual(["u1:triaging", "u2:triaging"])

    const reserved = await fetch(`${url}/wait`, { headers: agent })
    expect(reserved.status).toBe(200)
    expect((await reserved.json()).checkpoint_id).toBe("ck0")

    const ack = await fetch(`${url}/checkpoints/ck0/ack`, { method: "POST", headers: agent, body: "{}" })
    expect(ack.status).toBe(200)
    // ck1 released nothing, so the wake now parks and times out.
    const idle = await fetch(`${url}/wait`, { headers: agent })
    expect(idle.status).toBe(204)

    const stopped = await run(["stop", "--root", root])
    expect(stopped.exitCode).toBe(0)
    const session = JSON.parse(await fs.readFile(path.join(root, "state", "session.json"), "utf8"))
    expect(session.ended).toBe(true)
    expect(session.page_token).toBeNull()
    expect(session.agent_token).toBeNull()
    expect(await fs.exists(path.join(root, "state", "batches"))).toBe(false)
    expect(await fs.exists(path.join(root, "state", "log", "events.ndjson"))).toBe(true)
    const afterStop = await run(["wait", "--root", root])
    expect(afterStop.exitCode).toBe(1)
    expect(JSON.parse(afterStop.stdout.trim())).toEqual({ status: "session-ended" })
  })

  test("leaving Collect and the page's final checkpoint always wake, carrying the accepted backlog", async () => {
    const { url, pageToken, agentToken } = await startEndpoint()
    const sessionId = "s2"
    const page = { Authorization: `Bearer ${pageToken}`, "X-Riffrec-Session": sessionId, "Content-Type": "application/json" }
    const agent = { Authorization: `Bearer ${agentToken}`, "Content-Type": "application/json" }
    const post = (body: object) => fetch(`${url}/events`, { method: "POST", headers: page, body: JSON.stringify(body) })
    const wake = async () => {
      const response = await fetch(`${url}/wait`, { headers: agent })
      expect(response.status).toBe(200)
      const batch = await response.json()
      await fetch(`${url}/checkpoints/${batch.checkpoint_id}/ack`, { method: "POST", headers: agent, body: "{}" })
      return batch
    }
    const unit = (id: string, seq: number) =>
      envelope(sessionId, seq, "unit", { id, statement: id, transcript_excerpt: id, anchors: [], evidence: { frame_ids: [], annotation_ids: [], transcript_span: { t_start: 0, t_end: 1 } }, status: "initial" })

    await post([envelope(sessionId, 1, "mode", { mode: "collect" }), unit("a", 2), unit("b", 3), envelope(sessionId, 4, "checkpoint", { id: "ck-send", trigger: "send", mode: "collect" })])
    expect((await wake()).units.map((u: { id: string }) => u.id)).toEqual(["a", "b"])
    for (const id of ["a", "b"]) {
      await fetch(`${url}/units/${id}/status`, { method: "POST", headers: agent, body: JSON.stringify({ status: "accepted" }) })
    }

    await post([envelope(sessionId, 5, "mode", { mode: "smart" })])
    const modeChange = await wake()
    expect(modeChange.kind).toBe("mode_change")
    expect(modeChange.mode_at_checkpoint).toBe("smart")
    expect(modeChange.units.map((u: { id: string; status: string }) => `${u.id}:${u.status}`)).toEqual(["a:accepted", "b:accepted"])

    await fetch(`${url}/units/a/status`, { method: "POST", headers: agent, body: JSON.stringify({ status: "applied" }) })
    await post([envelope(sessionId, 6, "checkpoint", { id: "ck-final", trigger: "final", mode: "smart" })])
    const final = await wake()
    expect(final.checkpoint_id).toBe("ck-final")
    expect(final.kind).toBe("final")
    expect(final.units.map((u: { id: string; status: string }) => `${u.id}:${u.status}`)).toEqual(["b:accepted"])
  })

  test("Instant releases every unit as it lands, pushes triaging on the stream before any ack, and a switch to Instant flushes what Smart was holding", async () => {
    const { url, pageToken, agentToken } = await startEndpoint()
    const sessionId = "s3"
    const page = { Authorization: `Bearer ${pageToken}`, "X-Riffrec-Session": sessionId, "Content-Type": "application/json" }
    const agent = { Authorization: `Bearer ${agentToken}`, "Content-Type": "application/json" }
    const post = (body: object) => fetch(`${url}/events`, { method: "POST", headers: page, body: JSON.stringify(body) })
    const unit = (id: string, seq: number) =>
      envelope(sessionId, seq, "unit", { id, statement: id, transcript_excerpt: id, anchors: [], evidence: { frame_ids: [], annotation_ids: [], transcript_span: { t_start: 0, t_end: 1 } }, status: "initial" })

    // The page's stream, read as riffrec's client does: reconnect after each
    // response the helper ends (it ends one after every delivery so buffering
    // proxies flush it), and note each unit's transitions once, in arrival
    // order; the reconnect replay repeats the current status and is ignored.
    const statuses: string[] = []
    let responses = 0
    let streaming = true
    const pump = (async () => {
      while (streaming) {
        let streamResponse: Response
        try {
          streamResponse = await fetch(`${url}/stream`, { headers: { Authorization: `Bearer ${pageToken}`, "X-Riffrec-Session": sessionId } })
        } catch {
          return
        }
        expect(streamResponse.status).toBe(200)
        responses += 1
        const reader = streamResponse.body!.getReader()
        let buffered = ""
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffered += new TextDecoder().decode(value)
          for (const m of buffered.matchAll(/event: unit_status\ndata: (.*)\n\n/g)) {
            const data = JSON.parse(m[1]) as { unit_id: string; status: string }
            const transition = `${data.unit_id}:${data.status}`
            if (!statuses.includes(transition)) statuses.push(transition)
          }
          buffered = buffered.replace(/event: unit_status\ndata: .*\n\n/g, "")
        }
        await new Promise((r) => setTimeout(r, 50))
      }
    })()
    const untilStatuses = async (n: number) => {
      const deadline = Date.now() + 5000
      while (statuses.length < n && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20))
      return statuses.slice()
    }

    // Instant: the unit alone, no checkpoint, is a wake, and the page saw triaging first.
    await post([envelope(sessionId, 1, "mode", { mode: "instant" }), unit("a", 2)])
    expect(await untilStatuses(1)).toEqual(["a:triaging"])
    const first = await fetch(`${url}/wait`, { headers: agent })
    expect(first.status).toBe(200)
    const batchA = await first.json()
    expect(batchA.kind).toBe("instant")
    expect(batchA.checkpoint_id).toBe("instant-a")
    expect(batchA.mode_at_checkpoint).toBe("instant")
    expect(batchA.units.map((u: { id: string; status: string }) => `${u.id}:${u.status}`)).toEqual(["a:triaging"])
    await fetch(`${url}/checkpoints/${batchA.checkpoint_id}/ack`, { method: "POST", headers: agent, body: "{}" })

    // Two units in one body are two wakes, in order; a later send checkpoint has nothing left and does not wake.
    await post([unit("b", 3), unit("c", 4), envelope(sessionId, 5, "checkpoint", { id: "ck-send", trigger: "send", mode: "instant" })])
    expect(await untilStatuses(3)).toEqual(["a:triaging", "b:triaging", "c:triaging"])
    const ids: string[] = []
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`${url}/wait`, { headers: agent })
      expect(response.status).toBe(200)
      const batch = await response.json()
      ids.push(`${batch.checkpoint_id}/${batch.kind}/${batch.units.map((u: { id: string }) => u.id).join(",")}`)
      await fetch(`${url}/checkpoints/${batch.checkpoint_id}/ack`, { method: "POST", headers: agent, body: "{}" })
    }
    expect(ids).toEqual(["instant-b/instant/b", "instant-c/instant/c"])
    expect((await fetch(`${url}/wait`, { headers: agent })).status).toBe(204)

    // Smart holds; switching to Instant releases what was held, as a mode_change wake.
    await post([envelope(sessionId, 6, "mode", { mode: "smart" }), unit("d", 7)])
    expect((await fetch(`${url}/wait`, { headers: agent })).status).toBe(204)
    expect(statuses).toHaveLength(3)
    await post([envelope(sessionId, 8, "mode", { mode: "instant" })])
    expect(await untilStatuses(4)).toEqual(["a:triaging", "b:triaging", "c:triaging", "d:triaging"])
    const flushed = await (await fetch(`${url}/wait`, { headers: agent })).json()
    expect(flushed.kind).toBe("mode_change")
    expect(flushed.mode_at_checkpoint).toBe("instant")
    expect(flushed.units.map((u: { id: string }) => u.id)).toEqual(["d"])
    await fetch(`${url}/checkpoints/${flushed.checkpoint_id}/ack`, { method: "POST", headers: agent, body: "{}" })

    // Each delivery ended its response (a buffering tunnel would have flushed
    // it there) and the client reopened: the three deliveries above (a; the
    // b+c burst as one; d) mean at least three responses were served.
    await new Promise((r) => setTimeout(r, 600))
    expect(responses).toBeGreaterThanOrEqual(3)
    streaming = false
    await fetch(`${url}/units/a/status`, { method: "POST", headers: agent, body: JSON.stringify({ status: "accepted" }) })
    await pump.catch(() => undefined)
  })
})
