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

describe("ce-work unit workspace controller: abandoned-unit retries and reconciliation", () => {
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

  test("require falls back on the current harness after an external route terminates", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    initWithBinding(runs, "run-require", f, "require")
    ctl(runs, "prepare", "--run-id", "run-require", "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"))
    const job = fakeRunningJob(runs, "run-require", "U", "packet")
    ctl(runs, "record-job", "--run-id", "run-require", "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job)
    terminalizeFakeJob(runs, "run-require", job, "timeout")
    ctl(runs, "resume", "--run-id", "run-require")

    const fallback = ctl(runs, "claim-fallback", "--run-id", "run-require", "--unit-id", "U", "--caller-mode", "headless")
    expect(fallback.word).toBe("FALLBACK_AUTHORIZED")
    expect(fallback.body.start_native).toBe(true)
    expect(fallback.body.claim).toMatchObject({
      mode: "require",
      caller_mode: "headless",
    })
    expect(fallback.body.claim).not.toHaveProperty("confirmed_native")
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
