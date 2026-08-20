import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import {
  ADAPTER,
  SCRIPT,
  authorizeDispatch,
  ctl,
  ctlWithEnv,
  ctlWithScript,
  ctlWithScriptAndEnv,
  fakeDoneJob,
  fakeRunningJob,
  git,
  init,
  initWithBinding,
  initWithPrompt,
  makeRepo,
  ownerRootProbe,
  packetDigest,
  packetFile,
  registerWorkspaceCleanup,
  sh,
  terminalizeFakeJob,
  tmp,
  worktreePaths,
} from "./helpers/ce-work-workspace-harness"

setDefaultTimeout(30_000)

registerWorkspaceCleanup()

const DISPATCH_RECEIPT_RACE = path.join(__dirname, "../fixtures/ce-work-dispatch-receipt-race.py")

function ctlWithDispatchReceiptRace(
  runsRoot: string,
  mode: "record-job" | "resume",
  runId: string,
  unitId: string,
  jobId: string,
) {
  const result = spawnSync(
    "python3",
    [DISPATCH_RECEIPT_RACE, path.dirname(SCRIPT), mode, runId, unitId, jobId],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CE_WORK_RUNS_ROOT: runsRoot,
        CE_PEER_JOBS_ROOT: path.dirname(runsRoot),
      },
    },
  )
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

