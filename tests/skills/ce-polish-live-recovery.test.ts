import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { promises as fs } from "fs"
import http from "http"
import os from "os"
import path from "path"
import { FakeLivePage, readFixture, unitPayload } from "../helpers/fakeLivePage"
import { APP_ORIGIN, FakeLiveAgent, LIVE_ENDPOINT_SCRIPT, parseJsonLine, runHelper, waitUntil } from "../helpers/fakeLiveAgent"

setDefaultTimeout(30_000)

// Recovery and robustness scenarios for skills/ce-polish/scripts/live-endpoint.js:
// what survives a helper that dies mid-session, a disk that fails mid-write,
// a page that reconnects, a plugin checkout that moves, and a host without
// `ps`. The ordinary loop is covered by ce-polish-live-endpoint.test.ts and
// ce-polish-live-loop.test.ts.

const agents: FakeLiveAgent[] = []
const pages: FakeLivePage[] = []
const scratch: string[] = []

function expectOk(result: { status: number; body: Record<string, unknown> }): void {
  expect(result.status, JSON.stringify(result.body)).toBe(200)
}

async function startAgent(options: Parameters<typeof FakeLiveAgent.start>[0] = {}): Promise<FakeLiveAgent> {
  const agent = await FakeLiveAgent.start(options)
  agents.push(agent)
  return agent
}

function pageFor(agent: FakeLiveAgent, sessionId?: string): FakeLivePage {
  const page = new FakeLivePage(agent.url, agent.pageToken, sessionId)
  pages.push(page)
  return page
}

async function mkScratch(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  scratch.push(dir)
  return dir
}

