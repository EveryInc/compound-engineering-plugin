import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import { FakeLivePage, readFixture } from "../helpers/fakeLivePage"
import { FakeLiveAgent, waitUntil } from "../helpers/fakeLiveAgent"

setDefaultTimeout(30_000)

// The two-agent loop smoke: a fake riffrec page (tests/helpers/fakeLivePage.ts)
// and a fake coding agent (tests/helpers/fakeLiveAgent.ts) drive the real
// helper, skills/ce-polish/scripts/live-endpoint.js, with no human and no
// LLM. The scripted session is the one U10 names: three units and a
// drawing-only unit, one withdrawal, one page_change checkpoint -> one wake;
// ack; Smart triage asks one question -> `ask` on the stream -> the page
// answers -> an `answer` wake with answers[] only -> `applied` on the stream.
// Then the two recovery seams: page lost after an applied edit (AE13) and a
// helper restart with the page buffering (AE10).

const agents: FakeLiveAgent[] = []
const pages: FakeLivePage[] = []

// A rejected request fails with the helper's reason in the message, not a bare status.
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

afterEach(async () => {
  while (pages.length > 0) await pages.pop()!.closeStream()
  while (agents.length > 0) await agents.pop()!.dispose()
})

describe("ce-polish live loop smoke", () => {
  test("F1-F3: units and a drawing -> one wake -> ack -> ask on the stream -> answer wake -> applied on the stream (AE1, AE3, AE6, AE12)", async () => {
    const agent = await startAgent()
    const page = pageFor(agent)
    await page.openStream()
    await page.waitForEvent((event) => event.event === "ack")

    // The riffer talks: three units, one of them taken back, and a stroke with no words.
    expectOk(await page.sendUnit("u-red", "make the header red", { anchors: [{ route: "/", selector: "header", rect: { x: 0, y: 0, width: 100, height: 40 }, t: 1 }] }))
    expectOk(await page.sendUnit("u-toggle", "move the sidebar toggle right"))
    expectOk(await page.sendUnit("u-onboarding", "rethink the onboarding flow"))
    expectOk(await page.send("unit_withdraw", { unit_id: "u-toggle", reason: "no, forget that" }))
    const stroke = await readFixture("annotation")
    const drawingOnly = page.envelope("annotation", { ...stroke.payload, id: "ann-box", unit_id: "u-drawing", text: undefined })
    expectOk(await page.post(drawingOnly))
    // A drawing-only unit has no words, but the contract still requires a span (I1): it collapses onto the stroke's time.
    expectOk(await page.sendUnit("u-drawing", "(drawing)", { evidence: { frame_ids: [], annotation_ids: ["ann-box"], transcript_span: { t_start: 12.5, t_end: 12.5 } } }))
    await page.waitForEvent((event) => event.event === "unit_status" && event.data.unit_id === "u-toggle" && event.data.status === "withdrawn")

    // Nothing wakes the agent before a checkpoint (R36).
    expect((await agent.waitHttp()).status).toBe(204)
    expectOk(await page.sendCheckpoint("ck-nav", "page_change", "smart"))

    // Exactly one wake, through the CLI the skill prose runs.
    const first = await agent.waitCli()
    expect(first.exitCode, first.stderr).toBe(0)
    const wake = first.envelope as {
      checkpoint_id: string
      kind: string
      mode_at_checkpoint: string
      session_status: string
      units: Array<{ id: string; status: string }>
      annotations: Array<{ id: string; unit_id: string }>
      answers: unknown[]
    }
    expect(wake.kind).toBe("page_change")
    expect(wake.mode_at_checkpoint).toBe("smart")
    expect(wake.session_status).toBe("live")
    expect(wake.units.map((unit) => unit.id).sort()).toEqual(["u-drawing", "u-onboarding", "u-red"])
    expect(wake.units.map((unit) => unit.id)).not.toContain("u-toggle")
    expect(wake.annotations.map((annotation) => annotation.id)).toEqual(["ann-box"])
    expect(wake.answers).toEqual([])
    // The page saw every released unit go to triaging.
    for (const id of ["u-red", "u-onboarding", "u-drawing"]) {
      await page.waitForEvent((event) => event.event === "unit_status" && event.data.unit_id === id && event.data.status === "triaging")
    }

    // Acknowledge first; the batch is not re-served afterwards and a repeated ack is idempotent.
    expectOk(await agent.ack(wake.checkpoint_id))
    expect(await agent.ack(wake.checkpoint_id)).toMatchObject({ status: 200, body: { already_acked: true } })

    // Smart triage: the clear edit is applied, the redesign is blocked, the drawing needs a question.
    expectOk(await agent.postStatus("u-red", "applied", { note: "header color -> red" }))
    const applied = await page.waitForEvent((event) => event.event === "applied" && (event.data.unit_ids as string[])?.includes("u-red"))
    expect(applied.data.checkpoint_id).toBe(wake.checkpoint_id)
    await page.waitForEvent((event) => event.event === "unit_status" && event.data.unit_id === "u-red" && event.data.status === "applied")
    expectOk(await agent.postStatus("u-onboarding", "blocked", { note: "beyond polish: a redesign" }))
    await page.waitForEvent((event) => event.event === "unit_status" && event.data.unit_id === "u-onboarding" && event.data.status === "blocked")
    expectOk(await agent.ask("u-drawing", "You boxed the sidebar toggle: hide it, or move it?"))
    const asked = await page.waitForEvent((event) => event.event === "ask" && event.data.unit_id === "u-drawing")
    expect(asked.data.question).toContain("hide it, or move it")
    await page.waitForEvent((event) => event.event === "unit_status" && event.data.unit_id === "u-drawing" && event.data.status === "needs_info")

    // The agent parks; the riffer answers through the interviewer; the answer wakes the agent with answers only.
    const parked = agent.waitHttp()
    await Bun.sleep(100)
    expectOk(await page.send("answer", { unit_id: "u-drawing", text: "Move it, next to the avatar." }))
    const answerWake = await parked
    expect(answerWake.status).toBe(200)
    expect(answerWake.envelope!.kind).toBe("answer")
    expect(answerWake.envelope!.units).toEqual([])
    expect(answerWake.envelope!.annotations).toEqual([])
    expect(answerWake.envelope!.answers).toEqual([{ unit_id: "u-drawing", text: "Move it, next to the avatar." }])
    expectOk(await agent.ack(answerWake.envelope!.checkpoint_id))

    expectOk(await agent.postStatus("u-drawing", "applied", { note: "moved next to the avatar" }))
    await page.waitForEvent((event) => event.event === "applied" && (event.data.unit_ids as string[])?.includes("u-drawing"))

    // The board agrees with what the stream showed, from both readers.
    const summary = (await agent.statusHttp()).body as { units: { by_status: Record<string, number>; list: Array<{ id: string; status: string }> }; answers: number; checkpoints: number }
    expect(summary.units.by_status).toEqual({ applied: 2, blocked: 1, withdrawn: 1 })
    expect(summary.answers).toBe(1)
    expect(summary.checkpoints).toBe(2)
    const cli = (await agent.statusCli()) as { status: string; board: { units: { total: number } } }
    expect(cli.status).toBe("running")
    expect(cli.board.units.total).toBe(4)

    // The session log carries the whole exchange for replay.
    const log = await fs.readFile(path.join(agent.stateDir, "log", "events.ndjson"), "utf8")
    expect(log.split("\n").filter(Boolean)).toHaveLength(page.ackedSeq)
    const agentLog = await fs.readFile(path.join(agent.stateDir, "log", "agent.ndjson"), "utf8")
    expect(agentLog).toContain('"kind":"ask"')
    expect(agentLog).toContain('"kind":"ack"')
  })

  test("AE13: after an applied notice, a stream that does not reconnect within the grace window makes the next wait return page_lost once and then block until reconnect", async () => {
    // A grace window well above scheduler jitter, still inside the wait timeout so the loss below wakes a parked wait.
    const agent = await startAgent({ env: { CE_LIVE_PAGE_LOST_GRACE_MS: "1000" } })
    const page = pageFor(agent)
    await page.openStream()
    await page.sendUnit("u1", "make the header red")
    await page.sendCheckpoint("ck1", "silence", "instant")
    const wake = await agent.waitHttp()
    expect(wake.status).toBe(200)
    expectOk(await agent.ack("ck1"))

    // An ordinary reload inside the grace window is not a loss: the stream is
    // reopened at once and the helper's own state shows the reconnect, no episode, nothing queued.
    expectOk(await agent.postStatus("u1", "applied"))
    await page.waitForEvent((event) => event.event === "applied")
    await page.closeStream()
    await page.openStream()
    await waitUntil(async () => ((await agent.statusHttp()).body.page as { stream: string }).stream === "connected")
    const afterReload = (await agent.statusHttp()).body as { page: { lost_episodes: number }; batches: { unserved: number; unacked: number } }
    expect(afterReload.page.lost_episodes).toBe(0)
    expect(afterReload.batches).toEqual({ unserved: 0, unacked: 0 })
    expect((await agent.waitHttp()).status).toBe(204)

    // Instant mode applies again and this time the page crashes and never comes back.
    // Under Instant the unit wakes by itself the moment it lands; the later checkpoint carries nothing.
    await page.sendUnit("u2", "invert the layout")
    const instantWake = await agent.waitHttp()
    expectOk(instantWake)
    expect((instantWake.envelope as { kind: string; checkpoint_id: string }).kind).toBe("instant")
    await page.sendCheckpoint("ck2", "silence", "instant")
    expectOk(await agent.ack((instantWake.envelope as { checkpoint_id: string }).checkpoint_id))
    expectOk(await agent.postStatus("u2", "applied"))
    await page.waitForEvent((event) => event.event === "applied" && (event.data.unit_ids as string[])?.includes("u2"))
    await page.closeStream()

    const lost = await agent.waitCli()
    expect(lost.exitCode, lost.stderr).toBe(0)
    const envelope = lost.envelope as { checkpoint_id: string; session_status: string; units: unknown[]; kind: string; lost_after_checkpoint_id: string }
    expect(envelope.session_status).toBe("page_lost")
    expect(envelope.units).toEqual([])
    expect(envelope.lost_after_checkpoint_id).toBe("instant-u2")
    // The session is not over: no archive, not ended, the page token still stands.
    const session = await agent.session()
    expect(session.ended).toBe(false)
    expect(session.page_token).toBe(agent.pageToken)
    expect(await fs.exists(path.join(agent.stateDir, "log", "archive.zip"))).toBe(false)
    // One wake per episode: it is a batch like any other (KTD7), re-served
    // until acknowledged and never a second page_lost; once acked the next wait blocks.
    const reserved = await agent.waitHttp()
    expect(reserved.status).toBe(200)
    expect(reserved.envelope!.checkpoint_id).toBe(envelope.checkpoint_id)
    expectOk(await agent.ack(envelope.checkpoint_id))
    expect((await agent.waitHttp()).status).toBe(204)
    expect(((await agent.statusHttp()).body.page as { lost_episodes: number; stream: string })).toMatchObject({ lost_episodes: 1, stream: "lost" })

    // The agent reverts, the page comes back, and the loop continues.
    expectOk(await agent.postStatus("u2", "blocked", { note: "reverted: broke the page" }))
    await page.openStream()
    await waitUntil(async () => ((await agent.statusHttp()).body.page as { stream: string }).stream === "connected")
    await page.sendUnit("u3", "try a softer layout")
    await page.sendCheckpoint("ck3", "silence", "instant")
    const next = await agent.waitHttp()
    expect(next.status).toBe(200)
    expect(next.envelope!.session_status).toBe("live")
    expect(next.envelope!.units.map((unit) => unit.id)).toEqual(["u3"])
  })

  test("AE10 seam: with the helper stopped the page buffers; the restart prints the same page_token and port, replayed envelopes are acknowledged with the pre-restart token, and an un-acked batch is re-served with the original agent token", async () => {
    const agent = await startAgent()
    const page = pageFor(agent)
    const originalPageToken = agent.pageToken
    const originalAgentToken = agent.agentToken
    const originalPort = agent.port
    await page.openStream()
    await page.sendUnit("u1", "make the header red")
    await page.sendCheckpoint("ck1", "silence", "smart")
    // The batch is served but the agent dies before acknowledging it.
    const served = await agent.waitHttp()
    expect(served.status).toBe(200)
    expect(served.envelope!.checkpoint_id).toBe("ck1")

    // Owner death / idle timeout: the process stops, the session does not end.
    await agent.killServer()
    await page.closeStream()
    expect((await agent.session()).ended).toBe(false)
    expect((await page.sendUnit("u2", "and a bigger avatar")).status).toBe(0)
    expect((await page.sendUnit("u3", "then a footer")).status).toBe(0)
    expect((await page.sendCheckpoint("ck2", "silence", "smart")).status).toBe(0)
    expect(page.bufferedCount).toBe(3)
    const status = (await agent.statusCli()) as { status: string; session_ended: boolean; board: { batches: { unacked: number } } }
    expect(status.status).toBe("stopped")
    expect(status.session_ended).toBe(false)
    expect(status.board.batches.unacked).toBe(1)

    // Recovery is the same start against the same root.
    const restarted = await agent.restart()
    expect(restarted.status).toBe("resumed")
    expect(restarted.page_token).toBe(originalPageToken)
    expect(restarted.port).toBe(originalPort)
    expect(agent.url).toBe(page.url)
    expect((await agent.session()).agent_token).toBe(originalAgentToken)

    // The page still holds the token from before the restart and replays from its last ack.
    expect(page.ackedSeq).toBe(2)
    const replayed = await page.replay()
    expect(replayed.status).toBe(200)
    expect(replayed.body.acked_seq).toBe(5)
    await page.openStream()
    await page.waitForEvent((event) => event.event === "ack" && event.data.acked_seq === 5)
    // The reconnecting page is told which units are already past initial.
    await page.waitForEvent((event) => event.event === "unit_status" && event.data.unit_id === "u1" && event.data.status === "triaging")

    // The un-acked batch is re-served first, with the original agent token, then the new one.
    const reserved = await agent.waitHttp(originalAgentToken)
    expect(reserved.status).toBe(200)
    expect(reserved.envelope!.checkpoint_id).toBe("ck1")
    expect(reserved.envelope!.units.map((unit) => unit.id)).toEqual(["u1"])
    expectOk(await agent.ack("ck1"))
    const fresh = await agent.waitCli()
    expect(fresh.exitCode, fresh.stderr).toBe(0)
    const envelope = fresh.envelope as { checkpoint_id: string; units: Array<{ id: string }> }
    expect(envelope.checkpoint_id).toBe("ck2")
    expect(envelope.units.map((unit) => unit.id).sort()).toEqual(["u2", "u3"])
    expectOk(await agent.ack("ck2"))
    // One continuous session log across the restart.
    const log = await fs.readFile(path.join(agent.stateDir, "log", "events.ndjson"), "utf8")
    expect(log.split("\n").filter(Boolean).map((line) => JSON.parse(line).seq)).toEqual([1, 2, 3, 4, 5])
  })
})