describe("ce-work unit workspace controller: run discovery and native fallback", () => {
  test("lists matching unfinished runs rather than guessing and fails closed on unsafe candidates", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-one", f)
    init(runs, "run-two", f)

    const ambiguous = ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest)
    expect(ambiguous.word).toBe("AMBIGUOUS")
    expect(ambiguous.body.candidates.map((candidate: any) => candidate.run_id)).toEqual(["run-one", "run-two"])
    expect(ctl(runs, "resume", "--run-id", "run-one").body.actions).toEqual([])

    rmSync(path.join(runs, "run-two"), { recursive: true })
    const unique = ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest)
    expect(unique.word).toBe("RESUMED")
    expect(unique.body.run_id).toBe("run-one")

    init(runs, "run-two", f)
    chmodSync(path.join(runs, "run-two", "manifest.json"), 0o644)
    const unsafe = ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest)
    expect(unsafe.word).toBe("UNREADABLE")
    expect(unsafe.body).toBeNull()
  })

  test("ignores a tampered prompt run when discovering a matching plan run", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    expect(init(runs, "run-plan", f).word).toBe("READY")
    const prompt = initWithPrompt(runs, "run-prompt", f, "Implement the requested change")
    expect(prompt.result.word).toBe("READY")
    writeFileSync(path.join(runs, "run-prompt", "source", "bare-prompt.md"), "tampered\n")

    const resumed = ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest)
    expect(resumed.word).toBe("RESUMED")
    expect(resumed.body.run_id).toBe("run-plan")

    const planManifestPath = path.join(runs, "run-plan", "manifest.json")
    const planManifest = JSON.parse(readFileSync(planManifestPath, "utf8"))
    planManifest.source.storage = "run"
    writeFileSync(planManifestPath, `${JSON.stringify(planManifest)}\n`)
    expect(ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest).word).toBe("UNREADABLE")
  })

  test("never authorizes fallback for a live attempt and claims terminal prefer fallback exactly once", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-fallback", f)
    ctl(runs, "prepare", "--run-id", "run-fallback", "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"))
    const job = fakeRunningJob(runs, "run-fallback", "U", "packet")
    ctl(runs, "record-job", "--run-id", "run-fallback", "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job)

    const live = ctl(runs, "resume", "--run-id", "run-fallback")
    expect(live.body.actions).toContainEqual({ unit_id: "U", action: "monitored", process_state: "running" })
    expect(ctl(runs, "claim-fallback", "--run-id", "run-fallback", "--unit-id", "U", "--caller-mode", "headless").word).toBe("REFUSED")

    terminalizeFakeJob(runs, "run-fallback", job, "failed")
    expect(ctl(runs, "resume", "--run-id", "run-fallback").body.actions).toContainEqual({ unit_id: "U", action: "monitored", process_state: "failed" })
    writeFileSync(path.join(f.repo, "unexpected.txt"), "host dirt\n")
    expect(ctl(runs, "claim-fallback", "--run-id", "run-fallback", "--unit-id", "U", "--caller-mode", "headless").word).toBe("BLOCKED")
    rmSync(path.join(f.repo, "unexpected.txt"))
    const first = ctl(runs, "claim-fallback", "--run-id", "run-fallback", "--unit-id", "U", "--caller-mode", "headless")
    expect(first.word).toBe("FALLBACK_AUTHORIZED")
    expect(first.body.start_native).toBe(true)
    expect(first.body.reason).toBe("failed")
    const again = ctl(runs, "claim-fallback", "--run-id", "run-fallback", "--unit-id", "U", "--caller-mode", "headless")
    expect(again.word).toBe("FALLBACK_ALREADY_AUTHORIZED")
    expect(again.body.start_native).toBe(false)

    const baseTree = git(f.repo, "rev-parse", "HEAD^{tree}")
    const unrelatedHead = git(f.repo, "commit-tree", baseTree, "-m", "unrelated native history")
    git(f.repo, "reset", "--hard", unrelatedHead)
    expect(ctl(
      runs, "complete-fallback", "--run-id", "run-fallback", "--unit-id", "U",
      "--accepted-head", unrelatedHead, "--evidence-digest", "a".repeat(64), "--summary", "native checks passed",
    ).word).toBe("BLOCKED")
    git(f.repo, "reset", "--hard", f.base)

    expect(ctl(
      runs, "complete-fallback", "--run-id", "run-fallback", "--unit-id", "U",
      "--accepted-head", f.base, "--evidence-digest", "not-a-digest", "--summary", "native checks passed",
    ).word).toBe("REFUSED")
    expect(ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest).body.run_id).toBe("run-fallback")

    writeFileSync(path.join(f.repo, "native.txt"), "accepted native implementation\n")
    expect(ctl(
      runs, "complete-fallback", "--run-id", "run-fallback", "--unit-id", "U",
      "--accepted-head", f.base, "--evidence-digest", "a".repeat(64), "--summary", "native checks passed",
    ).word).toBe("BLOCKED")
    git(f.repo, "add", "native.txt")
    git(f.repo, "commit", "-m", "native implementation")
    const nativeHead = git(f.repo, "rev-parse", "HEAD")
    const completed = ctl(
      runs, "complete-fallback", "--run-id", "run-fallback", "--unit-id", "U",
      "--accepted-head", nativeHead, "--evidence-digest", "a".repeat(64), "--summary", "native checks passed",
    )
    expect(completed.word).toBe("FALLBACK_COMPLETED")
    expect(completed.body.completion).toMatchObject({
      base: f.base,
      accepted_head: nativeHead,
      evidence_digest: "a".repeat(64),
      summary: "native checks passed",
      snapshot: { head: nativeHead, status_empty: true },
    })
    expect(ctl(runs, "status", "--run-id", "run-fallback", "--unit-id", "U").body.unit.state).toBe("native-completed")
    expect(ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest).body.run_id).toBe("run-fallback")
    const fallbackVerification = ctl(
      runs, "verify-run", "--run-id", "run-fallback",
      "--verification-summary", "native fallback plan gate passed",
      "--", "python3", "-c", "raise SystemExit(0)",
    )
    expect(fallbackVerification.word).toBe("RUN_VERIFIED")
    expect(ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest).word).toBe("NOT_FOUND")
    expect(ctl(
      runs, "complete-fallback", "--run-id", "run-fallback", "--unit-id", "U",
      "--accepted-head", nativeHead, "--evidence-digest", "a".repeat(64), "--summary", "native checks passed",
    ).word).toBe("REFUSED")

    const manifestPath = path.join(runs, "run-fallback", "manifest.json")
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    manifest.units.U.attempts[0].fallback.completed.snapshot.status_empty = false
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`)
    expect(ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest).word).toBe("UNREADABLE")
  })

  test("records a denied host permission before start and authorizes native fallback without inventing a job", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-start-denied"
    const unitId = "U"
    init(runs, runId, f)
    ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", unitId,
      "--base", f.base, "--packet", packetFile("packet"),
    )

    expect(ctl(
      runs, "claim-fallback", "--run-id", runId, "--unit-id", unitId,
      "--caller-mode", "headless",
    ).word).toBe("REFUSED")

    const denied = ctl(
      runs, "record-dispatch-unavailable", "--run-id", runId, "--unit-id", unitId,
      "--attempt-id", "attempt-1", "--reason", "approval-denied",
    )
    expect(denied).toMatchObject({
      word: "DISPATCH_UNAVAILABLE",
      body: {
        unit_id: unitId,
        attempt_id: "attempt-1",
        reason: "host-approval-denied-before-start",
        resumed: false,
      },
    })
    expect(ctl(
      runs, "record-dispatch-unavailable", "--run-id", runId, "--unit-id", unitId,
      "--attempt-id", "attempt-1", "--reason", "approval-denied",
    ).body.resumed).toBe(true)

    const status = ctl(runs, "status", "--run-id", runId, "--unit-id", unitId).body.unit
    expect(status).toMatchObject({
      state: "queued",
      attempts: [{
        job_id: null,
        process_state: "never-started",
        dispatch_unavailable_receipt: {
          reason: "host-approval-denied-before-start",
        },
        fallback: {
          eligible: true,
          reason: "host-approval-denied-before-start",
          claimed: null,
        },
      }],
    })

    const fakeJob = fakeRunningJob(runs, runId, unitId, "packet", "job-after-denial")
    expect(ctl(
      runs, "record-job", "--run-id", runId, "--unit-id", unitId,
      "--attempt-id", "attempt-1", "--job-id", fakeJob,
    ).word).toBe("REFUSED")
    expect(ctl(runs, "resume", "--run-id", runId).body.actions).toContainEqual({
      unit_id: unitId,
      action: "dispatch-unavailable-retained",
      reason: "host-approval-denied-before-start",
    })

    expect(ctl(
      runs, "claim-fallback", "--run-id", runId, "--unit-id", unitId,
      "--caller-mode", "headless",
    )).toMatchObject({
      word: "FALLBACK_AUTHORIZED",
      body: { start_native: true, reason: "host-approval-denied-before-start" },
    })
  })

  test("record-job preserves a dispatch denial that lands before its write lock", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-record-job-denial-race"
    init(runs, runId, f)
    ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    )
    const job = fakeRunningJob(runs, runId, "U", "packet", "job-denial-race")

    const raced = ctlWithDispatchReceiptRace(runs, "record-job", runId, "U", job)

    expect(raced).toMatchObject({
      word: "REFUSED",
      race_fired: true,
      unit_state: "queued",
      attempt: {
        job_id: null,
        dispatch_unavailable_receipt: { reason: "host-approval-denied-before-start" },
      },
    })
    expect(raced.events).toContain("dispatch-unavailable-before-start")
    expect(raced.events).not.toContain("job-bound")
  })

  test("resume retains a dispatch denial that lands before queued-job adoption", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-resume-denial-race"
    init(runs, runId, f)
    ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    )
    const job = fakeRunningJob(runs, runId, "U", "packet", "job-adoption-race")

    const raced = ctlWithDispatchReceiptRace(runs, "resume", runId, "U", job)

    expect(raced).toMatchObject({
      word: "RESUMED",
      race_fired: true,
      unit_state: "queued",
      attempt: {
        job_id: null,
        dispatch_unavailable_receipt: { reason: "host-approval-denied-before-start" },
      },
      body: {
        actions: [{
          unit_id: "U",
          action: "dispatch-unavailable-retained",
          reason: "host-approval-denied-before-start",
        }],
      },
    })
    expect(raced.events).toContain("dispatch-unavailable-before-start")
    expect(raced.events).not.toContain("job-adopted")
  })

  test("keeps oversized runner activity logs authoritative for failed-job recovery", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-oversized-runner-log"
    const unitId = "U"
    init(runs, runId, f)
    ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", unitId,
      "--base", f.base, "--packet", packetFile("packet"),
    )
    const job = fakeRunningJob(runs, runId, unitId, "packet", "job-oversized-log")
    ctl(
      runs, "record-job", "--run-id", runId, "--unit-id", unitId,
      "--attempt-id", "attempt-1", "--job-id", job,
    )
    terminalizeFakeJob(runs, runId, job, "failed")
    const logPath = path.join(runs, runId, "jobs", job, "out.log")
    truncateSync(logPath, 10 * 1024 * 1024 + 1)

    const synced = ctl(runs, "sync-job", "--run-id", runId, "--unit-id", unitId)
    expect(synced).toMatchObject({
      word: "SYNCED",
      body: { process_state: "failed", activity: { log_bytes: 10 * 1024 * 1024 + 1 } },
    })
    const attempt = ctl(runs, "status", "--run-id", runId, "--unit-id", unitId).body.unit.attempts[0]
    expect(attempt).toMatchObject({
      process_state: "failed",
      activity: { log_bytes: 10 * 1024 * 1024 + 1 },
      fallback: { eligible: true, reason: "failed", claimed: null },
    })
    expect(ctl(
      runs, "claim-fallback", "--run-id", runId, "--unit-id", unitId,
      "--caller-mode", "headless",
    )).toMatchObject({
      word: "FALLBACK_AUTHORIZED",
      body: { start_native: true, reason: "failed" },
    })
  })

  test("keeps an oversized implementation result as a recoverable failed job", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-oversized-result"
    const unitId = "U"
    init(runs, runId, f)
    const prepared = ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", unitId,
      "--base", f.base, "--packet", packetFile("packet"),
    ).body
    const authorized = authorizeDispatch(runs, runId, unitId, prepared)
    const job = authorized.body.job_id
    const reason = "result exceeded byte cap (5242881 > 5242880 bytes)"
    terminalizeFakeJob(runs, runId, job, "failed")
    writeFileSync(path.join(runs, runId, "jobs", job, "reason"), `${reason}\n`, { mode: 0o600 })
    const resultPath = path.join(prepared.result_dir, "implementation-result.json")
    writeFileSync(resultPath, "", { mode: 0o600 })
    truncateSync(resultPath, 5 * 1024 * 1024 + 1)

    expect(ctl(runs, "sync-job", "--run-id", runId, "--unit-id", unitId)).toMatchObject({
      word: "SYNCED",
      body: { process_state: "failed", failure_reason: reason },
    })
    const attempt = ctl(runs, "status", "--run-id", runId, "--unit-id", unitId).body.unit.attempts[0]
    expect(attempt).toMatchObject({
      process_state: "failed",
      fallback: { eligible: true, reason, claimed: null },
    })
    expect(attempt.terminal_receipt).toBeNull()

    expect(ctl(
      runs, "claim-fallback", "--run-id", runId, "--unit-id", unitId,
      "--caller-mode", "headless",
    )).toMatchObject({
      word: "FALLBACK_AUTHORIZED",
      body: { start_native: true, reason },
    })
    expect(ctl(
      runs, "claim-fallback", "--run-id", runId, "--unit-id", unitId,
      "--caller-mode", "headless",
    )).toMatchObject({
      word: "FALLBACK_ALREADY_AUTHORIZED",
      body: { start_native: false, reason },
    })
  })

  test("does not authorize native fallback before dependencies are accepted", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-fallback-dependency", f)
    ctl(
      runs, "prepare", "--run-id", "run-fallback-dependency", "--unit-id", "U1",
      "--base", f.base, "--packet", packetFile("dependency packet"),
    )
    ctl(
      runs, "prepare", "--run-id", "run-fallback-dependency", "--unit-id", "U2",
      "--base", f.base, "--packet", packetFile("dependent packet"), "--dependency", "U1",
    )
    const job = fakeRunningJob(runs, "run-fallback-dependency", "U2", "dependent packet")
    ctl(
      runs, "record-job", "--run-id", "run-fallback-dependency", "--unit-id", "U2",
      "--attempt-id", "attempt-1", "--job-id", job,
    )
    terminalizeFakeJob(runs, "run-fallback-dependency", job, "failed")
    expect(ctl(runs, "resume", "--run-id", "run-fallback-dependency").body.actions).toContainEqual({
      unit_id: "U2",
      action: "monitored",
      process_state: "failed",
    })

    const blocked = ctl(
      runs, "claim-fallback", "--run-id", "run-fallback-dependency", "--unit-id", "U2",
      "--caller-mode", "headless",
    )
    expect(blocked.word).toBe("BLOCKED")
    expect(blocked.stderr).toContain("dependencies must have controller-accepted canonical commits")
    expect(blocked.body).toMatchObject({
      unit_id: "U2",
      missing_dependencies: [],
      unaccepted_dependencies: ["U1"],
    })
    expect(ctl(
      runs, "status", "--run-id", "run-fallback-dependency", "--unit-id", "U2",
    ).body.unit.attempts[0].fallback.claimed).toBeNull()
  })

  test("claims fallback from an accepted independent sibling but not a manual descendant", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-fallback-independent-sibling"
    init(runs, runId, f)

    const accepted = ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U-accepted",
      "--base", f.base, "--packet", packetFile("accepted packet"),
    ).body
    ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U-fallback",
      "--base", f.base, "--packet", packetFile("fallback packet"),
    )
    writeFileSync(path.join(accepted.workspace, "accepted.txt"), "accepted sibling\n")
    const acceptedJob = fakeDoneJob(runs, runId, "U-accepted", "accepted packet", "job-accepted-sibling")
    ctl(
      runs, "record-job", "--run-id", runId, "--unit-id", "U-accepted",
      "--attempt-id", "attempt-1", "--job-id", acceptedJob,
    )
    ctl(runs, "terminalize", "--run-id", runId, "--unit-id", "U-accepted")
    const integrated = ctl(
      runs, "integrate", "--run-id", runId, "--unit-id", "U-accepted",
      "--commit-message", "feat(test): accept independent sibling", "--",
      "python3", "-c", "raise SystemExit(0)",
    )
    expect(integrated.word).toBe("UNIT_COMMITTED")
    const acceptedHead = integrated.body.canonical_commit

    const fallbackJob = fakeRunningJob(runs, runId, "U-fallback", "fallback packet", "job-fallback-sibling")
    ctl(
      runs, "record-job", "--run-id", runId, "--unit-id", "U-fallback",
      "--attempt-id", "attempt-1", "--job-id", fallbackJob,
    )
    terminalizeFakeJob(runs, runId, fallbackJob, "failed")
    ctl(runs, "resume", "--run-id", runId)

    writeFileSync(path.join(f.repo, "manual.txt"), "unrelated manual movement\n")
    git(f.repo, "add", "manual.txt")
    git(f.repo, "commit", "-m", "chore: unrelated manual descendant")
    expect(ctl(
      runs, "claim-fallback", "--run-id", runId, "--unit-id", "U-fallback",
      "--caller-mode", "headless",
    ).word).toBe("BLOCKED")

    git(f.repo, "reset", "--hard", acceptedHead)
    const authorized = ctl(
      runs, "claim-fallback", "--run-id", runId, "--unit-id", "U-fallback",
      "--caller-mode", "headless",
    )
    expect(authorized).toMatchObject({
      word: "FALLBACK_AUTHORIZED",
      body: { claim: { canonical_head: acceptedHead } },
    })
    writeFileSync(path.join(f.repo, "fallback.txt"), "native fallback\n")
    git(f.repo, "add", "fallback.txt")
    git(f.repo, "commit", "-m", "fix(test): complete fallback after sibling")
    const fallbackHead = git(f.repo, "rev-parse", "HEAD")
    expect(ctl(
      runs, "complete-fallback", "--run-id", runId, "--unit-id", "U-fallback",
      "--accepted-head", fallbackHead, "--evidence-digest", "a".repeat(64),
      "--summary", "fallback checks passed",
    ).word).toBe("FALLBACK_COMPLETED")
  })

  test("does not complete native fallback from an old base that omits an accepted dependency", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-fallback-ancestry", f)
    ctl(
      runs, "prepare", "--run-id", "run-fallback-ancestry", "--unit-id", "U1",
      "--base", f.base, "--packet", packetFile("dependency packet"),
    )
    ctl(
      runs, "prepare", "--run-id", "run-fallback-ancestry", "--unit-id", "U2",
      "--base", f.base, "--packet", packetFile("dependent packet"), "--dependency", "U1",
    )

    for (const unitId of ["U1", "U2"]) {
      const job = fakeRunningJob(
        runs, "run-fallback-ancestry", unitId, `${unitId === "U1" ? "dependency" : "dependent"} packet`,
        `job-${unitId}`,
      )
      ctl(
        runs, "record-job", "--run-id", "run-fallback-ancestry", "--unit-id", unitId,
        "--attempt-id", "attempt-1", "--job-id", job,
      )
      terminalizeFakeJob(runs, "run-fallback-ancestry", job, "failed")
    }
    ctl(runs, "resume", "--run-id", "run-fallback-ancestry")

    expect(ctl(
      runs, "claim-fallback", "--run-id", "run-fallback-ancestry", "--unit-id", "U1",
      "--caller-mode", "headless",
    ).word).toBe("FALLBACK_AUTHORIZED")
    writeFileSync(path.join(f.repo, "dependency.txt"), "accepted dependency\n")
    git(f.repo, "add", "dependency.txt")
    git(f.repo, "commit", "-m", "accepted dependency")
    const dependencyHead = git(f.repo, "rev-parse", "HEAD")
    expect(ctl(
      runs, "complete-fallback", "--run-id", "run-fallback-ancestry", "--unit-id", "U1",
      "--accepted-head", dependencyHead, "--evidence-digest", "c".repeat(64),
      "--summary", "dependency checks passed",
    ).word).toBe("FALLBACK_COMPLETED")

    git(f.repo, "reset", "--hard", f.base)
    const authorized = ctl(
      runs, "claim-fallback", "--run-id", "run-fallback-ancestry", "--unit-id", "U2",
      "--caller-mode", "headless",
    )
    expect(authorized.word).toBe("FALLBACK_AUTHORIZED")
    writeFileSync(path.join(f.repo, "dependent.txt"), "old-base native implementation\n")
    git(f.repo, "add", "dependent.txt")
    git(f.repo, "commit", "-m", "old-base native implementation")
    const oldBaseHead = git(f.repo, "rev-parse", "HEAD")

    const blocked = ctl(
      runs, "complete-fallback", "--run-id", "run-fallback-ancestry", "--unit-id", "U2",
      "--accepted-head", oldBaseHead, "--evidence-digest", "d".repeat(64),
      "--summary", "dependent checks passed",
    )
    expect(blocked.word).toBe("BLOCKED")
    expect(blocked.stderr).toContain("does not contain every controller-accepted prerequisite")
    expect(blocked.body.missing_ancestry).toContainEqual({
      kind: "dependency", unit_id: "U1", commit: dependencyHead,
    })
    const afterBlocked = ctl(
      runs, "status", "--run-id", "run-fallback-ancestry", "--unit-id", "U2",
    ).body.unit
    expect(afterBlocked.state).toBe("authoring")
    expect(afterBlocked.attempts[0].fallback.claimed).toEqual(authorized.body.claim)
    expect(afterBlocked.attempts[0].fallback.completed).toBeNull()

    git(f.repo, "reset", "--hard", dependencyHead)
    writeFileSync(path.join(f.repo, "dependent.txt"), "descendant native implementation\n")
    git(f.repo, "add", "dependent.txt")
    git(f.repo, "commit", "-m", "descendant native implementation")
    const descendantHead = git(f.repo, "rev-parse", "HEAD")
    expect(ctl(
      runs, "complete-fallback", "--run-id", "run-fallback-ancestry", "--unit-id", "U2",
      "--accepted-head", descendantHead, "--evidence-digest", "d".repeat(64),
      "--summary", "dependent checks passed",
    ).word).toBe("FALLBACK_COMPLETED")
  })

  test("does not complete native fallback when its head omits a unit accepted after the claim", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-fallback-concurrent-acceptance"
    init(runs, runId, f)

    for (const unitId of ["U-fallback", "U-accepted"]) {
      ctl(
        runs, "prepare", "--run-id", runId, "--unit-id", unitId,
        "--base", f.base, "--packet", packetFile(`packet-${unitId}`),
      )
      const job = fakeRunningJob(runs, runId, unitId, `packet-${unitId}`, `job-${unitId}`)
      ctl(
        runs, "record-job", "--run-id", runId, "--unit-id", unitId,
        "--attempt-id", "attempt-1", "--job-id", job,
      )
      terminalizeFakeJob(runs, runId, job, "failed")
    }
    ctl(runs, "resume", "--run-id", runId)

    expect(ctl(
      runs, "claim-fallback", "--run-id", runId, "--unit-id", "U-fallback",
      "--caller-mode", "headless",
    ).word).toBe("FALLBACK_AUTHORIZED")
    expect(ctl(
      runs, "claim-fallback", "--run-id", runId, "--unit-id", "U-accepted",
      "--caller-mode", "headless",
    ).word).toBe("FALLBACK_AUTHORIZED")

    writeFileSync(path.join(f.repo, "accepted.txt"), "accepted independent unit\n")
    git(f.repo, "add", "accepted.txt")
    git(f.repo, "commit", "-m", "accept independent unit")
    const acceptedHead = git(f.repo, "rev-parse", "HEAD")
    expect(ctl(
      runs, "complete-fallback", "--run-id", runId, "--unit-id", "U-accepted",
      "--accepted-head", acceptedHead, "--evidence-digest", "e".repeat(64),
      "--summary", "independent checks passed",
    ).word).toBe("FALLBACK_COMPLETED")

    git(f.repo, "reset", "--hard", f.base)
    writeFileSync(path.join(f.repo, "fallback.txt"), "stale fallback implementation\n")
    git(f.repo, "add", "fallback.txt")
    git(f.repo, "commit", "-m", "implement stale fallback")
    const staleHead = git(f.repo, "rev-parse", "HEAD")
    const blocked = ctl(
      runs, "complete-fallback", "--run-id", runId, "--unit-id", "U-fallback",
      "--accepted-head", staleHead, "--evidence-digest", "f".repeat(64),
      "--summary", "fallback checks passed",
    )
    expect(blocked.word).toBe("BLOCKED")
    expect(blocked.stderr).toContain("does not contain every controller-accepted prerequisite")
    expect(blocked.body.missing_ancestry).toEqual([{
      kind: "accepted-unit", unit_id: "U-accepted", commit: acceptedHead,
    }])
    expect(ctl(
      runs, "status", "--run-id", runId, "--unit-id", "U-fallback",
    ).body.unit).toMatchObject({
      state: "authoring",
      attempts: [{ fallback: { completed: null } }],
    })

    git(f.repo, "reset", "--hard", acceptedHead)
    git(f.repo, "cherry-pick", staleHead)
    const updatedHead = git(f.repo, "rev-parse", "HEAD")
    expect(ctl(
      runs, "complete-fallback", "--run-id", runId, "--unit-id", "U-fallback",
      "--accepted-head", updatedHead, "--evidence-digest", "f".repeat(64),
      "--summary", "fallback checks passed",
    ).word).toBe("FALLBACK_COMPLETED")
  })

  test("accepts a native-completed dependency before a later fallback claim", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-native-dependency", f)
    for (const unit of [
      { id: "U1", packet: "native dependency packet", job: "job-native-dependency", dependencies: [] },
      { id: "U2", packet: "dependent packet", job: "job-native-dependent", dependencies: ["U1"] },
    ]) {
      ctl(
        runs, "prepare", "--run-id", "run-native-dependency", "--unit-id", unit.id,
        "--base", f.base, "--packet", packetFile(unit.packet),
        ...unit.dependencies.flatMap((dependency) => ["--dependency", dependency]),
      )
      const job = fakeRunningJob(runs, "run-native-dependency", unit.id, unit.packet, unit.job)
      ctl(
        runs, "record-job", "--run-id", "run-native-dependency", "--unit-id", unit.id,
        "--attempt-id", "attempt-1", "--job-id", job,
      )
      terminalizeFakeJob(runs, "run-native-dependency", job, "failed")
    }
    ctl(runs, "resume", "--run-id", "run-native-dependency")
    expect(ctl(
      runs, "claim-fallback", "--run-id", "run-native-dependency", "--unit-id", "U1",
      "--caller-mode", "headless",
    ).word).toBe("FALLBACK_AUTHORIZED")
    writeFileSync(path.join(f.repo, "native-dependency.txt"), "accepted native dependency\n")
    git(f.repo, "add", "native-dependency.txt")
    git(f.repo, "commit", "-m", "native dependency")
    const nativeHead = git(f.repo, "rev-parse", "HEAD")
    expect(ctl(
      runs, "complete-fallback", "--run-id", "run-native-dependency", "--unit-id", "U1",
      "--accepted-head", nativeHead, "--evidence-digest", "b".repeat(64),
      "--summary", "native dependency checks passed",
    ).word).toBe("FALLBACK_COMPLETED")

    expect(ctl(
      runs, "claim-fallback", "--run-id", "run-native-dependency", "--unit-id", "U2",
      "--caller-mode", "headless",
    ).word).toBe("FALLBACK_AUTHORIZED")
  })

  test("cleanup preserves native fallback acceptance while pruning external artifacts", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-native-cleanup-acceptance"
    const units = [
      { id: "U1", packet: "native cleanup dependency", job: "job-native-cleanup-dependency", dependencies: [] },
      { id: "U2", packet: "native cleanup dependent", job: "job-native-cleanup-dependent", dependencies: ["U1"] },
    ]
    init(runs, runId, f)
    for (const unit of units) {
      ctl(
        runs, "prepare", "--run-id", runId, "--unit-id", unit.id,
        "--base", f.base, "--packet", packetFile(unit.packet),
        ...unit.dependencies.flatMap((dependency) => ["--dependency", dependency]),
      )
      const job = fakeRunningJob(runs, runId, unit.id, unit.packet, unit.job)
      ctl(
        runs, "record-job", "--run-id", runId, "--unit-id", unit.id,
        "--attempt-id", "attempt-1", "--job-id", job,
      )
      terminalizeFakeJob(runs, runId, job, "failed")
    }
    ctl(runs, "resume", "--run-id", runId)

    expect(ctl(
      runs, "claim-fallback", "--run-id", runId, "--unit-id", "U1", "--caller-mode", "headless",
    ).word).toBe("FALLBACK_AUTHORIZED")
    writeFileSync(path.join(f.repo, "native-cleanup-dependency.txt"), "accepted native dependency\n")
    git(f.repo, "add", "native-cleanup-dependency.txt")
    git(f.repo, "commit", "-m", "native cleanup dependency")
    const dependencyHead = git(f.repo, "rev-parse", "HEAD")
    expect(ctl(
      runs, "complete-fallback", "--run-id", runId, "--unit-id", "U1",
      "--accepted-head", dependencyHead, "--evidence-digest", "c".repeat(64),
      "--summary", "native dependency checks passed",
    ).word).toBe("FALLBACK_COMPLETED")

    const beforeCleanup = ctl(runs, "status", "--run-id", runId, "--unit-id", "U1").body.unit
    expect(existsSync(beforeCleanup.packet.path)).toBe(true)
    expect(existsSync(path.join(runs, runId, "jobs", units[0].job))).toBe(true)
    expect(ctl(
      runs, "cleanup", "--run-id", runId, "--unit-id", "U1",
      "--abandon", "--expect-job", units[0].job,
    ).word).toBe("CLEANED")
    const cleaned = ctl(runs, "status", "--run-id", runId, "--unit-id", "U1").body.unit
    expect(cleaned).toMatchObject({
      state: "native-completed",
      cleanup: { abandoned: true, artifact_cleanup: { complete: true } },
    })
    expect(existsSync(cleaned.packet.path)).toBe(false)
    expect(existsSync(path.join(runs, runId, "jobs", units[0].job))).toBe(false)
    expect(ctl(
      runs, "cleanup", "--run-id", runId, "--unit-id", "U1",
      "--abandon", "--expect-job", units[0].job,
    ).body.resumed).toBe(true)

    expect(ctl(
      runs, "claim-fallback", "--run-id", runId, "--unit-id", "U2", "--caller-mode", "headless",
    ).word).toBe("FALLBACK_AUTHORIZED")
    writeFileSync(path.join(f.repo, "native-cleanup-dependent.txt"), "accepted native dependent\n")
    git(f.repo, "add", "native-cleanup-dependent.txt")
    git(f.repo, "commit", "-m", "native cleanup dependent")
    const dependentHead = git(f.repo, "rev-parse", "HEAD")
    expect(ctl(
      runs, "complete-fallback", "--run-id", runId, "--unit-id", "U2",
      "--accepted-head", dependentHead, "--evidence-digest", "d".repeat(64),
      "--summary", "native dependent checks passed",
    ).word).toBe("FALLBACK_COMPLETED")
    expect(ctl(
      runs, "verify-run", "--run-id", runId,
      "--verification-summary", "native cleanup plan gate passed",
      "--", "python3", "-c", "raise SystemExit(0)",
    ).word).toBe("RUN_VERIFIED")
  })

  test("preserves a launched-route failure reason for fallback disclosure", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-launched-failure", f)
    const prepared = ctl(
      runs, "prepare", "--run-id", "run-launched-failure", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("launched failure packet"),
    ).body
    const job = fakeDoneJob(
      runs, "run-launched-failure", "U", "launched failure packet", "job-launched-failure",
    )
    const jobDir = path.join(runs, "run-launched-failure", "jobs", job)
    writeFileSync(path.join(jobDir, "status"), "failed\n", { mode: 0o600 })
    writeFileSync(path.join(jobDir, "reason"), "worker exited 1\n", { mode: 0o600 })
    const resultPath = path.join(
      runs, "run-launched-failure", "units", "U", "result", "implementation-result.json",
    )
    const result = JSON.parse(readFileSync(resultPath, "utf8"))
    result.terminal_status = "failed"
    result.summary = "Adapter terminal output failed result schema"
    result.changed_files = []
    result.evidence = []
    result.scope_expansion = null
    result.failure_reason = "terminal output failed implementation result schema"
    result.activity_posture = JSON.parse(readFileSync(prepared.authorization_path, "utf8")).activity_posture
    writeFileSync(resultPath, `${JSON.stringify(result)}\n`, { mode: 0o600 })
    expect(authorizeDispatch(
      runs, "run-launched-failure", "U", prepared, { jobId: job },
    ).word).toBe("AUTHORIZED")
    ctl(
      runs, "record-job", "--run-id", "run-launched-failure", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )

    expect(ctl(
      runs, "sync-job", "--run-id", "run-launched-failure", "--unit-id", "U",
    )).toMatchObject({
      word: "SYNCED",
      body: {
        process_state: "failed",
        failure_reason: "terminal output failed implementation result schema",
      },
    })
    const attempt = ctl(
      runs, "status", "--run-id", "run-launched-failure", "--unit-id", "U",
    ).body.unit.attempts[0]
    expect(attempt.terminal_receipt).toMatchObject({
      terminal_status: "failed",
      failure_reason: "terminal output failed implementation result schema",
    })
    expect(attempt.fallback).toMatchObject({
      eligible: true,
      reason: "terminal output failed implementation result schema",
      claimed: null,
    })
    const fallback = ctl(
      runs, "claim-fallback", "--run-id", "run-launched-failure", "--unit-id", "U",
      "--caller-mode", "headless",
    )
    expect(fallback.word).toBe("FALLBACK_AUTHORIZED")
    expect(fallback.body.reason).toBe("terminal output failed implementation result schema")
  })

  test("adopts a metadata-only never-started job and authorizes fallback exactly once", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-never-started", f)
    ctl(runs, "prepare", "--run-id", "run-never-started", "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"))
    const job = fakeRunningJob(runs, "run-never-started", "U", "packet", "job-metadata-only")
    const jobDir = path.join(runs, "run-never-started", "jobs", job)
    rmSync(path.join(jobDir, "pid"))
    rmSync(path.join(jobDir, "out.log"))

    const resumed = ctl(runs, "resume", "--run-id", "run-never-started")
    expect(resumed.body.actions).toContainEqual({ unit_id: "U", action: "job-adopted", job_id: job })
    expect(resumed.body.actions).toContainEqual({ unit_id: "U", action: "monitored", process_state: "never-started" })
    expect(ctl(runs, "status", "--run-id", "run-never-started", "--unit-id", "U").body.unit.attempts[0].fallback).toMatchObject({
      eligible: true,
      reason: "never-started",
      claimed: null,
    })
    expect(ctl(runs, "claim-fallback", "--run-id", "run-never-started", "--unit-id", "U", "--caller-mode", "headless").word).toBe("FALLBACK_AUTHORIZED")
    expect(ctl(runs, "claim-fallback", "--run-id", "run-never-started", "--unit-id", "U", "--caller-mode", "headless").word).toBe("FALLBACK_ALREADY_AUTHORIZED")
  })

  test("repeated job sync without new evidence does not rewrite durable state", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-sync", f)
    ctl(runs, "prepare", "--run-id", "run-sync", "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"))
    const job = fakeRunningJob(runs, "run-sync", "U", "packet")
    ctl(runs, "record-job", "--run-id", "run-sync", "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job)

    expect(ctl(runs, "sync-job", "--run-id", "run-sync", "--unit-id", "U").word).toBe("SYNCED")
    const manifestPath = path.join(runs, "run-sync", "manifest.json")
    const first = JSON.parse(readFileSync(manifestPath, "utf8"))
    expect(ctl(runs, "sync-job", "--run-id", "run-sync", "--unit-id", "U").word).toBe("SYNCED")
    const second = JSON.parse(readFileSync(manifestPath, "utf8"))

    expect(second.revision).toBe(first.revision)
    expect(second.events).toEqual(first.events)
  })

  test("explicit reap records authoritative termination before fallback", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-reap", f)
    ctl(runs, "prepare", "--run-id", "run-reap", "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"))
    const job = fakeRunningJob(runs, "run-reap", "U", "packet")
    ctl(runs, "record-job", "--run-id", "run-reap", "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job)

    const reaped = ctl(runs, "reap", "--run-id", "run-reap", "--unit-id", "U")
    expect(reaped.word).toBe("REAPED")
    expect(reaped.body.process_state).toBe("died-without-result")
    const status = ctl(runs, "status", "--run-id", "run-reap", "--unit-id", "U")
    expect(status.body.unit.attempts[0].fallback).toMatchObject({ eligible: true, reason: "died-without-result", claimed: null })
    expect(ctl(runs, "claim-fallback", "--run-id", "run-reap", "--unit-id", "U", "--caller-mode", "headless").word).toBe("FALLBACK_AUTHORIZED")
    expect(ctl(runs, "cleanup", "--run-id", "run-reap", "--unit-id", "U", "--abandon", "--expect-job", "wrong-job").word).toBe("REFUSED")
    expect(ctl(runs, "cleanup", "--run-id", "run-reap", "--unit-id", "U", "--abandon", "--expect-job", job).word).toBe("CLEANED")
    expect(ctl(runs, "claim-fallback", "--run-id", "run-reap", "--unit-id", "U", "--caller-mode", "headless").word).toBe("FALLBACK_ALREADY_AUTHORIZED")
  })

})
