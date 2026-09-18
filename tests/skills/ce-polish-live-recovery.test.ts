import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { FakeLivePage, unitPayload } from "../helpers/fakeLivePage"
import { APP_ORIGIN, FakeLiveAgent, LIVE_ENDPOINT_SCRIPT, parseJsonLine, waitUntil } from "../helpers/fakeLiveAgent"

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

describe("live endpoint recovery: the page-loss watch and stream replay", () => {
  test("the watch set by an applied notice ends when the page reconnects, or when the grace window passes with the stream up; a later disconnect is not a loss", async () => {
    const agent = await startAgent({ env: { CE_LIVE_PAGE_LOST_GRACE_MS: "400" } })
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

  test("without a usable ps, stop and start refuse to touch or displace the live PID instead of treating it as the endpoint", async () => {
    const agent = await startAgent()
    // A PATH with nothing on it: `ps` cannot be found, so ownership is unknown.
    const emptyBin = await mkScratch("ce-polish-empty-bin-")
    const noPs = { PATH: emptyBin }
    const pid = await agent.serverPid()
    expect(pid).not.toBeNull()

    const stopped = await runFrom(LIVE_ENDPOINT_SCRIPT, ["stop", "--root", agent.root], noPs)
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