/** Runs the helper from an arbitrary script path with an arbitrary PATH; `node` is resolved up front so PATH may omit it. */
async function runFrom(script: string, args: string[], env: Record<string, string | undefined> = {}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const node = Bun.which("node")
  if (!node) throw new Error("node is required on PATH for this test")
  const merged: Record<string, string> = {}
  for (const [key, value] of Object.entries({ ...process.env, CE_LIVE_WAIT_TIMEOUT_MS: "1500", CE_LIVE_LIFECYCLE_CHECK_MS: "600000", ...env })) {
    if (value !== undefined) merged[key] = value
  }
  const proc = Bun.spawn([node, script, ...args], { stdout: "pipe", stderr: "pipe", env: merged })
  const [exitCode, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  return { exitCode, stdout, stderr }
}

afterEach(async () => {
  while (pages.length > 0) await pages.pop()!.closeStream()
  while (agents.length > 0) await agents.pop()!.dispose()
  while (scratch.length > 0) await fs.rm(scratch.pop()!, { recursive: true, force: true }).catch(() => undefined)
})

describe("live endpoint recovery: an ended session resumes while close-out work remains", () => {
  test("a helper that dies after the final ack but before the unit statuses resumes with the same tokens and board; once reconciled, a start on the ended root is fresh", async () => {
    const agent = await startAgent()
    const page = pageFor(agent)
    expectOk(await page.sendUnit("u1", "make the header red"))
    expectOk(await page.endSession("{}", "application/json"))
    const final = await agent.waitHttp()
    expect(final.envelope!.kind).toBe("final")
    expectOk(await agent.ack(final.envelope!.checkpoint_id))
    // Owner death right here: the batch is acked, u1 is still triaging on the board.
    await agent.killServer()
    const pageToken = agent.pageToken
    const agentToken = agent.agentToken

    // `wait` sends the agent back to `start` rather than calling the session over.
    const dead = await agent.waitCli()
    expect(dead.exitCode).toBe(2)
    expect(dead.stderr).toMatch(/run `start --root` to resume/)

    const resumed = await agent.restart()
    expect(resumed.status).toBe("resumed")
    expect(resumed.page_token).toBe(pageToken)
    expect(agent.agentToken).toBe(agentToken)
    const board = await agent.board()
    expect(board).toMatchObject({ ended: true, acked_checkpoint_ids: [final.envelope!.checkpoint_id] })
    expect((board.units as Record<string, { status: string }>).u1.status).toBe("triaging")
    // Nothing is held, so wait is session-ended; the still-valid token reconciles the unit.
    expect((await agent.waitCli()).exitCode).toBe(1)
    expectOk(await agent.postStatus("u1", "blocked", { note: "session ended before apply" }))

    // Reconciled: the ended, drained root now starts a fresh session.
    await agent.killServer()
    expect((await agent.waitCli()).exitCode).toBe(1)
    const fresh = await agent.restart()
    expect(fresh.status).toBe("started")
    expect(fresh.page_token).not.toBe(pageToken)
    expect((await agent.board()).ended).toBe(false)
  })
})

describe("live endpoint recovery: durable acknowledgments", () => {
  test("an ack whose board save fails answers 500 and keeps the batch; a batch file that outlived its recorded ack is dropped on resume, not served again", async () => {
    const agent = await startAgent()
    const page = pageFor(agent)
    expectOk(await page.sendUnit("u1", "make the header red"))
    expectOk(await page.sendCheckpoint("ck1", "silence", "smart"))
    const wake = await agent.waitHttp()
    expect(wake.envelope!.checkpoint_id).toBe("ck1")

    // A directory where board.json should be makes the atomic rename fail.
    const boardFile = path.join(agent.stateDir, "board.json")
    const boardBackup = await fs.readFile(boardFile)
    await fs.rm(boardFile)
    await fs.mkdir(boardFile)
    const failed = await agent.ack("ck1")
    expect(failed.status).toBe(500)
    expect(failed.body).toMatchObject({ error: "storage_failed", checkpoint_id: "ck1" })
    // Not acknowledged: the batch is still on disk and still served.
    expect(await fs.exists(path.join(agent.stateDir, "batches", "ck1.json"))).toBe(true)
    expect((await agent.waitHttp()).envelope!.checkpoint_id).toBe("ck1")
    await fs.rmdir(boardFile)
    await fs.writeFile(boardFile, boardBackup)
    const retried = await agent.ack("ck1")
    expectOk(retried)
    expect((await agent.board()).acked_checkpoint_ids).toEqual(["ck1"])
    expect(await fs.exists(path.join(agent.stateDir, "batches", "ck1.json"))).toBe(false)

    // The other partial order: the ack is recorded but the batch file survived.
    const orphan = { order: 99, served: true, envelope: { ...wake.envelope, checkpoint_id: "ck1" } }
    await fs.writeFile(path.join(agent.stateDir, "batches", "ck1.json"), JSON.stringify(orphan))
    await agent.killServer()
    expect((await agent.restart()).status).toBe("resumed")
    expect((await agent.waitHttp()).status).toBe(204)
    expect(await fs.exists(path.join(agent.stateDir, "batches", "ck1.json"))).toBe(false)
    expect(await agent.ack("ck1")).toMatchObject({ status: 200, body: { already_acked: true } })
  })
})

describe("live endpoint recovery: intake", () => {
  test("a buffered envelope whose transaction fails while the gap closes leaves the buffer, so the page's retry of that seq is admitted", async () => {
    const agent = await startAgent()
    const page = pageFor(agent)
    expectOk(await page.post(page.envelope("unit", unitPayload("u1", "make the header red"), 1)))
    // seq 3 arrives ahead of seq 2 and waits in the gap buffer.
    const checkpoint = page.envelope("checkpoint", { id: "ck1", trigger: "silence", mode: "smart" }, 3)
    const early = await page.post(checkpoint)
    expectOk(early)
    expect(early.body.acked_seq).toBe(1)
    // Closing the gap drains seq 3, whose batch write fails: a regular file sits where batches/ should be.
    const batchesDir = path.join(agent.stateDir, "batches")
    await fs.rm(batchesDir, { recursive: true, force: true })
    await fs.writeFile(batchesDir, "not a directory")
    const closing = await page.post(page.envelope("unit", unitPayload("u2", "make the footer blue"), 2))
    expect(closing.status).toBe(500)
    expect(closing.body).toMatchObject({ error: "storage_failed", acked_seq: 2 })
    await fs.rm(batchesDir, { force: true })
    await fs.mkdir(batchesDir, { recursive: true })
    // The page retries from acked_seq: the same seq 3 must go through now.
    const retried = await page.post(checkpoint)
    expectOk(retried)
    expect(retried.body.acked_seq).toBe(3)
    const wake = await agent.waitHttp()
    expect(wake.status).toBe(200)
    expect(wake.envelope!.checkpoint_id).toBe("ck1")
    expect(wake.envelope!.units.map((unit) => unit.id).sort()).toEqual(["u1", "u2"])
  })

  test("at the disk cap an image frame is refused with 507 while the page's byte-free dropped replacement advances the sequence", async () => {
    const agent = await startAgent({ env: { CE_LIVE_DISK_CAP_BYTES: "1024" } })
    // The log is already over the cap when the helper (re)starts: nothing with image bytes fits any more.
    await agent.killServer()
    await fs.writeFile(path.join(agent.stateDir, "log", "frames", "earlier.jpg"), Buffer.alloc(2048, 1))
    expect((await agent.restart()).status).toBe("resumed")
    const page = pageFor(agent)
    expectOk(await page.sendUnit("u1", "make the header red"))
    const jpeg = Buffer.alloc(64, 0x42).toString("base64")
    const refused = await page.post(page.envelope("frame", { id: "frame_1", t: 1, route: "/", kind: "gesture", jpeg_base64: jpeg }, 2))
    expect(refused.status).toBe(507)
    expect(refused.body).toMatchObject({ reason: "disk_cap", acked_seq: 1 })
    // The page keeps seq 2 and re-sends it without the image.
    const replaced = await page.post(page.envelope("frame", { id: "frame_1", t: 1, route: "/", kind: "gesture", jpeg_base64: "", dropped: "quota" }, 2))
    expectOk(replaced)
    expect(replaced.body.acked_seq).toBe(2)
    expectOk(await page.sendCheckpoint("ck1", "silence", "smart"))
    expect((await agent.waitHttp()).envelope!.units.map((unit) => unit.id)).toEqual(["u1"])
  })

  test("past the hard ceiling above the image cap every envelope is refused 507 disk_cap, dropped frames included", async () => {
    const agent = await startAgent({ env: { CE_LIVE_DISK_CAP_BYTES: "1024", CE_LIVE_DISK_HARD_CAP_BYTES: "4096" } })
    // Between the two caps: images are refused, everything else flows.
    await agent.killServer()
    await fs.writeFile(path.join(agent.stateDir, "log", "frames", "earlier.jpg"), Buffer.alloc(2048, 1))
    expect((await agent.restart()).status).toBe("resumed")
    const page = pageFor(agent)
    expectOk(await page.sendUnit("u1", "make the header red"))
    expect((await page.post(page.envelope("frame", { id: "f1", t: 1, route: "/", kind: "gesture", jpeg_base64: Buffer.alloc(64, 0x42).toString("base64") }, 2))).status).toBe(507)
    expectOk(await page.post(page.envelope("frame", { id: "f1", t: 1, route: "/", kind: "gesture", jpeg_base64: "", dropped: "quota" }, 2)))
    // Past the ceiling: nothing is accepted any more, and the refusal names the ceiling.
    await agent.killServer()
    await fs.writeFile(path.join(agent.stateDir, "log", "frames", "later.jpg"), Buffer.alloc(3000, 2))
    expect((await agent.restart()).status).toBe("resumed")
    const refusedUnit = await page.sendUnit("u2", "make the footer blue")
    expect(refusedUnit.status).toBe(507)
    expect(refusedUnit.body).toMatchObject({ reason: "disk_cap", stream_state: "buffering", max_bytes: 4096 })
    const refusedDropped = await page.post(page.envelope("frame", { id: "f2", t: 2, route: "/", kind: "gesture", jpeg_base64: "", dropped: "quota" }))
    expect(refusedDropped.status).toBe(507)
    expect((await agent.statusHttp()).body.acked_seq).toBe(2)
  })

  test("envelopes buffered ahead of a sequence gap are reserved against the hard ceiling, so draining the gap cannot overshoot it", async () => {
    const agent = await startAgent({ env: { CE_LIVE_DISK_CAP_BYTES: "1024", CE_LIVE_DISK_HARD_CAP_BYTES: "3000" } })
    const page = pageFor(agent)
    // seq 1 is withheld; seq 2..8 wait in the gap buffer. Each unit is a few hundred bytes.
    const statuses: number[] = []
    for (let seq = 2; seq <= 8; seq += 1) {
      statuses.push((await page.post(page.envelope("unit", unitPayload(`u${seq}`, `unit number ${seq} with a statement long enough to weigh something`), seq))).status)
    }
    expect(statuses[0]).toBe(200)
    // The buffer's reservations reach the ceiling before the gap closes: later arrivals are refused now,
    // not accepted and stored later.
    expect(statuses).toContain(507)
    // Closing the gap drains what was reserved; the closer itself is admitted only if it still fits.
    const closer = await page.post(page.envelope("unit", unitPayload("u1", "make the header red"), 1))
    expect([200, 507]).toContain(closer.status)
    const logBytes = Number((await agent.statusHttp()).body.log_bytes)
    expect(logBytes).toBeLessThanOrEqual(3000 + 600)
  })

  test("an archive upload the previous process did not finish is removed on start and no longer counts against the disk cap", async () => {
    // Cap small enough that a stale partial would refuse a complete archive that fits on its own.
    const agent = await startAgent({ env: { CE_LIVE_DISK_CAP_BYTES: "4096" } })
    const page = pageFor(agent)
    expectOk(await page.sendUnit("u1", "make the header red"))
    const stalePart = path.join(agent.stateDir, "log", "archive.zip.11111111-2222-3333-4444-555555555555.part")
    await fs.writeFile(stalePart, Buffer.alloc(3000, 1))
    await agent.killServer()
    expect((await agent.restart()).status).toBe("resumed")
    expect(await fs.exists(stalePart)).toBe(false)
    expect(Number((await agent.statusHttp()).body.log_bytes)).toBeLessThan(3000)
    const archive = Buffer.alloc(2000, 2)
    const ended = await page.endSession(archive, "application/zip")
    expectOk(ended)
    expect(ended.body.archive_bytes).toBe(2000)
    expect(await fs.exists(path.join(agent.stateDir, "log", "archive.zip"))).toBe(true)
  })
})

describe("live endpoint recovery: unit transitions", () => {
  test("a status or ask whose board save fails answers 500 and leaves the unit as it was; the retry lands", async () => {
    const agent = await startAgent()
    const page = pageFor(agent)
    expectOk(await page.sendUnit("u1", "make the header red"))
    expectOk(await page.sendCheckpoint("ck1", "silence", "smart"))
    const wake = await agent.waitHttp()
    expectOk(await agent.ack(wake.envelope!.checkpoint_id))
    const unitStatus = async () => ((await agent.statusHttp()).body.units as { list: Array<{ id: string; status: string }> }).list.find((unit) => unit.id === "u1")!.status
    expect(await unitStatus()).toBe("triaging")

    const boardFile = path.join(agent.stateDir, "board.json")
    const boardBackup = await fs.readFile(boardFile)
    await fs.rm(boardFile)
    await fs.mkdir(boardFile)
    const failedStatus = await agent.postStatus("u1", "applied", { note: "done" })
    expect(failedStatus.status).toBe(500)
    expect(failedStatus.body).toMatchObject({ error: "storage_failed", unit_id: "u1" })
    expect(await unitStatus()).toBe("triaging")
    const failedAsk = await agent.ask("u1", "Which red?")
    expect(failedAsk.status).toBe(500)
    expect(await unitStatus()).toBe("triaging")

    await fs.rmdir(boardFile)
    await fs.writeFile(boardFile, boardBackup)
    // The failed applied post armed no page-loss watch either.
    expect((await agent.board()).watch_for_loss).toBe(false)
    expectOk(await agent.postStatus("u1", "applied", { note: "done" }))
    expect(await unitStatus()).toBe("applied")
    const persisted = (await agent.board()).units as Record<string, { status: string; note?: string; question?: string }>
    expect(persisted.u1).toMatchObject({ status: "applied", note: "done" })
    expect(persisted.u1.question).toBeUndefined()
  })
})

describe("live endpoint recovery: refusals under load", () => {
  test("a lone frame far past the hard ceiling still receives the contract's 413 instead of a connection reset", async () => {
    const agent = await startAgent()
    const page = pageFor(agent)
    // 5 MiB of base64: past the 2 MiB frame cap and past the 4 MiB ceiling at which the socket used to be destroyed.
    const jpeg = Buffer.alloc(5 * 1024 * 1024, 0x41).toString("base64").slice(0, 5 * 1024 * 1024)
    const frame = page.envelope("frame", { id: "frame_oversize", t: 1, route: "/", kind: "gesture", jpeg_base64: jpeg })
    const refused = await page.postRaw(JSON.stringify(frame))
    expect(refused.status).toBe(413)
    expect(refused.body).toMatchObject({ frame_max_bytes: 2 * 1024 * 1024 })
    // The endpoint is still up and the sequence is not stuck behind the refused frame.
    expectOk(await page.sendUnit("u1", "make the header red"))
  })

  test("unauthenticated refusals are logged a bounded number of times per minute, with one line noting the suppression", async () => {
    const agent = await startAgent({ env: { CE_LIVE_REJECTION_LOG_PER_MINUTE: "10" } })
    for (let i = 0; i < 30; i += 1) {
      const response = await fetch(`${agent.url}/wait`)
      expect(response.status).toBe(401)
    }
    const lines = (await fs.readFile(path.join(agent.stateDir, "log", "agent.ndjson"), "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { kind: string; route?: string })
    const rejected = lines.filter((line) => line.kind === "rejected" && line.route === "/wait")
    const suppressed = lines.filter((line) => line.kind === "rejected_suppressed")
    expect(rejected).toHaveLength(9)
    expect(suppressed).toHaveLength(1)
  })
})

describe("live endpoint recovery: background writes", () => {
  test("a stream disconnect while the board cannot be written does not take the endpoint down", async () => {
    const agent = await startAgent()
    const page = pageFor(agent)
    await page.openStream()
    expectOk(await page.sendUnit("u1", "make the header red"))
    const boardFile = path.join(agent.stateDir, "board.json")
    const boardBackup = await fs.readFile(boardFile)
    await fs.rm(boardFile)
    await fs.mkdir(boardFile)
    await page.closeStream()
    await Bun.sleep(200)
    expect(await agent.listening()).toBe(true)
    await fs.rmdir(boardFile)
    await fs.writeFile(boardFile, boardBackup)
    await page.openStream()
    await waitUntil(async () => ((await agent.statusHttp()).body.page as { stream: string }).stream === "connected")
    expectOk(await page.sendUnit("u2", "make the footer blue"))
  })
})

describe("live endpoint recovery: durable log and stream gaps", () => {
  test("an envelope whose board save fails leaves no log line or frame behind, so the retry stores it once", async () => {
    const agent = await startAgent()
    const page = pageFor(agent)
    expectOk(await page.sendUnit("u1", "make the header red"))
    const frame = await readFixture("frame")
    const boardFile = path.join(agent.stateDir, "board.json")
    const boardBackup = await fs.readFile(boardFile)
    await fs.rm(boardFile)
    await fs.mkdir(boardFile)
    const stored = page.envelope("frame", { ...frame.payload, id: "frame_retry" })
    const failed = await page.post(stored)
    expect(failed.status).toBe(500)
    expect(failed.body).toMatchObject({ error: "storage_failed", acked_seq: 1 })
    await fs.rmdir(boardFile)
    await fs.writeFile(boardFile, boardBackup)
    expectOk(await page.post(stored))
    const log = (await fs.readFile(path.join(agent.stateDir, "log", "events.ndjson"), "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { seq: number; type: string })
    expect(log.map((line) => line.seq)).toEqual([1, 2])
    const frames = await fs.readdir(path.join(agent.stateDir, "log", "frames"))
    expect(frames.filter((name) => name.startsWith("2-"))).toHaveLength(1)
    expect((await agent.statusHttp()).body.frame_count).toBe(1)
  })

  test("an applied notice posted while the page is between stream connections is delivered on the next connect", async () => {
    const agent = await startAgent({ env: { CE_LIVE_STREAM_FLUSH_MS: "10000" } })
    const page = pageFor(agent)
    expectOk(await page.sendUnit("u1", "make the header red"))
    expectOk(await page.sendCheckpoint("ck1", "silence", "smart"))
    const wake = await agent.waitHttp()
    expectOk(await agent.ack(wake.envelope!.checkpoint_id))
    // No stream attached (a flushed response, page reconnecting later): the notice must wait for it.
    expectOk(await agent.postStatus("u1", "applied", { note: "done" }))
    await page.openStream()
    const applied = await page.waitForEvent((event) => event.event === "applied")
    expect(applied.data).toMatchObject({ checkpoint_id: "ck1", unit_ids: ["u1"] })
    expect(page.eventsNamed("unit_status").some((event) => event.data.unit_id === "u1" && event.data.status === "applied")).toBe(true)
    // Delivered once: a second connection replays state, not the moment.
    await page.closeStream()
    const second = pageFor(agent)
    await second.openStream()
    await second.waitForEvent((event) => event.event === "unit_status" && event.data.unit_id === "u1")
    await Bun.sleep(100)
    expect(second.eventsNamed("applied")).toHaveLength(0)
  })

  test("a board that says ended while the session record does not (a death between the two writes) comes back ended on both: resumed while work is owed, fresh once drained", async () => {
    const agent = await startAgent()
    const page = pageFor(agent)
    expectOk(await page.sendUnit("u1", "make the header red"))
    expectOk(await page.sendCheckpoint("ck1", "silence", "smart"))
    const wake = await agent.waitHttp()
    expectOk(await agent.ack(wake.envelope!.checkpoint_id))
    // Died after the board's terminal write, before the session record's.
    await agent.killServer()
    const boardFile = path.join(agent.stateDir, "board.json")
    const board = JSON.parse(await fs.readFile(boardFile, "utf8")) as Record<string, unknown>
    await fs.writeFile(boardFile, JSON.stringify({ ...board, ended: true }))
    expect((await agent.session()).ended).toBe(false)

    // u1 is still triaging, so the ended session resumes for its close-out, ended on both records.
    expect((await agent.restart()).status).toBe("resumed")
    expect((await agent.session()).ended).toBe(true)
    expect((await agent.board()).ended).toBe(true)
    expect(await agent.statusCli()).toMatchObject({ status: "running", session_ended: true })
    expect((await page.send("mic", { state: "muted" })).status).toBe(410)
    expect((await agent.waitCli()).exitCode).toBe(1)
    expectOk(await agent.postStatus("u1", "blocked", { note: "session ended before apply" }))

    // Reconciled and drained: the same split on disk now starts a fresh session with the log kept aside.
    await agent.killServer()
    const sessionFile = path.join(agent.stateDir, "session.json")
    const session = JSON.parse(await fs.readFile(sessionFile, "utf8")) as Record<string, unknown>
    await fs.writeFile(sessionFile, JSON.stringify({ ...session, ended: false }))
    expect((await agent.restart()).status).toBe("started")
    expect((await agent.board()).ended).toBe(false)
    expect((await fs.readdir(agent.stateDir)).filter((name) => name.startsWith("log-ended-"))).toHaveLength(1)
  })

  test("the board summary's unit list carries anchors, evidence, and any open question, so a resumed run can pick a unit up from status alone", async () => {
    const agent = await startAgent()
    const page = pageFor(agent)
    expectOk(await page.sendUnit("u1", "make the header red"))
    expectOk(await page.sendCheckpoint("ck1", "silence", "smart"))
    const wake = await agent.waitHttp()
    expectOk(await agent.ack(wake.envelope!.checkpoint_id))
    expectOk(await agent.ask("u1", "Which red?"))
    const list = ((await agent.statusHttp()).body.units as { list: Array<Record<string, unknown>> }).list
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: "u1", status: "needs_info", question: "Which red?" })
    expect(list[0].anchors).toEqual([{ route: "/", selector: '[data-unit="u1"]', rect: { x: 0, y: 0, width: 10, height: 10 }, t: 1 }])
    expect(list[0].evidence).toMatchObject({ frame_ids: [], annotation_ids: [] })
    expect((await agent.statusCli()).board).toMatchObject({ units: { list: [{ id: "u1", anchors: list[0].anchors }] } })
  })
})

describe("live endpoint recovery: session end", () => {
  test("a unit that lands after the page's final checkpoint is released by /session/end as a last batch and holds the board from draining", async () => {
    const agent = await startAgent()
    const page = pageFor(agent)
    expectOk(await page.sendUnit("u1", "make the header red"))
    expectOk(await page.sendCheckpoint("ck-final", "final", "smart"))
    const final = await agent.waitHttp()
    expect(final.envelope!.kind).toBe("final")
    expectOk(await agent.ack("ck-final"))
    expectOk(await agent.postStatus("u1", "applied"))
    // Late: the page still had a unit in flight when Done went out.
    expectOk(await page.sendUnit("u2", "make the footer blue"))
    expectOk(await page.endSession("{}", "application/json"))

    const late = await agent.waitHttp()
    expect(late.status).toBe(200)
    expect(late.envelope!.kind).toBe("send")
    expect(late.envelope!.units.map((unit) => unit.id)).toEqual(["u2"])
    const probe = () => fetch(`${agent.url}/session`, { headers: { Authorization: `Bearer ${agent.pageToken}` } }).then((response) => response.json())
    expect(await probe()).toMatchObject({ status: "ended", accepts_new_session: false })
    expectOk(await agent.ack(late.envelope!.checkpoint_id))
    expect(await probe()).toMatchObject({ status: "ended", accepts_new_session: false })
    expectOk(await agent.postStatus("u2", "blocked", { note: "session ended before apply" }))
    expect(await probe()).toMatchObject({ status: "ended", accepts_new_session: true })
  })

  test("a committed session end answers 200 even when the audit log cannot be appended", async () => {
    const agent = await startAgent()
    const page = pageFor(agent)
    expectOk(await page.sendUnit("u1", "make the header red"))
    const agentLog = path.join(agent.stateDir, "log", "agent.ndjson")
    await fs.rm(agentLog, { force: true })
    await fs.mkdir(agentLog)
    const ended = await page.endSession("{}", "application/json")
    expectOk(ended)
    expect(ended.body.status).toBe("session-ended")
    expect((await agent.session()).ended).toBe(true)
    expect((await agent.board()).ended).toBe(true)
    // The retry of an already-ended session is the documented 410, not a second end.
    expect((await page.endSession("{}", "application/json")).status).toBe(410)
  })
})

describe("live endpoint recovery: session transitions", () => {
  test("a new-session opener whose board save fails leaves the ended session intact on disk and in memory; the retry opens it", async () => {
    const agent = await startAgent()
    const first = pageFor(agent, "sess_first")
    expectOk(await first.sendUnit("u1", "make the header red"))
    expectOk(await first.endSession("PK\u0003\u0004first-archive", "application/zip"))
    const final = await agent.waitHttp()
    expectOk(await agent.ack(final.envelope!.checkpoint_id))
    expectOk(await agent.postStatus("u1", "applied"))

    const boardFile = path.join(agent.stateDir, "board.json")
    const boardBackup = await fs.readFile(boardFile)
    await fs.rm(boardFile)
    await fs.mkdir(boardFile)
    const refused = await pageFor(agent, "sess_second").sendUnit("u2", "make the footer blue")
    expect(refused.status).toBe(500)
    // Nothing moved: the ended first session is what /status, session.json, and the log directory still describe.
    expect((await agent.statusHttp()).body).toMatchObject({ session_id: "sess_first", ended: true })
    expect((await agent.session()).ended).toBe(true)
    expect((await fs.readdir(agent.stateDir)).filter((name) => name.startsWith("log-ended-"))).toEqual([])
    expect(await fs.exists(path.join(agent.stateDir, "log", "archive.zip"))).toBe(true)

    await fs.rmdir(boardFile)
    await fs.writeFile(boardFile, boardBackup)
    const second = pageFor(agent, "sess_second")
    expectOk(await second.sendUnit("u2", "make the footer blue"))
    expect(await agent.board()).toMatchObject({ session_id: "sess_second", ended: false, acked_seq: 1 })
    expect((await agent.session()).ended).toBe(false)
    expect((await fs.readdir(agent.stateDir)).filter((name) => name.startsWith("log-ended-"))).toHaveLength(1)
  })

  test("an archive whose termination write fails is released with its accounting, so the page's retry is a replacement and lands", async () => {
    const agent = await startAgent({ env: { CE_LIVE_DISK_CAP_BYTES: "4096" } })
    const page = pageFor(agent)
    expectOk(await page.sendUnit("u1", "make the header red"))
    // session.json cannot be rewritten: the archive lands, then ending the session fails.
    const sessionFile = path.join(agent.stateDir, "session.json")
    const sessionBackup = await fs.readFile(sessionFile)
    await fs.rm(sessionFile)
    await fs.mkdir(sessionFile)
    const archive = Buffer.alloc(2000, 3)
    const failed = await page.endSession(archive, "application/zip")
    expect(failed.status).toBe(500)
    expect(failed.body).toMatchObject({ error: "archive_write_failed" })
    expect(await fs.exists(path.join(agent.stateDir, "log", "archive.zip"))).toBe(false)
    const status = (await agent.statusHttp()).body as { log_bytes: number; ended: boolean; batches: { unserved: number; unacked: number }; units: { list: Array<{ id: string; status: string }> } }
    expect(status.log_bytes).toBeLessThan(2000)
    expect(status.ended).toBe(false)
    // The fallback final checkpoint the upload supplied rolled back with it: no batch is queued, u1 is
    // still unreleased, and no wake is served for a session that did not end.
    expect(status.batches).toEqual({ unserved: 0, unacked: 0 })
    expect(status.units.list.find((unit) => unit.id === "u1")!.status).toBe("initial")
    expect((await agent.board()).final_emitted).toBe(false)
    expect(await fs.readdir(path.join(agent.stateDir, "batches"))).toEqual([])

    await fs.rmdir(sessionFile)
    await fs.writeFile(sessionFile, sessionBackup)
    const retried = await page.endSession(archive, "application/zip")
    expectOk(retried)
    expect(retried.body.archive_bytes).toBe(2000)
    expect(await fs.exists(path.join(agent.stateDir, "log", "archive.zip"))).toBe(true)
    // Exactly one final checkpoint, carrying u1, comes out of the retry.
    const final = await agent.waitHttp()
    expect(final.envelope!.kind).toBe("final")
    expect(final.envelope!.units.map((unit) => unit.id)).toEqual(["u1"])
    expect(((await agent.board()).checkpoints as Array<{ kind: string }>).filter((checkpoint) => checkpoint.kind === "final")).toHaveLength(1)
  })
})

describe("live endpoint recovery: replay and lifecycle", () => {
  test("replay --profile strokes_composite prunes unit evidence to the composite frames it can actually emit", async () => {
    const source = await startAgent()
    const page = pageFor(source)
    const frame = await readFixture("frame")
    expectOk(await page.post(page.envelope("frame", { ...frame.payload, id: "comp_kept", kind: "composite" })))
    expectOk(await page.post(page.envelope("frame", { ...frame.payload, id: "comp_missing", kind: "composite" })))
    expectOk(await page.sendUnit("u1", "make the header red", { evidence: { frame_ids: ["comp_kept", "comp_missing"], annotation_ids: [], transcript_span: { t_start: 0, t_end: 1 } } }))
    expectOk(await page.sendCheckpoint("ck1", "silence", "smart"))
    // The second composite's image file is gone from the log before replay.
    const frames = await fs.readdir(path.join(source.stateDir, "log", "frames"))
    const missing = frames.find((name) => name.includes("comp_missing"))
    expect(missing).toBeDefined()
    await fs.rm(path.join(source.stateDir, "log", "frames", missing!))

    const target = await startAgent()
    const replayed = await source.replayCli("strokes_composite", target.url, target.pageToken)
    expect(replayed.exitCode, replayed.stderr).toBe(0)
    const summary = parseJsonLine(replayed.stdout)
    expect(summary.envelopes_skipped).toBe(1)
    const targetBoard = (await target.board()) as { units: Record<string, { evidence: { frame_ids: string[] } }> }
    expect(targetBoard.units.u1.evidence.frame_ids).toEqual(["comp_kept"])
    expect((await target.statusHttp()).body.frame_count).toBe(1)
  })

  test("replay --profile everything prunes a unit's evidence to the frames it could emit, and --log replays a rotated earlier session", async () => {
    const source = await startAgent()
    const first = pageFor(source, "sess_first")
    const frame = await readFixture("frame")
    expectOk(await first.post(first.envelope("frame", { ...frame.payload, id: "g_kept" })))
    expectOk(await first.post(first.envelope("frame", { ...frame.payload, id: "g_missing" })))
    expectOk(await first.sendUnit("u1", "make the header red", { evidence: { frame_ids: ["g_kept", "g_missing"], annotation_ids: [], transcript_span: { t_start: 0, t_end: 1 } } }))
    expectOk(await first.sendCheckpoint("ck1", "silence", "smart"))
    const frames = await fs.readdir(path.join(source.stateDir, "log", "frames"))
    await fs.rm(path.join(source.stateDir, "log", "frames", frames.find((name) => name.includes("g_missing"))!))
    // End the first session and open a second one so the first log rotates aside.
    expectOk(await first.endSession("{}", "application/json"))
    const wake = await source.waitHttp()
    expectOk(await source.ack(wake.envelope!.checkpoint_id))
    expectOk(await source.postStatus("u1", "applied"))
    const second = pageFor(source, "sess_second")
    expectOk(await second.sendUnit("u2", "make the footer blue"))
    const rotated = (await fs.readdir(source.stateDir)).find((name) => name.startsWith("log-ended-"))!
    expect(rotated).toBeDefined()

    const target = await startAgent()
    const replayed = await runHelper(["replay", "--root", source.root, "--profile", "everything", "--to", target.url, "--token", target.pageToken, "--log", rotated])
    expect(replayed.exitCode, replayed.stderr).toBe(0)
    expect(parseJsonLine(replayed.stdout)).toMatchObject({ status: "replayed", envelopes_skipped: 1 })
    const targetBoard = (await target.board()) as { units: Record<string, { evidence: { frame_ids: string[] } }> }
    expect(Object.keys(targetBoard.units)).toEqual(["u1"])
    expect(targetBoard.units.u1.evidence.frame_ids).toEqual(["g_kept"])
    // Without --log the current (second) session is what replays.
    const current = await startAgent()
    expect((await source.replayCli("everything", current.url, current.pageToken)).exitCode).toBe(0)
    expect(Object.keys(((await current.board()) as { units: Record<string, unknown> }).units)).toEqual(["u2"])
  })

  test("a new session opens with the agent away, even when a wait was parked on the drained one", async () => {
    const agent = await startAgent()
    const first = pageFor(agent, "sess_first")
    expectOk(await first.sendUnit("u1", "make the header red"))
    expectOk(await first.endSession("{}", "application/json"))
    const wake = await agent.waitHttp()
    expectOk(await agent.ack(wake.envelope!.checkpoint_id))
    expectOk(await agent.postStatus("u1", "applied"))
    // A wait on the drained session is released with 410; presence must not stay at listening.
    expect((await agent.waitHttp()).status).toBe(410)
    const second = pageFor(agent, "sess_second")
    expectOk(await second.sendUnit("u2", "make the footer blue"))
    await second.openStream()
    // Load headroom: the connect-time replay is immediate, but the parallel suite can delay the reader well past the 5 s default.
    const presence = await second.waitForEvent((event) => event.event === "agent", 20_000)
    expect(presence.data).toMatchObject({ state: "away" })
  })

  test("a first request whose session bind cannot be persisted binds nothing, so the next legitimate session is not refused as foreign", async () => {
    const agent = await startAgent()
    const boardFile = path.join(agent.stateDir, "board.json")
    const boardBackup = await fs.readFile(boardFile)
    await fs.rm(boardFile)
    await fs.mkdir(boardFile)
    const refused = await pageFor(agent, "sess_rejected").sendUnit("u1", "make the header red")
    expect(refused.status).toBe(500)
    expect((await agent.statusHttp()).body.session_id).toBeNull()
    await fs.rmdir(boardFile)
    await fs.writeFile(boardFile, boardBackup)
    const real = pageFor(agent, "sess_real")
    expectOk(await real.sendUnit("u1", "make the header red"))
    expect((await agent.board()).session_id).toBe("sess_real")
  })

  test("replay reads frame files only from inside the selected log's frames directory: a traversing frame_file or a symlink out is skipped, never transmitted", async () => {
    const source = await startAgent()
    const page = pageFor(source)
    const frame = await readFixture("frame")
    expectOk(await page.post(page.envelope("frame", { ...frame.payload, id: "f_ok" })))
    expectOk(await page.post(page.envelope("frame", { ...frame.payload, id: "f_traverse" })))
    expectOk(await page.post(page.envelope("frame", { ...frame.payload, id: "f_link" })))
    expectOk(await page.sendUnit("u1", "make the header red", { evidence: { frame_ids: ["f_ok", "f_traverse", "f_link"], annotation_ids: [], transcript_span: { t_start: 0, t_end: 1 } } }))
    await source.killServer()
    // Tamper with the log the way a copied, untrusted log could be: one record points outside, one at a symlink out.
    const secret = path.join(source.root, "secret.txt")
    await fs.writeFile(secret, "not for the target")
    const framesDir = path.join(source.stateDir, "log", "frames")
    const linkName = (await fs.readdir(framesDir)).find((name) => name.includes("f_link"))!
    await fs.rm(path.join(framesDir, linkName))
    await fs.symlink(secret, path.join(framesDir, linkName))
    const eventsFile = path.join(source.stateDir, "log", "events.ndjson")
    const lines = (await fs.readFile(eventsFile, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { type: string; payload: { id?: string }; frame_file?: string | null })
    for (const line of lines) if (line.type === "frame" && line.payload.id === "f_traverse") line.frame_file = "../../secret.txt"
    await fs.writeFile(eventsFile, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`)

    const target = await startAgent()
    const replayed = await source.replayCli("everything", target.url, target.pageToken)
    expect(replayed.exitCode, replayed.stderr).toBe(0)
    expect(parseJsonLine(replayed.stdout)).toMatchObject({ envelopes_skipped: 2 })
    const targetBoard = (await target.board()) as { units: Record<string, { evidence: { frame_ids: string[] } }> }
    expect(targetBoard.units.u1.evidence.frame_ids).toEqual(["f_ok"])
    const targetLog = await fs.readFile(path.join(target.stateDir, "log", "events.ndjson"), "utf8")
    expect(targetLog).not.toContain(Buffer.from("not for the target").toString("base64"))
    expect((await target.statusHttp()).body.frame_count).toBe(1)
  })

  test("a closed tab's takeover by a new session survives an unwritable audit log", async () => {
    const agent = await startAgent()
    const first = pageFor(agent, "sess_first")
    expectOk(await first.sendUnit("u1", "make the header red"))
    // The old page said it was unloading and holds no stream: the next session may take over.
    expectOk(await first.send("stream_state", { state: "unloading" }))
    const agentLog = path.join(agent.stateDir, "log", "agent.ndjson")
    await fs.rm(agentLog, { force: true })
    await fs.mkdir(agentLog)
    const second = pageFor(agent, "sess_second")
    const opened = await second.sendUnit("u2", "make the footer blue")
    expectOk(opened)
    expect(await agent.board()).toMatchObject({ session_id: "sess_second", ended: false })
  })

  test("a page_lost batch that cannot be persisted leaves the watch armed and the helper up; the loss is reported once the disk allows", async () => {
    // A long flush window: the `applied` delivery must not end the stream (and let the fake page's
    // reconnect retire the watch) before this test closes the stream itself.
    const agent = await startAgent({ env: { CE_LIVE_PAGE_LOST_GRACE_MS: "400", CE_LIVE_STREAM_FLUSH_MS: "10000" } })
    const page = pageFor(agent)
    await page.openStream()
    expectOk(await page.sendUnit("u1", "make the header red"))
    expectOk(await page.sendCheckpoint("ck1", "silence", "instant"))
    const wake = await agent.waitHttp()
    expectOk(await agent.ack(wake.envelope!.checkpoint_id))
    expectOk(await agent.postStatus("u1", "applied"))
    await page.closeStream()
    // A regular file where batches/ should be makes the page_lost batch write fail when the grace window ends.
    const batchesDir = path.join(agent.stateDir, "batches")
    await fs.rm(batchesDir, { recursive: true, force: true })
    await fs.writeFile(batchesDir, "not a directory")
    await Bun.sleep(700)
    expect(await agent.listening()).toBe(true)
    expect((await agent.board()).watch_for_loss).toBe(true)
    expect(((await agent.statusHttp()).body.page as { lost_episodes: number }).lost_episodes).toBe(0)
    const agentLog = (await fs.readFile(path.join(agent.stateDir, "log", "agent.ndjson"), "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { kind: string })
    expect(agentLog.some((line) => line.kind === "page_lost_persist_failed")).toBe(true)

    await fs.rm(batchesDir, { force: true })
    await fs.mkdir(batchesDir, { recursive: true })
    const lost = await agent.waitCli()
    expect(lost.exitCode, lost.stderr).toBe(0)
    expect((lost.envelope as { session_status: string }).session_status).toBe("page_lost")
    expect((await agent.board()).watch_for_loss).toBe(false)
  })

  test("a parked wait is not handed a page_lost batch whose board commit then fails; it receives the loss once the commit lands", async () => {
    const agent = await startAgent({ env: { CE_LIVE_PAGE_LOST_GRACE_MS: "400", CE_LIVE_STREAM_FLUSH_MS: "10000", CE_LIVE_WAIT_TIMEOUT_MS: "4000" } })
    const page = pageFor(agent)
    await page.openStream()
    expectOk(await page.sendUnit("u1", "make the header red"))
    expectOk(await page.sendCheckpoint("ck1", "silence", "instant"))
    const wake = await agent.waitHttp()
    expectOk(await agent.ack(wake.envelope!.checkpoint_id))
    expectOk(await agent.postStatus("u1", "applied"))
    await page.closeStream()
    // The disconnect's own board save has landed before the board is made unwritable.
    await waitUntil(async () => ((await agent.board()).page as { stream: string }).stream === "disconnected")
    // The batch file can be written, the board cannot: the transition must fail after enqueue.
    const boardFile = path.join(agent.stateDir, "board.json")
    const boardBackup = await fs.readFile(boardFile)
    await fs.rm(boardFile)
    await fs.mkdir(boardFile)
    const parked = agent.waitHttp()
    await Bun.sleep(900)
    // Still parked: nothing was delivered for a transition that did not commit.
    const raced = await Promise.race([parked.then(() => "delivered"), Bun.sleep(50).then(() => "parked")])
    expect(raced).toBe("parked")
    await fs.rmdir(boardFile)
    await fs.writeFile(boardFile, boardBackup)
    const delivered = await parked
    expect(delivered.status).toBe(200)
    expect(delivered.envelope!.session_status).toBe("page_lost")
    // The batch it received is real: the ack lands.
    expectOk(await agent.ack(delivered.envelope!.checkpoint_id))
  })

  test("an archive still uploading keeps the helper alive past the idle timeout with no stream attached", async () => {
    // The idle window is well above startup and scheduler jitter (the first chunk is written at once,
    // later ones every 300 ms), while the whole upload (~2.1 s) outlasts it.
    const agent = await startAgent({ env: { CE_LIVE_IDLE_TIMEOUT_MS: "1200", CE_LIVE_LIFECYCLE_CHECK_MS: "100" } })
    const page = pageFor(agent)
    expectOk(await page.sendUnit("u1", "make the header red"))
    const chunkCount = 8
    const upload = new Promise<{ status: number; body: string }>((resolve, reject) => {
      // No Content-Length and no explicit Transfer-Encoding: the client frames the body as chunks itself.
      const request = http.request(`${agent.url}/session/end`, { method: "POST", headers: page.headers({ "Content-Type": "application/zip" }) }, (response) => {
        const chunks: Buffer[] = []
        response.on("data", (chunk: Buffer) => chunks.push(chunk))
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }))
      })
      request.on("error", reject)
      request.write(Buffer.alloc(1024, 7))
      let sent = 1
      const tick = setInterval(() => {
        request.write(Buffer.alloc(1024, 7))
        sent += 1
        if (sent === chunkCount) {
          clearInterval(tick)
          request.end()
        }
      }, 300)
    })
    const ended = await upload
    expect(ended.status, ended.body).toBe(200)
    expect(JSON.parse(ended.body)).toMatchObject({ status: "session-ended", archive_bytes: chunkCount * 1024 })
    expect(await agent.listening()).toBe(true)
  })

  test("the archive budget is read at every chunk, so frames landing during a slow upload shrink what the archive may still take", async () => {
    const agent = await startAgent({ env: { CE_LIVE_DISK_CAP_BYTES: "8192" } })
    const page = pageFor(agent)
    expectOk(await page.sendUnit("u1", "make the header red"))
    const upload = new Promise<{ status: number; body: string }>((resolve, reject) => {
      const request = http.request(`${agent.url}/session/end`, { method: "POST", headers: page.headers({ "Content-Type": "application/zip" }) }, (response) => {
        const chunks: Buffer[] = []
        response.on("data", (chunk: Buffer) => chunks.push(chunk))
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }))
      })
      request.on("error", reject)
      let sent = 0
      const tick = setInterval(async () => {
        if (sent === 2) {
          // Mid-upload, a frame lands and takes ~3 KB of the cap for itself.
          const jpeg = Buffer.alloc(2200, 0x42).toString("base64")
          await page.post(page.envelope("frame", { id: "frame_mid", t: 1, route: "/", kind: "gesture", jpeg_base64: jpeg }))
        }
        request.write(Buffer.alloc(1024, 7))
        sent += 1
        if (sent === 6) {
          clearInterval(tick)
          request.end()
        }
      }, 150)
    })
    const ended = await upload
    // 6 KB of archive plus ~3 KB of frame do not fit in 8 KB: the upload is refused once the frame has landed.
    expect(ended.status, ended.body).toBe(413)
    expect(await fs.exists(path.join(agent.stateDir, "log", "archive.zip"))).toBe(false)
    expect(Number((await agent.statusHttp()).body.log_bytes)).toBeLessThanOrEqual(8192)
  })
})

describe("live endpoint recovery: the page-loss watch and stream replay", () => {
  test("the watch set by an applied notice ends when the page reconnects, or when the grace window passes with the stream up; a later disconnect is not a loss", async () => {
    // A long flush window keeps the fake page's automatic reconnect out of the picture: every
    // disconnect and reconnect below is the test's own.
    const agent = await startAgent({ env: { CE_LIVE_PAGE_LOST_GRACE_MS: "400", CE_LIVE_STREAM_FLUSH_MS: "10000" } })
    const page = pageFor(agent)
    await page.openStream()
    expectOk(await page.sendUnit("u1", "make the header red"))
    expectOk(await page.sendCheckpoint("ck1", "silence", "instant"))
    const wake = await agent.waitHttp()
    expectOk(await agent.ack(wake.envelope!.checkpoint_id))

    // Applied, then a full reload inside the grace window: the reconnect retires the watch.
    expectOk(await agent.postStatus("u1", "applied"))
    expect((await agent.board()).watch_for_loss).toBe(true)
    await page.closeStream()
    await page.openStream()
    await waitUntil(async () => (await agent.board()).watch_for_loss === false)
    // Closing the tab later, well past the grace window, produces no page_lost.
    await page.closeStream()
    await Bun.sleep(900)
    const status = (await agent.statusHttp()).body as { page: { lost_episodes: number }; batches: { unserved: number; unacked: number } }
    expect(status.page.lost_episodes).toBe(0)
    expect(status.batches).toEqual({ unserved: 0, unacked: 0 })
    expect((await agent.waitHttp()).status).toBe(204)

    // Applied with the stream staying up (a hot reload that never drops): the watch expires on its own.
    await page.openStream()
    await waitUntil(async () => ((await agent.statusHttp()).body.page as { stream: string }).stream === "connected")
    expectOk(await page.sendUnit("u2", "make the footer blue"))
    const instant = await agent.waitHttp()
    expectOk(await agent.ack(instant.envelope!.checkpoint_id))
    expectOk(await agent.postStatus("u2", "applied"))
    expect((await agent.board()).watch_for_loss).toBe(true)
    await waitUntil(async () => (await agent.board()).watch_for_loss === false, 3000)
    await page.closeStream()
    await Bun.sleep(900)
    expect(((await agent.statusHttp()).body.page as { lost_episodes: number }).lost_episodes).toBe(0)
    expect((await agent.waitHttp()).status).toBe(204)
  })

  test("a stream that only replays existing unit state is still flushed, so a buffering tunnel delivers the replay without waiting for a live event", async () => {
    const agent = await startAgent({ env: { CE_LIVE_STREAM_FLUSH_MS: "100" } })
    const page = pageFor(agent)
    expectOk(await page.sendUnit("u1", "make the header red"))
    expectOk(await page.sendCheckpoint("ck1", "silence", "smart"))
    const wake = await agent.waitHttp()
    expectOk(await agent.ack(wake.envelope!.checkpoint_id))
    expectOk(await agent.ask("u1", "Which red: brand red or error red?"))

    // A fresh connection with nothing live happening: the replayed status and question must reach the page as a completed response.
    await page.openStream()
    await page.waitForEvent((event) => event.event === "ask" && event.data.unit_id === "u1")
    await waitUntil(() => page.streamEnds >= 1, 2000)
    expect(page.eventsNamed("unit_status").some((event) => event.data.unit_id === "u1" && event.data.status === "needs_info")).toBe(true)
  })
})

describe("live endpoint recovery: process ownership", () => {
  test("a helper launched from another checkout of the same script still owns the root: status reports running and stop stops it", async () => {
    const agent = await startAgent()
    const otherCheckout = await mkScratch("ce-polish-other-checkout-")
    const otherScript = path.join(otherCheckout, "live-endpoint.js")
    await fs.copyFile(LIVE_ENDPOINT_SCRIPT, otherScript)

    const status = await runFrom(otherScript, ["status", "--root", agent.root])
    expect(status.exitCode, status.stderr).toBe(0)
    expect(parseJsonLine(status.stdout)).toMatchObject({ status: "running", port: agent.port })
    // A second start from the moved checkout reports the running endpoint rather than launching another writer.
    const again = await runFrom(otherScript, ["start", "--root", agent.root, "--app-origin", APP_ORIGIN])
    expect(again.exitCode, again.stderr).toBe(0)
    expect(parseJsonLine(again.stdout)).toMatchObject({ status: "running", page_token: agent.pageToken })

    const stopped = await runFrom(otherScript, ["stop", "--root", agent.root])
    expect(stopped.exitCode, stopped.stderr).toBe(0)
    await waitUntil(async () => !(await agent.listening()))
  })

  test("a pidfile pointing at a sibling root's helper whose --root merely extends this one is foreign: stop leaves that helper running", async () => {
    const parent = await mkScratch("ce-polish-sibling-roots-")
    const root = path.join(parent, "root")
    const sibling = path.join(parent, "root-other")
    await fs.mkdir(root)
    await fs.mkdir(sibling)
    const agent = await startAgent({ root })
    const other = await startAgent({ root: sibling })
    const ownPid = await agent.serverPid()
    const otherPid = await other.serverPid()
    expect(ownPid).not.toBeNull()
    expect(otherPid).not.toBeNull()

    // A reused PID: this root's pidfile names the sibling's live helper.
    await fs.writeFile(path.join(agent.stateDir, "server.pid"), `${otherPid}\n`)
    expect(await agent.statusCli()).toMatchObject({ status: "stopped" })
    const stopped = await agent.stopCli()
    expect(stopped.exitCode, stopped.stderr).toBe(0)
    expect(await other.listening()).toBe(true)
    expect(await other.statusCli()).toMatchObject({ status: "running" })

    // Put the real PID back so the orphaned helper is stopped with its root.
    await fs.writeFile(path.join(agent.stateDir, "server.pid"), `${ownPid}\n`)
    expect(await agent.listening()).toBe(true)
  })

  test("a sibling root that is this root plus a space and more words is foreign too", async () => {
    const parent = await mkScratch("ce-polish-spaced-roots-")
    const root = path.join(parent, "root")
    const sibling = path.join(parent, "root other")
    await fs.mkdir(root)
    await fs.mkdir(sibling)
    const agent = await startAgent({ root })
    const other = await startAgent({ root: sibling })
    const ownPid = await agent.serverPid()
    const otherPid = await other.serverPid()
    await fs.writeFile(path.join(agent.stateDir, "server.pid"), `${otherPid}\n`)
    expect(await agent.statusCli()).toMatchObject({ status: "stopped" })
    expect((await agent.stopCli()).exitCode).toBe(0)
    expect(await other.listening()).toBe(true)
    expect(await other.statusCli()).toMatchObject({ status: "running" })
    await fs.writeFile(path.join(agent.stateDir, "server.pid"), `${ownPid}\n`)
  })

  test("without a usable ps, stop and start refuse to touch or displace the live PID instead of treating it as the endpoint", async () => {
    const agent = await startAgent()
    // A PATH with nothing on it: `ps` cannot be found, so ownership is unknown
    // unless the platform exposes exact argv (Linux /proc), which is positive evidence on its own.
    const emptyBin = await mkScratch("ce-polish-empty-bin-")
    const noPs = { PATH: emptyBin }
    const pid = await agent.serverPid()
    expect(pid).not.toBeNull()
    const procArgv = await fs.readFile(`/proc/${pid}/cmdline`).then((raw) => raw.length > 0).catch(() => false)

    const stopped = await runFrom(LIVE_ENDPOINT_SCRIPT, ["stop", "--root", agent.root], noPs)
    if (procArgv) {
      // Ownership was read from /proc; stop proceeds exactly as with ps.
      expect(stopped.exitCode, stopped.stderr).toBe(0)
      await waitUntil(async () => !(await agent.listening()))
      return
    }
    expect(stopped.exitCode).toBe(1)
    expect(stopped.stderr).toMatch(/Cannot verify that process \d+ .* is this root's endpoint/)
    expect(await agent.listening()).toBe(true)
    expect(await agent.serverPid()).toBe(pid)
    // Tokens were not retired: the refusal happened before any state changed.
    expect((await agent.session()).agent_token).toBe(agent.agentToken)

    const started = await runFrom(LIVE_ENDPOINT_SCRIPT, ["start", "--root", agent.root, "--app-origin", APP_ORIGIN], noPs)
    expect(started.exitCode).toBe(1)
    expect(started.stderr).toMatch(/Cannot verify that process \d+/)
    expect(await agent.serverPid()).toBe(pid)

    // With ps available again the same commands work as before.
    expect(await agent.statusCli()).toMatchObject({ status: "running" })
    expect((await agent.stopCli()).exitCode).toBe(0)
    await waitUntil(async () => !(await agent.listening()))
  })
})
