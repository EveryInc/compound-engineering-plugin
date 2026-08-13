import { describe, expect, setDefaultTimeout, test } from "bun:test"
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

describe("ce-work unit workspace controller: run discovery, fallback, and retries", () => {
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

  test("retries an abandoned unit under the same run while preserving attempt history", () => {
    const f = makeRepo()
    const linked = path.join(tmp("ce-work-retry-linked-"), "canonical")
    git(f.repo, "worktree", "add", "-b", "retry-feature", linked, f.base)
    f.repo = linked
    f.plan = path.join(linked, "docs", "plans", "plan.md")
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    expect(initWithBinding(runs, "run-retry", f, "require").word).toBe("READY")

    const first = ctl(
      runs, "prepare", "--run-id", "run-retry", "--unit-id", "U", "--base", f.base,
      "--packet", packetFile("first packet"), "--attempt-id", "attempt-1",
    )
    expect(first.word).toBe("PREPARED")
    expect(first.body.attempt_id).toBe("attempt-1")
    writeFileSync(path.join(first.body.workspace, "delegated.txt"), "first\n")
    const firstJob = fakeDoneJob(runs, "run-retry", "U", "first packet", "job-first")
    expect(ctl(
      runs, "record-job", "--run-id", "run-retry", "--unit-id", "U",
      "--attempt-id", first.body.attempt_id, "--job-id", firstJob,
    ).word).toBe("AUTHORING")
    const firstTransport = ctl(runs, "terminalize", "--run-id", "run-retry", "--unit-id", "U").body.transport
    const acquired = ctl(runs, "integration-acquire", "--run-id", "run-retry", "--unit-id", "U")
    const token = acquired.body.lock_token
    expect(ctl(runs, "preflight", "--run-id", "run-retry", "--unit-id", "U", "--lock-token", token).word).toBe("PREFLIGHT_OK")
    git(f.repo, "cherry-pick", "--no-commit", firstTransport.commit)
    expect(ctl(runs, "mark-applied", "--run-id", "run-retry", "--unit-id", "U", "--lock-token", token).word).toBe("APPLIED")
    expect(ctl(runs, "restore", "--run-id", "run-retry", "--unit-id", "U", "--lock-token", token).word).toBe("PRESERVED")
    expect(ctl(
      runs, "cleanup", "--run-id", "run-retry", "--unit-id", "U", "--abandon",
      "--expect-transport", firstTransport.commit,
    ).word).toBe("CLEANED")
    expect(ctl(runs, "integration-release", "--run-id", "run-retry", "--unit-id", "U", "--lock-token", token).word).toBe("RELEASED")

    const colliding = ctl(
      runs, "prepare", "--run-id", "run-retry", "--unit-id", "U", "--base", f.base,
      "--packet", packetFile("corrected packet"),
    )
    expect(colliding.word).toBe("REFUSED")
    expect(colliding.stderr).toContain("supply a fresh --attempt-id")

    const second = ctl(
      runs, "prepare", "--run-id", "run-retry", "--unit-id", "U", "--base", f.base,
      "--packet", packetFile("corrected packet"), "--attempt-id", "attempt-2",
    )
    expect(second.word).toBe("PREPARED")
    expect(second.body).toMatchObject({ unit_id: "U", attempt_id: "attempt-2", resumed: false, base: f.base })
    expect(JSON.parse(readFileSync(second.body.authorization_path, "utf8"))).toMatchObject({
      run_id: "run-retry",
      unit_id: "U",
      attempt_id: "attempt-2",
      packet_digest: packetDigest("corrected packet"),
    })
    expect(git(second.body.workspace, "rev-parse", "--path-format=absolute", "--git-common-dir")).toBe(
      git(f.repo, "rev-parse", "--path-format=absolute", "--git-common-dir"),
    )
    expect(sh(second.body.workspace, ["git", "symbolic-ref", "-q", "HEAD"], false).status).not.toBe(0)
    expect(realpathSync(second.body.workspace).startsWith(`${realpathSync(linked)}${path.sep}`)).toBe(false)

    const status = ctl(runs, "status", "--run-id", "run-retry", "--unit-id", "U")
    expect(status.body.run_id).toBe("run-retry")
    expect(status.body.unit.state).toBe("queued")
    expect(status.body.unit.cleanup).toBeNull()
    expect(status.body.unit.attempts.map((attempt: any) => attempt.attempt_id)).toEqual(["attempt-1", "attempt-2"])
    expect(status.body.unit.attempts[0]).toMatchObject({
      job_id: firstJob,
      process_state: "done",
      authorization_retained: false,
      terminal_receipt: { terminal_status: "completed" },
      restore_receipt: {
        exact: true,
        snapshot: {
          head: f.base,
          status_empty: true,
        },
      },
      cleanup_receipt: {
        abandoned: true,
        abandonment_receipt: { kind: "transport", value: firstTransport.commit },
      },
    })
    expect(status.body.unit.attempts[1]).toMatchObject({
      attempt_id: "attempt-2",
      job_id: null,
      process_state: "never-started",
      authorization_retained: true,
    })
  })

  test("retries an abandoned wave unit from the latest controller-accepted head only", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-retry-after-wave-advance"
    init(runs, runId, f)

    const transports: Record<string, any> = {}
    for (const [position, unitId] of ["U-first", "U-retry", "U-manual"].entries()) {
      const packet = `packet-${unitId}`
      const prepared = ctl(
        runs, "prepare", "--run-id", runId, "--unit-id", unitId,
        "--base", f.base, "--packet", packetFile(packet),
        "--wave-id", "wave-1", "--wave-position", String(position),
      )
      expect(prepared.word).toBe("PREPARED")
      writeFileSync(path.join(prepared.body.workspace, `${unitId}.txt`), `${unitId}\n`)
      const job = fakeDoneJob(runs, runId, unitId, packet, `job-${unitId}`)
      expect(ctl(
        runs, "record-job", "--run-id", runId, "--unit-id", unitId,
        "--attempt-id", "attempt-1", "--job-id", job,
      ).word).toBe("AUTHORING")
      transports[unitId] = ctl(
        runs, "terminalize", "--run-id", runId, "--unit-id", unitId,
      ).body.transport
    }

    for (const unitId of ["U-retry", "U-manual"]) {
      expect(ctl(
        runs, "cleanup", "--run-id", runId, "--unit-id", unitId,
        "--abandon", "--expect-transport", transports[unitId].commit,
      ).word).toBe("CLEANED")
    }

    const first = ctl(
      runs, "integrate", "--run-id", runId, "--unit-id", "U-first",
      "--commit-message", "feat(test): accept first wave unit",
      "--", "python3", "-c", "raise SystemExit(0)",
    )
    expect(first.word).toBe("UNIT_COMMITTED")
    const firstHead = first.body.canonical_commit

    const changedDependencies = ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U-retry",
      "--base", firstHead, "--packet", packetFile("corrected retry packet"),
      "--attempt-id", "attempt-2", "--dependency", "U-first",
      "--wave-id", "wave-1", "--wave-position", "1",
    )
    expect(changedDependencies.word).toBe("BLOCKED")
    expect(changedDependencies.stderr).toContain("retry dependencies differ from the recorded unit")
    const changedPosition = ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U-retry",
      "--base", firstHead, "--packet", packetFile("corrected retry packet"),
      "--attempt-id", "attempt-2", "--wave-id", "wave-1", "--wave-position", "2",
    )
    expect(changedPosition.word).toBe("BLOCKED")
    expect(changedPosition.stderr).toContain("retry wave identity/position differs from the recorded unit")

    const retried = ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U-retry",
      "--base", firstHead, "--packet", packetFile("corrected retry packet"),
      "--attempt-id", "attempt-2", "--wave-id", "wave-1", "--wave-position", "1",
    )
    expect(retried.stderr).toBe("")
    expect(retried.word).toBe("PREPARED")
    expect(retried.body.base).toBe(firstHead)
    expect(ctl(runs, "status", "--run-id", runId).body.units["U-retry"]).toMatchObject({
      state: "queued",
      wave: { id: "wave-1", base: f.base, position: 1, allowed_heads: [f.base, firstHead] },
      workspace: { base: firstHead, registered: true },
    })

    writeFileSync(path.join(retried.body.workspace, "U-retry-corrected.txt"), "corrected\n")
    const retryJob = fakeDoneJob(runs, runId, "U-retry", "corrected retry packet", "job-U-retry-2")
    expect(ctl(
      runs, "record-job", "--run-id", runId, "--unit-id", "U-retry",
      "--attempt-id", "attempt-2", "--job-id", retryJob,
    ).word).toBe("AUTHORING")
    expect(ctl(runs, "terminalize", "--run-id", runId, "--unit-id", "U-retry").word).toBe("INTEGRATION_PENDING")
    const completedRetry = ctl(
      runs, "integrate", "--run-id", runId, "--unit-id", "U-retry",
      "--commit-message", "fix(test): accept corrected retry",
      "--", "python3", "-c", "raise SystemExit(0)",
    )
    expect(completedRetry.word).toBe("UNIT_COMMITTED")
    const retryHead = completedRetry.body.canonical_commit
    expect(git(f.repo, "merge-base", "--is-ancestor", firstHead, retryHead)).toBe("")

    writeFileSync(path.join(f.repo, "manual.txt"), "manual\n")
    git(f.repo, "add", "manual.txt")
    git(f.repo, "commit", "-m", "manual head advance")
    const manualHead = git(f.repo, "rev-parse", "HEAD")
    const blocked = ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U-manual",
      "--base", manualHead, "--packet", packetFile("manual retry packet"),
      "--attempt-id", "attempt-2", "--wave-id", "wave-1", "--wave-position", "2",
    )
    expect(blocked).toMatchObject({
      word: "BLOCKED",
      body: { requested_base: manualHead, latest_allowed_head: retryHead },
    })
    expect(ctl(runs, "status", "--run-id", runId).body.units["U-manual"]).toMatchObject({
      state: "cleaned",
      wave: { id: "wave-1", base: f.base, position: 2, allowed_heads: [f.base, firstHead, retryHead] },
      workspace: { base: f.base, registered: true },
    })
  })

  test("retries an abandoned lower-position wave unit after a later sibling is accepted", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-lower-position-retry-after-wave-advance"
    init(runs, runId, f)

    const transports: Record<string, any> = {}
    for (const [position, unitId] of ["U-retry", "U-later"].entries()) {
      const packet = `packet-${unitId}`
      const prepared = ctl(
        runs, "prepare", "--run-id", runId, "--unit-id", unitId,
        "--base", f.base, "--packet", packetFile(packet),
        "--wave-id", "wave-1", "--wave-position", String(position),
      )
      expect(prepared.word).toBe("PREPARED")
      writeFileSync(path.join(prepared.body.workspace, `${unitId}.txt`), `${unitId}\n`)
      const job = fakeDoneJob(runs, runId, unitId, packet, `job-lower-retry-${unitId}`)
      ctl(
        runs, "record-job", "--run-id", runId, "--unit-id", unitId,
        "--attempt-id", "attempt-1", "--job-id", job,
      )
      transports[unitId] = ctl(
        runs, "terminalize", "--run-id", runId, "--unit-id", unitId,
      ).body.transport
    }
    expect(ctl(
      runs, "cleanup", "--run-id", runId, "--unit-id", "U-retry",
      "--abandon", "--expect-transport", transports["U-retry"].commit,
    ).word).toBe("CLEANED")

    const later = ctl(
      runs, "integrate", "--run-id", runId, "--unit-id", "U-later",
      "--commit-message", "feat(test): accept later wave sibling",
      "--", "python3", "-c", "raise SystemExit(0)",
    )
    expect(later.word).toBe("UNIT_COMMITTED")
    const laterHead = later.body.canonical_commit
    expect(ctl(runs, "status", "--run-id", runId).body.units["U-retry"].wave.allowed_heads).toEqual([f.base])

    const retried = ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U-retry",
      "--base", laterHead, "--packet", packetFile("corrected lower-position packet"),
      "--attempt-id", "attempt-2", "--wave-id", "wave-1", "--wave-position", "0",
    )
    expect(retried.word).toBe("PREPARED")
    expect(ctl(runs, "status", "--run-id", runId).body.units).toMatchObject({
      "U-retry": {
        wave: { id: "wave-1", base: f.base, position: 0, allowed_heads: [f.base, laterHead] },
        workspace: { base: laterHead, registered: true },
      },
      "U-later": {
        state: "cleaned",
        wave: { id: "wave-1", base: f.base, position: 1, allowed_heads: [f.base, laterHead] },
      },
    })

    writeFileSync(path.join(retried.body.workspace, "U-retry-corrected.txt"), "corrected\n")
    const retryJob = fakeDoneJob(
      runs, runId, "U-retry", "corrected lower-position packet", "job-lower-retry-U-retry-2",
    )
    ctl(
      runs, "record-job", "--run-id", runId, "--unit-id", "U-retry",
      "--attempt-id", "attempt-2", "--job-id", retryJob,
    )
    expect(ctl(
      runs, "terminalize", "--run-id", runId, "--unit-id", "U-retry",
    ).word).toBe("INTEGRATION_PENDING")
    const completed = ctl(
      runs, "integrate", "--run-id", runId, "--unit-id", "U-retry",
      "--commit-message", "fix(test): accept lower-position retry",
      "--", "python3", "-c", "raise SystemExit(0)",
    )
    expect(completed.word).toBe("UNIT_COMMITTED")
    expect(git(f.repo, "merge-base", "--is-ancestor", laterHead, completed.body.canonical_commit)).toBe("")
    expect(readFileSync(path.join(f.repo, "U-later.txt"), "utf8")).toBe("U-later\n")
    expect(readFileSync(path.join(f.repo, "U-retry-corrected.txt"), "utf8")).toBe("corrected\n")
  })

  test("retries an abandoned independent unit from a controller-accepted sibling head", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-independent-retry-after-advance"
    init(runs, runId, f)

    const transports: Record<string, any> = {}
    for (const unitId of ["U-first", "U-retry"]) {
      const packet = `packet-${unitId}`
      const prepared = ctl(
        runs, "prepare", "--run-id", runId, "--unit-id", unitId,
        "--base", f.base, "--packet", packetFile(packet),
      )
      writeFileSync(path.join(prepared.body.workspace, `${unitId}.txt`), `${unitId}\n`)
      const job = fakeDoneJob(runs, runId, unitId, packet, `job-independent-${unitId}`)
      ctl(
        runs, "record-job", "--run-id", runId, "--unit-id", unitId,
        "--attempt-id", "attempt-1", "--job-id", job,
      )
      transports[unitId] = ctl(
        runs, "terminalize", "--run-id", runId, "--unit-id", unitId,
      ).body.transport
    }
    expect(ctl(
      runs, "cleanup", "--run-id", runId, "--unit-id", "U-retry",
      "--abandon", "--expect-transport", transports["U-retry"].commit,
    ).word).toBe("CLEANED")

    const first = ctl(
      runs, "integrate", "--run-id", runId, "--unit-id", "U-first",
      "--commit-message", "feat(test): accept independent sibling",
      "--", "python3", "-c", "raise SystemExit(0)",
    )
    expect(first.word).toBe("UNIT_COMMITTED")
    const firstHead = first.body.canonical_commit
    const retried = ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U-retry",
      "--base", firstHead, "--packet", packetFile("corrected independent packet"),
      "--attempt-id", "attempt-2",
    )
    expect(retried.word).toBe("PREPARED")
    expect(ctl(runs, "status", "--run-id", runId).body.units["U-retry"]).toMatchObject({
      wave: { id: null, base: f.base, position: 0, allowed_heads: [f.base, firstHead] },
      workspace: { base: firstHead, registered: true },
    })

    writeFileSync(path.join(retried.body.workspace, "U-retry-corrected.txt"), "corrected\n")
    const retryJob = fakeDoneJob(
      runs, runId, "U-retry", "corrected independent packet", "job-independent-U-retry-2",
    )
    ctl(
      runs, "record-job", "--run-id", runId, "--unit-id", "U-retry",
      "--attempt-id", "attempt-2", "--job-id", retryJob,
    )
    expect(ctl(
      runs, "terminalize", "--run-id", runId, "--unit-id", "U-retry",
    ).word).toBe("INTEGRATION_PENDING")
    expect(ctl(
      runs, "integrate", "--run-id", runId, "--unit-id", "U-retry",
      "--commit-message", "fix(test): accept independent retry",
      "--", "python3", "-c", "raise SystemExit(0)",
    ).word).toBe("UNIT_COMMITTED")
    expect(readFileSync(path.join(f.repo, "U-first.txt"), "utf8")).toBe("U-first\n")
    expect(readFileSync(path.join(f.repo, "U-retry-corrected.txt"), "utf8")).toBe("corrected\n")
  })

  test("require blocks headless fallback and needs an explicit interactive choice", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    initWithBinding(runs, "run-require", f, "require")
    ctl(runs, "prepare", "--run-id", "run-require", "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"))
    const job = fakeRunningJob(runs, "run-require", "U", "packet")
    ctl(runs, "record-job", "--run-id", "run-require", "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job)
    terminalizeFakeJob(runs, "run-require", job, "timeout")
    ctl(runs, "resume", "--run-id", "run-require")

    expect(ctl(runs, "claim-fallback", "--run-id", "run-require", "--unit-id", "U", "--caller-mode", "headless").word).toBe("BLOCKED")
    expect(ctl(runs, "claim-fallback", "--run-id", "run-require", "--unit-id", "U", "--caller-mode", "interactive").word).toBe("CHOICE_REQUIRED")
    const confirmed = ctl(runs, "claim-fallback", "--run-id", "run-require", "--unit-id", "U", "--caller-mode", "interactive", "--confirm-native")
    expect(confirmed.word).toBe("FALLBACK_AUTHORIZED")
    expect(confirmed.body.start_native).toBe(true)
    expect(confirmed.body.claim).toMatchObject({
      mode: "require",
      caller_mode: "interactive",
      confirmed_native: true,
    })
    writeFileSync(path.join(f.repo, "required-native.txt"), "accepted native implementation\n")
    git(f.repo, "add", "required-native.txt")
    git(f.repo, "commit", "-m", "required native implementation")
    const nativeHead = git(f.repo, "rev-parse", "HEAD")
    expect(ctl(
      runs, "complete-fallback", "--run-id", "run-require", "--unit-id", "U",
      "--accepted-head", nativeHead, "--evidence-digest", "b".repeat(64), "--summary", "native checks passed",
    ).word).toBe("FALLBACK_COMPLETED")
    expect(ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest).body.run_id).toBe("run-require")
    expect(ctl(
      runs, "verify-run", "--run-id", "run-require",
      "--verification-summary", "required fallback plan gate passed",
      "--", "python3", "-c", "raise SystemExit(0)",
    ).word).toBe("RUN_VERIFIED")
    expect(ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest).word).toBe("NOT_FOUND")
  })

  test("refuses ambiguous job adoption and preserves output on canonical divergence", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-ambiguous", f)
    ctl(runs, "prepare", "--run-id", "run-ambiguous", "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"))
    fakeDoneJob(runs, "run-ambiguous", "U", "packet", "job-a")
    fakeDoneJob(runs, "run-ambiguous", "U", "packet", "job-b")
    expect(ctl(runs, "resume", "--run-id", "run-ambiguous").word).toBe("AMBIGUOUS")
    expect(ctl(runs, "status", "--run-id", "run-ambiguous", "--unit-id", "U").body.unit.state).toBe("queued")
    git(f.repo, "worktree", "remove", "--force", path.join(runs, "run-ambiguous", "units", "U", "workspace"))

    init(runs, "run-diverge", f)
    ctl(runs, "prepare", "--run-id", "run-diverge", "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"))
    const workspace = path.join(runs, "run-diverge", "units", "U", "workspace")
    writeFileSync(path.join(workspace, "delegated.txt"), "delegate\n")
    const job = fakeDoneJob(runs, "run-diverge", "U", "packet")
    ctl(runs, "record-job", "--run-id", "run-diverge", "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job)
    const transport = ctl(runs, "terminalize", "--run-id", "run-diverge", "--unit-id", "U").body.transport
    writeFileSync(path.join(f.repo, "host.txt"), "host moved\n")
    git(f.repo, "add", "host.txt")
    git(f.repo, "commit", "-m", "host movement")
    const token = ctl(runs, "integration-acquire", "--run-id", "run-diverge", "--unit-id", "U").body.lock_token
    expect(ctl(runs, "preflight", "--run-id", "run-diverge", "--unit-id", "U", "--lock-token", token).word).toBe("BLOCKED")
    expect(existsSync(workspace)).toBe(true)
    expect(git(f.repo, "rev-parse", transport.ref)).toBe(transport.commit)
    // The preserved result can still be explicitly abandoned after inspection.
    expect(ctl(runs, "cleanup", "--run-id", "run-diverge", "--unit-id", "U", "--abandon", "--expect-transport", transport.commit).word).toBe("CLEANED")
    expect(ctl(runs, "integration-release", "--run-id", "run-diverge", "--unit-id", "U", "--lock-token", token).word).toBe("RELEASED")
  })

  test("reconciles commit-before-manifest exactly once and serializes competing hosts", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const makeTransport = (runId: string, name: string) => {
      init(runs, runId, f)
      ctl(runs, "prepare", "--run-id", runId, "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"))
      const workspace = path.join(runs, runId, "units", "U", "workspace")
      writeFileSync(path.join(workspace, name), `${runId}\n`)
      const job = fakeDoneJob(runs, runId, "U", "packet")
      ctl(runs, "record-job", "--run-id", runId, "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job)
      return ctl(runs, "terminalize", "--run-id", runId, "--unit-id", "U").body.transport
    }
    const first = makeTransport("run-a", "a.txt")
    const second = makeTransport("run-b", "b.txt")
    const acquired = ctl(runs, "integration-acquire", "--run-id", "run-a", "--unit-id", "U")
    const token = acquired.body.lock_token
    const denied = ctl(runs, "integration-acquire", "--run-id", "run-b", "--unit-id", "U")
    expect(denied.word).toBe("BLOCKED")
    expect(ctl(runs, "integration-release", "--run-id", "run-a", "--unit-id", "U", "--lock-token", "wrong").word).toBe("REFUSED")

    ctl(runs, "preflight", "--run-id", "run-a", "--unit-id", "U", "--lock-token", token)
    git(f.repo, "cherry-pick", "--no-commit", first.commit)
    ctl(runs, "mark-applied", "--run-id", "run-a", "--unit-id", "U", "--lock-token", token)
    ctl(runs, "mark-verified", "--run-id", "run-a", "--unit-id", "U", "--lock-token", token, "--evidence-digest", "tests-green")
    git(f.repo, "commit", "-m", "feat(test): integrate U")
    const resumed = ctl(runs, "resume", "--run-id", "run-a")
    expect(resumed.body.actions.map((a: any) => a.action)).toContain("commit-reconciled")
    expect(resumed.body.actions.map((a: any) => a.action)).toContain("committed-unit-finalized")
    expect(ctl(runs, "resume", "--run-id", "run-a").body.actions).toEqual([])
    expect(ctl(runs, "status", "--run-id", "run-a").body).toMatchObject({
      integration_lock: null,
      units: { U: { state: "cleaned" } },
    })
    expect(ctl(runs, "cleanup", "--run-id", "run-b", "--unit-id", "U", "--abandon", "--expect-transport", second.commit).word).toBe("CLEANED")
  })

  test("resume finalizes an accepted canonical commit without duplicate integration", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-committed", f)
    ctl(runs, "prepare", "--run-id", "run-committed", "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"))
    const workspace = path.join(runs, "run-committed", "units", "U", "workspace")
    writeFileSync(path.join(workspace, "committed.txt"), "accepted\n")
    const job = fakeDoneJob(runs, "run-committed", "U", "packet", "job-committed")
    ctl(runs, "record-job", "--run-id", "run-committed", "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job)
    const transport = ctl(runs, "terminalize", "--run-id", "run-committed", "--unit-id", "U").body.transport
    const token = ctl(runs, "integration-acquire", "--run-id", "run-committed", "--unit-id", "U").body.lock_token
    ctl(runs, "preflight", "--run-id", "run-committed", "--unit-id", "U", "--lock-token", token)
    git(f.repo, "cherry-pick", "--no-commit", transport.commit)
    ctl(runs, "mark-applied", "--run-id", "run-committed", "--unit-id", "U", "--lock-token", token)
    ctl(runs, "mark-verified", "--run-id", "run-committed", "--unit-id", "U", "--lock-token", token, "--evidence-digest", "tests-green")
    git(f.repo, "commit", "--no-verify", "-m", "feat(test): integrate committed unit")
    const acceptedHead = git(f.repo, "rev-parse", "HEAD")
    ctl(runs, "mark-committed", "--run-id", "run-committed", "--unit-id", "U", "--lock-token", token)

    const resumed = ctl(runs, "resume", "--run-id", "run-committed")
    expect(resumed.body.actions.map((action: any) => action.action)).toContain("committed-unit-finalized")
    expect(git(f.repo, "rev-parse", "HEAD")).toBe(acceptedHead)
    const status = ctl(runs, "status", "--run-id", "run-committed").body
    expect(status.units.U.state).toBe("cleaned")
    expect(status.integration_lock).toBeNull()
    const discovered = ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest)
    expect(discovered.body.run_id).toBe("run-committed")
    expect(discovered.body.actions).toEqual([])

    writeFileSync(path.join(f.repo, "manual-advance.txt"), "not controller accepted\n")
    git(f.repo, "add", "manual-advance.txt")
    git(f.repo, "commit", "--no-verify", "-m", "test: advance outside controller")
    const refused = ctl(
      runs, "verify-run", "--run-id", "run-committed",
      "--verification-summary", "must not verify an advanced head",
      "--", "python3", "-c", "from pathlib import Path; Path('verification-ran').write_text('ran')",
    )
    expect(refused.word).toBe("BLOCKED")
    expect(refused.body.accepted_heads).toContain(acceptedHead)
    expect(refused.body.actual_head).toBe(git(f.repo, "rev-parse", "HEAD"))
    expect(existsSync(path.join(f.repo, "verification-ran"))).toBe(false)
    expect(ctl(runs, "status", "--run-id", "run-committed").body.verifications).toEqual([])

    git(f.repo, "reset", "--hard", acceptedHead)
    expect(ctl(
      runs, "verify-run", "--run-id", "run-committed",
      "--verification-summary", "plan-wide gate passed",
      "--", "python3", "-c", "raise SystemExit(0)",
    ).word).toBe("RUN_VERIFIED")
    expect(ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest).word).toBe("NOT_FOUND")
    expect(ctl(runs, "resume", "--run-id", "run-committed").body.actions).toEqual([])
  })

  test("requires fresh plan verification after the accepted unit set changes", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-verification-scope"
    init(runs, runId, f)

    const completeUnit = (unitId: string, base: string) => {
      const packet = `${unitId} packet`
      const prepared = ctl(
        runs, "prepare", "--run-id", runId, "--unit-id", unitId,
        "--base", base, "--packet", packetFile(packet),
      )
      writeFileSync(path.join(prepared.body.workspace, `${unitId}.txt`), `${unitId}\n`)
      const job = fakeDoneJob(runs, runId, unitId, packet, `job-${unitId}`)
      ctl(
        runs, "record-job", "--run-id", runId, "--unit-id", unitId,
        "--attempt-id", "attempt-1", "--job-id", job,
      )
      ctl(runs, "terminalize", "--run-id", runId, "--unit-id", unitId)
      expect(ctl(
        runs, "integrate", "--run-id", runId, "--unit-id", unitId,
        "--commit-message", `feat(test): integrate ${unitId}`, "--", "true",
      ).word).toBe("UNIT_COMMITTED")
      return ctl(runs, "status", "--run-id", runId).body.units[unitId].integration.canonical_commit.commit
    }

    const firstHead = completeUnit("U1", f.base)
    expect(ctl(
      runs, "verify-run", "--run-id", runId,
      "--verification-summary", "first unit set verified", "--", "true",
    ).word).toBe("RUN_VERIFIED")
    expect(ctl(runs, "status", "--run-id", runId).body.verifications.at(-1)).toMatchObject({
      verification_exit: 0,
      canonical_head: firstHead,
      accepted_units: { U1: firstHead },
    })
    expect(ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest).word).toBe("NOT_FOUND")

    const secondHead = completeUnit("U2", firstHead)
    const stale = ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest)
    expect(stale.word).toBe("RESUMED")
    expect(stale.body).toMatchObject({ run_id: runId, actions: [] })

    expect(ctl(
      runs, "verify-run", "--run-id", runId,
      "--verification-summary", "changed unit set verified", "--", "true",
    ).word).toBe("RUN_VERIFIED")
    expect(ctl(runs, "status", "--run-id", runId).body.verifications.at(-1)).toMatchObject({
      verification_exit: 0,
      canonical_head: secondHead,
      accepted_units: { U1: firstHead, U2: secondHead },
    })
    expect(ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest).word).toBe("NOT_FOUND")

    writeFileSync(path.join(f.repo, "unaccepted.txt"), "not controller accepted\n")
    git(f.repo, "add", "unaccepted.txt")
    git(f.repo, "commit", "--no-verify", "-m", "test: advance beyond verified head")
    expect(ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest).word).toBe("RESUMED")
    git(f.repo, "reset", "--hard", secondHead)
    expect(ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest).word).toBe("NOT_FOUND")
  })

  test("restores applied-before-manifest and interrupted restore, but blocks on unknown dirt", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-restore", f)
    ctl(runs, "prepare", "--run-id", "run-restore", "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"))
    const workspace = path.join(runs, "run-restore", "units", "U", "workspace")
    writeFileSync(path.join(workspace, "new.txt"), "new\n")
    const job = fakeDoneJob(runs, "run-restore", "U", "packet")
    ctl(runs, "record-job", "--run-id", "run-restore", "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job)
    const transport = ctl(runs, "terminalize", "--run-id", "run-restore", "--unit-id", "U").body.transport
    let token = ctl(runs, "integration-acquire", "--run-id", "run-restore", "--unit-id", "U").body.lock_token
    ctl(runs, "preflight", "--run-id", "run-restore", "--unit-id", "U", "--lock-token", token)
    git(f.repo, "cherry-pick", "--no-commit", transport.commit)
    const applyInterrupted = ctlWithEnv(
      runs,
      { CE_WORK_TEST_FAULT: "after-apply-observed" },
      "mark-applied", "--run-id", "run-restore", "--unit-id", "U", "--lock-token", token,
    )
    expect(applyInterrupted.word).toBe("INTERRUPTED")
    const recovered = ctl(runs, "resume", "--run-id", "run-restore")
    expect(recovered.body.actions.map((a: any) => a.action)).toContain("apply-reconciled")
    expect(ctl(runs, "status", "--run-id", "run-restore", "--unit-id", "U").body.unit.state).toBe("integrated")
    expect(ctl(runs, "restore", "--run-id", "run-restore", "--unit-id", "U", "--lock-token", token).word).toBe("PRESERVED")
    expect(git(f.repo, "status", "--porcelain")).toBe("")

    expect(ctl(runs, "preflight", "--run-id", "run-restore", "--unit-id", "U", "--lock-token", token).word).toBe("PREFLIGHT_OK")
    git(f.repo, "cherry-pick", "--no-commit", transport.commit)
    const interrupted = ctlWithEnv(runs, { CE_WORK_TEST_FAULT: "restore-after-reset" }, "restore", "--run-id", "run-restore", "--unit-id", "U", "--lock-token", token)
    expect(interrupted.word).toBe("INTERRUPTED")
    expect(ctl(runs, "resume", "--run-id", "run-restore").body.actions.map((a: any) => a.action)).toContain("restored")

    token = ctl(runs, "integration-acquire", "--run-id", "run-restore", "--unit-id", "U").body.lock_token

    ctl(runs, "preflight", "--run-id", "run-restore", "--unit-id", "U", "--lock-token", token)
    git(f.repo, "cherry-pick", "--no-commit", transport.commit)
    writeFileSync(path.join(f.repo, "unknown.txt"), "do not delete\n")
    const blocked = ctl(runs, "restore", "--run-id", "run-restore", "--unit-id", "U", "--lock-token", token)
    expect(blocked.word).toBe("BLOCKED")
    expect(existsSync(path.join(f.repo, "unknown.txt"))).toBe(true)
    rmSync(path.join(f.repo, "unknown.txt"))
    expect(ctl(runs, "resume", "--run-id", "run-restore").body.actions.map((a: any) => a.action)).toContain("apply-reconciled")
    writeFileSync(path.join(f.repo, "keep.txt"), "unknown tracked edit\n")
    expect(ctl(runs, "restore", "--run-id", "run-restore", "--unit-id", "U", "--lock-token", token).word).toBe("BLOCKED")
    expect(readFileSync(path.join(f.repo, "keep.txt"), "utf8")).toBe("unknown tracked edit\n")
    git(f.repo, "restore", "--worktree", "keep.txt")
    expect(ctl(runs, "restore", "--run-id", "run-restore", "--unit-id", "U", "--lock-token", token).word).toBe("PRESERVED")
    expect(ctl(runs, "claim-fallback", "--run-id", "run-restore", "--unit-id", "U", "--caller-mode", "headless").word).toBe("REFUSED")
    expect(ctl(runs, "integration-release", "--run-id", "run-restore", "--unit-id", "U", "--lock-token", token).word).toBe("RELEASED")
    const fallback = ctl(runs, "claim-fallback", "--run-id", "run-restore", "--unit-id", "U", "--caller-mode", "headless")
    expect(fallback.word).toBe("FALLBACK_AUTHORIZED")
    expect(fallback.body.reason).toBe("canonical-attempt-preserved")
    expect(ctl(runs, "cleanup", "--run-id", "run-restore", "--unit-id", "U", "--abandon", "--expect-transport", transport.commit).word).toBe("CLEANED")
  })
})
