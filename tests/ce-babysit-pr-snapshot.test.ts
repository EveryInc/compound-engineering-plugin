import { describe, expect, test, beforeEach } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

// Regression tests for the ce-babysit-pr pr-snapshot claim->act->confirm engine.
// Exercised via --fetch-file (no live PR), following the tests/*-validator.test.ts
// spawnSync pattern. Locks in the ce-code-review fixes: crash-safety, needs-human
// silencing + open_needs_human visibility, checks_terminal, key-collision, null-head.
const SCRIPT = path.join(import.meta.dir, "..", "skills", "ce-babysit-pr", "scripts", "pr-snapshot")

function fetchFile(dir: string, name: string, obj: unknown): string {
  const p = path.join(dir, name)
  writeFileSync(p, JSON.stringify(obj))
  return p
}

function snapshot(stateDir: string, fetch: string): any {
  const r = spawnSync(
    "python3",
    [SCRIPT, "snapshot", "--pr", "1", "--repo", "o/r", "--state-dir", stateDir, "--fetch-file", fetch],
    { encoding: "utf8" },
  )
  expect(r.status, r.stderr).toBe(0)
  return JSON.parse(r.stdout)
}

function mark(stateDir: string, args: string[]): void {
  // Default the at-mark baseline fetch to empty threads (-> lazy first-observation baseline, no gh
  // call); a test exercising at-mark capture passes its own --fetch-file, which we don't override.
  const extra = args.includes("--fetch-file")
    ? []
    : ["--fetch-file", fetchFile(path.dirname(stateDir), "mark-empty.json", { threads: [] })]
  const r = spawnSync("python3", [SCRIPT, "mark", "--state-dir", stateDir, ...args, ...extra], { encoding: "utf8" })
  expect(r.status, r.stderr).toBe(0)
}

function watch(stateDir: string, fetch: string, extra: string[] = []): any {
  const r = spawnSync(
    "python3",
    [SCRIPT, "watch", "--pr", "1", "--repo", "o/r", "--state-dir", stateDir, "--fetch-file", fetch,
      "--interval", "0.1", "--max-runtime", "1", ...extra],
    { encoding: "utf8" },
  )
  expect(r.status, r.stderr).toBe(0)
  return JSON.parse(r.stdout.trim().split("\n").pop()!) // the wake sentinel is the final line
}

const FAILING = {
  pr_state: "OPEN",
  mergeable: "MERGEABLE",
  merge_state_status: "BLOCKED",
  review_decision: "REVIEW_REQUIRED",
  head_sha: "s1",
  url: "http://x/1",
  checks: [{ key: "CI/test", name: "test", status: "COMPLETED", conclusion: "FAILURE", details_url: "u" }],
  threads: [{ thread_id: "T1", last_comment_id: "C1", last_comment_at: "t1" }],
}

describe("ce-babysit-pr pr-snapshot engine", () => {
  let dir: string
  let state: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "prsnap-"))
    state = path.join(dir, "state")
  })

  test("first snapshot: thread + failing check are actionable; checks terminal", () => {
    const d = snapshot(state, fetchFile(dir, "a.json", FAILING))
    expect(d.counts.threads).toBe(1)
    expect(d.counts.ci).toBe(1)
    expect(d.has_failing_checks).toBe(true)
    expect(d.checks_terminal).toBe(true)
  })

  test("crash-safety: un-marked items stay actionable on the next tick", () => {
    const f = fetchFile(dir, "a.json", FAILING)
    const first = snapshot(state, f)
    const second = snapshot(state, f)
    expect(second.counts.threads).toBe(first.counts.threads)
    expect(second.counts.ci).toBe(first.counts.ci)
  })

  test("needs-human thread: silenced despite the resolver's own reply moving identity, but stays visible via open_needs_human", () => {
    snapshot(state, fetchFile(dir, "a.json", FAILING))
    mark(state, ["--thread", "T1", "--disposition", "needs-human"])
    // The resolver posts decision_context, moving the thread's last-comment identity.
    const replied = { ...FAILING, threads: [{ thread_id: "T1", last_comment_id: "C2", last_comment_at: "t2" }] }
    const d = snapshot(state, fetchFile(dir, "b.json", replied))
    expect(d.counts.threads).toBe(0) // no re-actionize (the P1 fix)
    expect(d.open_needs_human).toBe(1) // still blocks merge-ready
  })

  test("mark --check silences it; a new head SHA re-actionizes", () => {
    const f = fetchFile(dir, "a.json", FAILING)
    snapshot(state, f)
    mark(state, ["--check", "CI/test"])
    expect(snapshot(state, f).counts.ci).toBe(0)
    const newHead = { ...FAILING, head_sha: "s2" }
    expect(snapshot(state, fetchFile(dir, "c.json", newHead)).counts.ci).toBe(1)
  })

  test("checks_terminal is false while a check is IN_PROGRESS; all_checks_ok stays false", () => {
    const inprog = {
      ...FAILING,
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    }
    const d = snapshot(state, fetchFile(dir, "ip.json", inprog))
    expect(d.checks_terminal).toBe(false)
    expect(d.all_checks_ok).toBe(false)
    expect(d.has_failing_checks).toBe(false)
  })

  test("clean + terminal + approved: all_checks_ok true, mergeStateStatus passthrough, no open needs-human", () => {
    const clean = {
      ...FAILING,
      merge_state_status: "CLEAN",
      review_decision: "APPROVED",
      checks: [{ key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
      threads: [],
    }
    const d = snapshot(state, fetchFile(dir, "cl.json", clean))
    expect(d.all_checks_ok).toBe(true)
    expect(d.checks_terminal).toBe(true)
    expect(d.merge_state_status).toBe("CLEAN")
    expect(d.open_needs_human).toBe(0)
  })

  test("colliding check keys are disambiguated (both failing checks surface, neither shadows)", () => {
    const collide = {
      ...FAILING,
      checks: [
        { key: "test", name: "test", status: "COMPLETED", conclusion: "FAILURE", details_url: "u1" },
        { key: "test", name: "test", status: "COMPLETED", conclusion: "FAILURE", details_url: "u2" },
      ],
    }
    expect(snapshot(state, fetchFile(dir, "co.json", collide)).counts.ci).toBe(2)
  })

  test("transient null head falls back to the last known head — no ci_dispatched wipe / re-dispatch thrash", () => {
    const f = fetchFile(dir, "a.json", FAILING)
    snapshot(state, f)
    mark(state, ["--check", "CI/test"])
    const nullHead = { ...FAILING, head_sha: null }
    const d = snapshot(state, fetchFile(dir, "nh.json", nullHead))
    expect(d.head_changed).toBe(false)
    expect(d.counts.ci).toBe(0) // still silenced
  })

  // --- trajectory: deterministic cross-tick facts for non-convergence detection ---
  const GREEN_CHECK = { key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }
  const RED_CHECK = { key: "CI/test", name: "test", status: "COMPLETED", conclusion: "FAILURE", details_url: "u" }

  test("check recurrence: fail -> clear -> fail on a NEW head increments recur (ping-pong signal)", () => {
    snapshot(state, fetchFile(dir, "r1.json", { ...FAILING, head_sha: "s1", checks: [RED_CHECK] }))
    snapshot(state, fetchFile(dir, "r2.json", { ...FAILING, head_sha: "s2", checks: [GREEN_CHECK] }))
    const d = snapshot(state, fetchFile(dir, "r3.json", { ...FAILING, head_sha: "s3", checks: [RED_CHECK] }))
    expect(d.trajectory.check_recur_max).toBe(1)
    expect(d.trajectory.recurring_checks).toEqual([{ key: "CI/test", recur: 1 }])
  })

  test("same-head flapping is NOT recurrence (flaky, not ping-pong)", () => {
    const f = { ...FAILING, head_sha: "s1" }
    snapshot(state, fetchFile(dir, "f1.json", { ...f, checks: [RED_CHECK] }))
    snapshot(state, fetchFile(dir, "f2.json", { ...f, checks: [GREEN_CHECK] }))
    const d = snapshot(state, fetchFile(dir, "f3.json", { ...f, checks: [RED_CHECK] }))
    expect(d.trajectory.check_recur_max).toBe(0)
  })

  test("review backlog trend rises and new-thread arrivals are counted (treadmill signal)", () => {
    const th = (ids: string[]) => ids.map((id) => ({ thread_id: id, last_comment_id: `c-${id}`, last_comment_at: id }))
    snapshot(state, fetchFile(dir, "t1.json", { ...FAILING, checks: [], threads: th(["T1"]) }))
    snapshot(state, fetchFile(dir, "t2.json", { ...FAILING, checks: [], threads: th(["T1", "T2"]) }))
    const d = snapshot(state, fetchFile(dir, "t3.json", { ...FAILING, checks: [], threads: th(["T1", "T2", "T3", "T4"]) }))
    expect(d.trajectory.unresolved_trend).toBe("rising")
    expect(d.trajectory.new_threads_this_tick).toBe(2) // T3, T4 are new this tick
    expect(d.trajectory.unresolved_threads).toBe(4)
  })

  test("check_recur_max does not stay elevated after the recurring check leaves CI (stale-key prune)", () => {
    snapshot(state, fetchFile(dir, "p1.json", { ...FAILING, head_sha: "s1", checks: [RED_CHECK] }))
    snapshot(state, fetchFile(dir, "p2.json", { ...FAILING, head_sha: "s2", checks: [GREEN_CHECK] }))
    expect(snapshot(state, fetchFile(dir, "p3.json", { ...FAILING, head_sha: "s3", checks: [RED_CHECK] })).trajectory.check_recur_max).toBe(1)
    // CI/test is gone from the run (renamed/removed); its recurrence must not linger.
    const other = { key: "CI/other", name: "other", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }
    const d = snapshot(state, fetchFile(dir, "p4.json", { ...FAILING, head_sha: "s4", checks: [other] }))
    expect(d.trajectory.check_recur_max).toBe(0)
  })

  test("heads_since_progress climbs on a persistent failure across heads, but resets on progressive migration", () => {
    // Same check red across three new heads with nothing clearing = a stall.
    snapshot(state, fetchFile(dir, "s1.json", { ...FAILING, head_sha: "h1", checks: [RED_CHECK], threads: [] }))
    expect(snapshot(state, fetchFile(dir, "s2.json", { ...FAILING, head_sha: "h2", checks: [RED_CHECK], threads: [] })).trajectory.heads_since_progress).toBe(1)
    expect(snapshot(state, fetchFile(dir, "s3.json", { ...FAILING, head_sha: "h3", checks: [RED_CHECK], threads: [] })).trajectory.heads_since_progress).toBe(2)
    // A different check now fails (A cleared, B appeared) = progressive migration, not a stall -> reset.
    const other = { key: "CI/other", name: "other", status: "COMPLETED", conclusion: "FAILURE", details_url: "u" }
    expect(snapshot(state, fetchFile(dir, "s4.json", { ...FAILING, head_sha: "h4", checks: [other], threads: [] })).trajectory.heads_since_progress).toBe(0)
  })

  test("parking a thread counts as progress: it leaves the non-parked problem set, so no-progress resets", () => {
    const withThread = (headSha: string) => ({
      ...FAILING,
      head_sha: headSha,
      checks: [RED_CHECK],
      threads: [{ thread_id: "T1", last_comment_id: "c1", last_comment_at: "t1" }],
    })
    snapshot(state, fetchFile(dir, "pk1.json", withThread("h1"))) // problems: {CI/test, T1}
    mark(state, ["--thread", "T1", "--disposition", "needs-human"])
    // New head, CI/test still red, T1 now parked (excluded from problems) -> total drops 2->1 = a new low.
    const d = snapshot(state, fetchFile(dir, "pk2.json", withThread("h2")))
    expect(d.open_needs_human).toBe(1)
    expect(d.trajectory.heads_since_progress).toBe(0) // progress was made (a problem left the set), despite the head change
  })

  test("a rerun (IN_PROGRESS) is not a clear — no false recurrence when it fails again", () => {
    snapshot(state, fetchFile(dir, "ir1.json", { ...FAILING, head_sha: "s1", checks: [RED_CHECK] }))
    const rerun = { ...FAILING, head_sha: "s2", checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }] }
    snapshot(state, fetchFile(dir, "ir2.json", rerun))
    const d = snapshot(state, fetchFile(dir, "ir3.json", { ...FAILING, head_sha: "s3", checks: [RED_CHECK] }))
    expect(d.trajectory.check_recur_max).toBe(0)
  })

  test("mark --disposition open re-actionizes a parked needs-human thread (the re-open path)", () => {
    const f = fetchFile(dir, "ro.json", FAILING)
    snapshot(state, f)
    mark(state, ["--thread", "T1", "--disposition", "needs-human"])
    expect(snapshot(state, f).open_needs_human).toBe(1) // parked, not actionable
    mark(state, ["--thread", "T1", "--disposition", "open"])
    const d = snapshot(state, f)
    expect(d.counts.threads).toBe(1) // re-opened -> actionable again
    expect(d.open_needs_human).toBe(0)
  })

  test("a dispatched thread reactivates when a later reviewer comment moves its identity, but not on our own reply (acted_identity baseline)", () => {
    // The false-green fix: a dispatched-but-unresolved thread with fresh reviewer activity must
    // return to actionable, or it stays hidden from counts.threads and lets merge-ready fire.
    const sd = path.join(dir, "react")
    const thr = (cid: string) => ({
      pr_state: "OPEN", mergeable: "MERGEABLE", merge_state_status: "CLEAN", review_decision: null,
      head_sha: "s1", url: "http://x/1", checks: [],
      threads: [{ thread_id: "T1", last_comment_id: cid, last_comment_at: cid }],
    })
    snapshot(sd, fetchFile(dir, "r1.json", thr("C1"))) // open -> actionable
    mark(sd, ["--thread", "T1", "--disposition", "dispatched"])
    // first post-action observation adopts the current identity (our reply) as baseline -> silenced
    expect(snapshot(sd, fetchFile(dir, "r2.json", thr("C1"))).counts.threads).toBe(0)
    // same identity on a later tick -> still silenced (our own reply does not re-trigger)
    expect(snapshot(sd, fetchFile(dir, "r3.json", thr("C1"))).counts.threads).toBe(0)
    // a genuine reviewer reply moves the identity to C2 -> reactivated
    expect(snapshot(sd, fetchFile(dir, "r4.json", thr("C2"))).counts.threads).toBe(1)
  })

  test("a needs-human thread reactivates when a human answers it (a later reply past the baseline), not on our own decision_context reply", () => {
    const sd = path.join(dir, "nhreact")
    const thr = (cid: string) => ({
      ...FAILING, checks: [], threads: [{ thread_id: "T1", last_comment_id: cid, last_comment_at: cid }],
    })
    snapshot(sd, fetchFile(dir, "nh1.json", thr("C1")))
    mark(sd, ["--thread", "T1", "--disposition", "needs-human"])
    // first observation after our decision_context reply (C2) -> adopt as baseline, stays parked
    const d1 = snapshot(sd, fetchFile(dir, "nh2.json", thr("C2")))
    expect(d1.counts.threads).toBe(0)
    expect(d1.open_needs_human).toBe(1) // still parked, blocks merge-ready
    // a human replies past the baseline (C3) -> reactivated to actionable, no longer parked
    const d2 = snapshot(sd, fetchFile(dir, "nh3.json", thr("C3")))
    expect(d2.counts.threads).toBe(1) // reopened -> the loop reprocesses with the human's input
    expect(d2.open_needs_human).toBe(0)
  })

  test("blocked_external waits for other running checks — does not fire while a check is still IN_PROGRESS", () => {
    const RUNNING = { key: "CI/b", name: "b", status: "IN_PROGRESS", conclusion: null, details_url: "u" }
    const GREEN = { key: "CI/a", name: "a", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }
    // awaiting approval + a still-running check -> NOT blocked_external yet (that check could fail)
    const running = { ...FAILING, threads: [], checks: [RUNNING], awaiting_approval: 1 }
    expect(snapshot(path.join(dir, "be1"), fetchFile(dir, "be1.json", running)).blocked_external).toBe(false)
    // awaiting approval + all other checks terminal -> blocked_external
    const terminal = { ...FAILING, threads: [], checks: [GREEN], awaiting_approval: 1 }
    expect(snapshot(path.join(dir, "be2"), fetchFile(dir, "be2.json", terminal)).blocked_external).toBe(true)
  })

  test("a dispatched (handled) top-level comment does not inflate heads_since_progress across heads", () => {
    // A handled comment never drops out of the fetch, so counting it as an open problem would keep
    // heads_since_progress climbing forever and falsely trip non-convergence on unrelated later work.
    const sd = path.join(dir, "stall")
    const fb = (head: string) => ({
      ...FAILING, head_sha: head, checks: [], threads: [], feedback: [{ id: "IC_1", kind: "comment", author: "r", edit_id: "h" }],
    })
    snapshot(sd, fetchFile(dir, "st1.json", fb("s1"))) // IC_1 open -> a problem
    mark(sd, ["--comment", "IC_1", "--disposition", "dispatched", "--acted-edit-id", "h"])
    const d = snapshot(sd, fetchFile(dir, "st2.json", fb("s2"))) // dispatched + head moved -> handled, progress
    expect(d.trajectory.heads_since_progress).toBe(0)
  })

  test("a watch poll does not consume new_threads_this_tick — the agent's tick still sees the new arrival", () => {
    // The watch's waking poll persists change-detection state but must NOT roll the trajectory, or it
    // marks the just-arrived thread "seen" and the agent's real tick reads 0 new arrivals — hiding a
    // review-bot treadmill from the non-convergence trigger.
    const sd = path.join(dir, "trajwatch")
    const noThreads = { ...FAILING, checks: [], threads: [] }
    snapshot(sd, fetchFile(dir, "tw1.json", noThreads)) // agent tick: baseline, no threads
    const withThread = { ...FAILING, checks: [], threads: [{ thread_id: "T1", last_comment_id: "C1", last_comment_at: "C1" }] }
    expect(watch(sd, fetchFile(dir, "tw2.json", withThread)).reason).toBe("actionable") // a poll wakes on the new thread
    // the agent's real tick then still counts T1 as newly arrived (the poll didn't mark it seen)
    expect(snapshot(sd, fetchFile(dir, "tw3.json", withThread)).trajectory.new_threads_this_tick).toBe(1)
  }, 15000)

  test("heads_since_progress counts head moves across AGENT ticks even when a poll observed the new head first (C2)", () => {
    const sd = path.join(dir, "hspwatch")
    const failAt = (head: string) => ({ ...FAILING, head_sha: head, threads: [], checks: [{ key: "CI/x", name: "x", status: "COMPLETED", conclusion: "FAILURE", details_url: "u" }] })
    snapshot(sd, fetchFile(dir, "hw1.json", failAt("s1"))) // agent tick: persistent failure at head s1
    watch(sd, fetchFile(dir, "hw2.json", failAt("s2"))) // a poll observes+persists head s2 (no trajectory roll)
    const d = snapshot(sd, fetchFile(dir, "hw3.json", failAt("s2"))) // agent tick at s2
    expect(d.trajectory.heads_since_progress).toBe(1) // head moved s1->s2 between agent ticks; not starved by the poll
  }, 15000)

  test("check recurrence catches a CLEAR observed only on a watch poll (C1)", () => {
    const sd = path.join(dir, "recurwatch")
    const RED = { key: "CI/x", name: "x", status: "COMPLETED", conclusion: "FAILURE", details_url: "u" }
    const GREEN = { key: "CI/x", name: "x", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }
    snapshot(sd, fetchFile(dir, "rw1.json", { ...FAILING, head_sha: "s1", threads: [], checks: [RED] })) // fail h1
    watch(sd, fetchFile(dir, "rw2.json", { ...FAILING, head_sha: "s2", threads: [], checks: [GREEN] })) // a poll observes the CLEAR
    const d = snapshot(sd, fetchFile(dir, "rw3.json", { ...FAILING, head_sha: "s3", threads: [], checks: [RED] })) // fail h3
    expect(d.trajectory.check_recur_max).toBe(1) // fail -> clear(seen only on a poll) -> fail = recurrence
  }, 15000)

  test("--reset-session restarts the budget clock so a resumed watch is not instantly over-budget", () => {
    const sd = path.join(dir, "sess")
    snapshot(sd, fetchFile(dir, "se1.json", FAILING)) // creates state with started_at = now
    // simulate resuming days later against persisted state: backdate started_at
    const statePath = path.join(sd, "state.json")
    const st = JSON.parse(readFileSync(statePath, "utf8"))
    st.started_at = "2020-01-01T00:00:00+00:00"
    writeFileSync(statePath, JSON.stringify(st))
    // without reset -> session_seconds is huge (measured from 2020)
    expect(snapshot(sd, fetchFile(dir, "se2.json", FAILING)).session_seconds).toBeGreaterThan(1_000_000)
    // with --reset-session -> the clock restarts, session_seconds ~0
    const r = spawnSync("python3", [SCRIPT, "snapshot", "--pr", "1", "--repo", "o/r", "--state-dir", sd,
      "--fetch-file", fetchFile(dir, "se3.json", FAILING), "--reset-session"], { encoding: "utf8" })
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout).session_seconds).toBeLessThan(10)
  })

  test("clearing a fork approval gate is movement (resets the settle clock so merge-ready waits for check-runs)", () => {
    const sd = path.join(dir, "appr")
    const gated = { ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED", checks: [], threads: [], awaiting_approval: 1 }
    snapshot(sd, fetchFile(dir, "ap1.json", gated)) // first tick
    expect(snapshot(sd, fetchFile(dir, "ap2.json", gated)).changed_this_tick).toBe(false) // stable gate, no movement
    // approval clears (no check-runs created yet) -> registered as movement so quiet resets
    expect(snapshot(sd, fetchFile(dir, "ap3.json", { ...gated, awaiting_approval: 0 })).changed_this_tick).toBe(true)
  })

  test("mark --thread captures the acted baseline at mark time (closes the reviewer-reply race)", () => {
    const sd = path.join(dir, "atmark")
    const thr = (cid: string) => ({
      ...FAILING, checks: [], threads: [{ thread_id: "T1", last_comment_id: cid, last_comment_at: cid }],
    })
    snapshot(sd, fetchFile(dir, "am1.json", thr("C1")))
    // our decision_context reply is C2; marking WITH the current fetch captures C2 as the baseline now
    mark(sd, ["--thread", "T1", "--disposition", "needs-human", "--fetch-file", fetchFile(dir, "am2.json", thr("C2"))])
    // a reviewer reply that raced in (C3) before the next snapshot -> reactivated, not swallowed as baseline
    const d = snapshot(sd, fetchFile(dir, "am3.json", thr("C3")))
    expect(d.counts.threads).toBe(1) // C3 != the C2 baseline captured at mark -> reopened
    expect(d.open_needs_human).toBe(0)
  })

  test("mark --comment with --acted-edit-id captures the baseline at mark time (closes the edit race)", () => {
    const sd = path.join(dir, "cmark")
    const fb = (edit: string) => ({
      ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED", checks: [], threads: [],
      feedback: [{ id: "IC_1", kind: "comment", author: "reviewer", edit_id: edit }],
    })
    snapshot(sd, fetchFile(dir, "cm1.json", fb("h1")))
    // mark dispatched with the snapshot-time edit_id (h1) as the explicit baseline (our reply never edits it)
    mark(sd, ["--comment", "IC_1", "--disposition", "dispatched", "--acted-edit-id", "h1"])
    // an edit that races in (h2) before the next snapshot -> reactivated, not swallowed as baseline
    expect(snapshot(sd, fetchFile(dir, "cm2.json", fb("h2"))).counts.comments).toBe(1)
  })

  test("a dispatched thread reactivates when an EARLIER comment is edited (same last_comment_id, bumped last_comment_at)", () => {
    // fetch_threads sets last_comment_at = max edit/create time across the whole thread, so an edit
    // to an earlier comment (last_comment_id unchanged) still moves the identity and reopens it.
    const sd = path.join(dir, "editearlier")
    const thr = (at: string) => ({
      ...FAILING, checks: [], threads: [{ thread_id: "T1", last_comment_id: "R1", last_comment_at: at }],
    })
    snapshot(sd, fetchFile(dir, "ee1.json", thr("t1")))
    mark(sd, ["--thread", "T1", "--disposition", "dispatched"]) // lazy baseline
    expect(snapshot(sd, fetchFile(dir, "ee2.json", thr("t1"))).counts.threads).toBe(0) // baseline (R1,t1) -> silenced
    // reviewer edits an earlier comment: last_comment_id stays R1 but the thread's max edit time bumps
    expect(snapshot(sd, fetchFile(dir, "ee3.json", thr("t2"))).counts.threads).toBe(1) // reactivated
  })

  test("a dispatched top-level comment reactivates when its body is edited (edit_id changes), not on our reply", () => {
    // A non-actionable wrapper marked dispatched, later edited to add an actionable request, must
    // return to actionable — our own reply is a separate top-level comment and never edits it.
    const sd = path.join(dir, "editfb")
    const fb = (edit: string) => ({
      ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED", checks: [], threads: [],
      feedback: [{ id: "IC_1", kind: "comment", author: "reviewer", edit_id: edit }],
    })
    snapshot(sd, fetchFile(dir, "e1.json", fb("h1"))) // actionable
    mark(sd, ["--comment", "IC_1", "--disposition", "dispatched"])
    expect(snapshot(sd, fetchFile(dir, "e2.json", fb("h1"))).counts.comments).toBe(0) // same body -> silenced
    expect(snapshot(sd, fetchFile(dir, "e3.json", fb("h2"))).counts.comments).toBe(1) // edited -> reactivated
  })

  test("a fork-PR workflow awaiting maintainer approval blocks 'all_checks_ok' and flags blocked_external", () => {
    const gated = {
      ...FAILING,
      merge_state_status: "UNSTABLE",
      review_decision: "",
      checks: [{ key: "Track", name: "Track", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
      threads: [],
      awaiting_approval: 1, // real CI hasn't run — awaiting a base-repo maintainer's approval
    }
    const d = snapshot(state, fetchFile(dir, "aa.json", gated))
    expect(d.checks_awaiting_approval).toBe(1)
    expect(d.has_failing_checks).toBe(false)
    expect(d.all_checks_ok).toBe(false) // not "ok" — the gated CI is invisible to the rollup
    expect(d.blocked_external).toBe(true)
  })

  test("an empty statusCheckRollup (no check-runs yet) is not ok — checks_present false blocks a pipeline false-success", () => {
    const noChecks = { ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED", checks: [], threads: [] }
    const d = snapshot(state, fetchFile(dir, "nc.json", noChecks))
    expect(d.checks_present).toBe(false)
    expect(d.all_checks_ok).toBe(false) // no observed checks -> not "ok"; the pipeline stop must not exit-success
    expect(d.checks_terminal).toBe(true) // vacuously terminal on an empty set — exactly why checks_present is needed
  })

  test("_resolve_repo_ref parses the host from the PR URL so gh api targets GHE, not github.com", () => {
    const r = spawnSync(
      "python3",
      [
        "-c",
        `from importlib.machinery import SourceFileLoader; ` +
          `m=SourceFileLoader('prs', ${JSON.stringify(SCRIPT)}).load_module(); ` +
          `print(m._resolve_repo_ref('', 'https://ghe.acme.com/o/r/pull/5')); ` +
          `print(m._host_args('ghe.acme.com')); print(m._host_args(None))`,
      ],
      { encoding: "utf8" },
    )
    expect(r.status, r.stderr).toBe(0)
    const lines = r.stdout.trim().split("\n")
    expect(lines[0]).toBe("('o', 'r', 'ghe.acme.com')")
    expect(lines[1]).toBe("['--hostname', 'ghe.acme.com']")
    expect(lines[2]).toBe("[]")
  })

  test("cross-stream alternation: ci-only then review-only then ci-only ticks flip (churn signal)", () => {
    const th = (ids: string[]) => ids.map((id) => ({ thread_id: id, last_comment_id: `c-${id}`, last_comment_at: id }))
    snapshot(state, fetchFile(dir, "a1.json", { ...FAILING, head_sha: "s1", checks: [RED_CHECK], threads: [] }))
    snapshot(state, fetchFile(dir, "a2.json", { ...FAILING, head_sha: "s2", checks: [GREEN_CHECK], threads: th(["T1"]) }))
    const d = snapshot(state, fetchFile(dir, "a3.json", { ...FAILING, head_sha: "s3", checks: [RED_CHECK], threads: [] }))
    expect(d.trajectory.stream_alternations).toBe(2) // ci -> review -> ci
  })

  test("non-thread feedback: a top-level comment / review body is actionable, mark --comment silences it, needs-human blocks ready", () => {
    const withFeedback = {
      ...FAILING,
      merge_state_status: "CLEAN",
      review_decision: "APPROVED",
      checks: [GREEN_CHECK],
      threads: [],
      feedback: [
        { id: "IC_1", kind: "comment", author: "reviewer" },
        { id: "PRR_1", kind: "review", author: "coderabbit", state: "COMMENTED" },
      ],
    }
    const f = fetchFile(dir, "fb.json", withFeedback)
    const d = snapshot(state, f)
    expect(d.counts.comments).toBe(2) // both surfaced as actionable review items with no inline thread
    expect(d.actionable.comments.map((c: any) => c.id).sort()).toEqual(["IC_1", "PRR_1"])

    mark(state, ["--comment", "IC_1", "--disposition", "dispatched"])
    mark(state, ["--comment", "PRR_1", "--disposition", "needs-human"])
    const d2 = snapshot(state, f)
    expect(d2.counts.comments).toBe(0) // dispatched item silenced; needs-human item parked, not actionable
    expect(d2.open_needs_human).toBe(1) // parked comment blocks merge-ready just like a parked thread
  })

  test("_extract_feedback excludes the PR author and pure CI/status bots (incl [bot] suffix), keeps review bots and non-empty review bodies", () => {
    const v = {
      author: { login: "me" },
      comments: [
        { id: "c-me", author: { login: "me" }, body: "my own note" }, // author -> excluded
        { id: "c-cov", author: { login: "codecov[bot]" }, body: "coverage -0.1%" }, // CI bot -> excluded
        { id: "c-rev", author: { login: "octo-reviewer" }, body: "please rename this" }, // human -> kept
        { id: "c-empty", author: { login: "octo-reviewer" }, body: "   " }, // empty -> excluded
      ],
      reviews: [
        { id: "r-cr", author: { login: "coderabbitai[bot]" }, body: "overall LGTM but see nits", state: "COMMENTED" }, // review bot -> kept
        { id: "r-empty", author: { login: "octo-reviewer" }, body: "", state: "APPROVED" }, // empty body -> excluded
      ],
    }
    const r = spawnSync(
      "python3",
      [
        "-c",
        `import json; from importlib.machinery import SourceFileLoader; ` +
          `m=SourceFileLoader('prs', ${JSON.stringify(SCRIPT)}).load_module(); ` +
          `print(json.dumps([f['id'] for f in m._extract_feedback(json.loads(${JSON.stringify(JSON.stringify(v))}))]))`,
      ],
      { encoding: "utf8" },
    )
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout.trim()).sort()).toEqual(["c-rev", "r-cr"])
  })

  test("watch: wakes on actionable backlog, terminal, and merge-ready-after-settle; times out on clean-not-settled", () => {
    const GREEN = { key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }
    // actionable backlog (FAILING has an unresolved thread + a failing check) -> wake
    expect(watch(path.join(dir, "w1"), fetchFile(dir, "wa.json", FAILING)).reason).toBe("actionable")
    // terminal PR -> wake regardless of backlog
    const term = fetchFile(dir, "wt.json", { ...FAILING, pr_state: "CLOSED", threads: [], checks: [] })
    expect(watch(path.join(dir, "w2"), term).reason).toBe("terminal")
    // clean + green but not yet settled (settle 300 > quiet ~0) -> keep watching -> times out
    const clean = { ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED", threads: [], checks: [GREEN] }
    const cf = fetchFile(dir, "wc.json", clean)
    expect(watch(path.join(dir, "w3"), cf, ["--settle-seconds", "300"]).reason).toBe("max-runtime")
    // same clean state with a zero settle window -> merge-ready wake
    expect(watch(path.join(dir, "w4"), cf, ["--settle-seconds", "0"]).reason).toBe("merge-ready")
  }, 15000) // spawns 4 watch subprocesses incl. a max-runtime timeout -> explicit timeout over Bun's 5s default

  test("watch: an in-progress review signal blocks the merge-ready wake regardless of quiet time", () => {
    // "Looks ready" is signal-gated: a green/CLEAN PR with a review still in flight (review_in_progress)
    // must NOT wake merge-ready even with a zero settle window — time is not the gate.
    const GREEN = { key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }
    const base = { ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED", threads: [], checks: [GREEN] }
    const inprog = fetchFile(dir, "rip1.json", { ...base, review_in_progress: true })
    expect(watch(path.join(dir, "rip1"), inprog, ["--settle-seconds", "0"]).reason).toBe("max-runtime")
    const nosig = fetchFile(dir, "rip2.json", { ...base, review_in_progress: false })
    expect(watch(path.join(dir, "rip2"), nosig, ["--settle-seconds", "0"]).reason).toBe("merge-ready")
  }, 15000)

  test("watch: a no-check MERGEABLE/CLEAN PR still reaches merge-ready (the >=1-check guard is pipeline-only)", () => {
    // A repo with no configured checks: all_checks_ok is false (no observed check), but the
    // interactive merge-ready wake must still fire for a CLEAN/MERGEABLE PR with no backlog.
    const nochecks = { ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED", threads: [], checks: [] }
    expect(watch(path.join(dir, "nc1"), fetchFile(dir, "nc1.json", nochecks), ["--settle-seconds", "0"]).reason).toBe("merge-ready")
  }, 15000)

  test("watch: a dispatched terminal-red check present at arm is a standing residual — kept watching, not re-woken", () => {
    // A failing check ce-debug marked dispatched leaves counts.ci == 0 while has_failing_checks stays
    // true. It was already surfaced when it was dispatched, so it is in the watch's arm-time baseline
    // and must NOT re-wake the loop (that was the pre-gating behavior); the watch keeps running for
    // other streams. `blocked-failing` only fires on a *later* transition to terminal-red (e.g. a
    // rerun completing red) — the same wake-on-new path the parked-needs-human test exercises.
    const red = { ...FAILING, threads: [], checks: [{ key: "CI/test", name: "test", status: "COMPLETED", conclusion: "FAILURE", details_url: "u" }] }
    const rf = fetchFile(dir, "wbf.json", red)
    const sd = path.join(dir, "wbf")
    snapshot(sd, rf) // the failing check is actionable on this first tick
    mark(sd, ["--check", "CI/test"]) // now dispatched -> counts.ci == 0, terminal-red residual, already surfaced
    expect(watch(sd, rf).reason).toBe("max-runtime")
  }, 15000)

  test("watch: a parked needs-human does not wake or end the loop — it keeps watching the other streams", () => {
    // The stop-vs-residual fix: a standing needs-human present at arm time must NOT re-wake the
    // detector (that would busy-wake / falsely terminate the self-sustaining watch); the watch keeps
    // polling for new work and only wakes when something genuinely new arrives.
    const sd = path.join(dir, "nhwatch")
    const base = (extra: any[] = []) => ({
      pr_state: "OPEN", mergeable: "MERGEABLE", merge_state_status: "CLEAN", review_decision: null,
      head_sha: "s1", url: "http://x/1", checks: [],
      threads: [{ thread_id: "T1", last_comment_id: "C1", last_comment_at: "C1" }, ...extra],
    })
    snapshot(sd, fetchFile(dir, "nhw1.json", base()))
    mark(sd, ["--thread", "T1", "--disposition", "needs-human"])
    // parked needs-human, nothing else actionable -> keeps watching, times out (does NOT wake needs-human)
    expect(watch(sd, fetchFile(dir, "nhw2.json", base())).reason).toBe("max-runtime")
    // a new actionable thread arrives while the needs-human stays parked -> wakes on the new work
    const withNew = fetchFile(dir, "nhw3.json", base([{ thread_id: "T2", last_comment_id: "D1", last_comment_at: "D1" }]))
    expect(watch(sd, withNew).reason).toBe("actionable")
  }, 15000)
})
