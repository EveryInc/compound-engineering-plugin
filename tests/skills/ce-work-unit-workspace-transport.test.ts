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

describe("ce-work unit workspace controller: transport, ignored evidence, and fold-in", () => {
  test("creates a detached sibling from a linked checkout and terminalizes the complete tree", () => {
    const f = makeRepo()
    const linked = path.join(tmp("ce-work-linked-"), "linked")
    git(f.repo, "worktree", "add", "-b", "feature", linked, f.base)
    f.repo = linked
    f.plan = path.join(linked, "docs", "plans", "plan.md")
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    expect(init(runs, "run-tree", f).word).toBe("READY")
    expect(ctl(runs, "prepare", "--run-id", "run-tree", "--unit-id", "U2", "--base", f.base, "--packet", packetFile("packet")).word).toBe("PREPARED")
    const workspace = path.join(runs, "run-tree", "units", "U2", "workspace")
    const linkedReal = realpathSync(linked)
    const workspaceReal = realpathSync(workspace)
    expect(workspaceReal.startsWith(`${linkedReal}${path.sep}`)).toBe(false)
    expect(worktreePaths(linked).map(realpathSync)).toContain(workspaceReal)
    expect(git(workspace, "rev-parse", "--git-common-dir")).toBe(git(linked, "rev-parse", "--git-common-dir"))
    expect(sh(workspace, ["git", "symbolic-ref", "-q", "HEAD"], false).status).not.toBe(0)

    writeFileSync(path.join(workspace, "keep.txt"), "committed\n")
    git(workspace, "add", "keep.txt")
    git(workspace, "-c", "user.name=Worker", "-c", "user.email=worker@example.test", "commit", "-m", "worker commit")
    writeFileSync(path.join(workspace, "keep.txt"), "residual\n")
    writeFileSync(path.join(workspace, "binary.bin"), Buffer.from([0, 255, 1, 2]))
    git(workspace, "mv", "delete.txt", "renamed.txt")
    chmodSync(path.join(workspace, "mode.sh"), 0o755)
    const job = fakeDoneJob(runs, "run-tree", "U2", "packet")
    expect(ctl(runs, "record-job", "--run-id", "run-tree", "--unit-id", "U2", "--attempt-id", "attempt-1", "--job-id", job).word).toBe("AUTHORING")
    expect(ctl(runs, "sync-job", "--run-id", "run-tree", "--unit-id", "U2").body.process_state).toBe("done")
    const terminal = ctl(runs, "terminalize", "--run-id", "run-tree", "--unit-id", "U2")
    expect(terminal.word).toBe("INTEGRATION_PENDING")
    const lateRecord = ctl(
      runs, "record-job", "--run-id", "run-tree", "--unit-id", "U2",
      "--attempt-id", "attempt-1", "--job-id", job,
    )
    expect(lateRecord.body).toMatchObject({ resumed: true, unit_state: "integration-pending" })
    expect(ctl(runs, "status", "--run-id", "run-tree", "--unit-id", "U2").body.unit.state).toBe("integration-pending")
    const transport = terminal.body.transport
    expect(git(linked, "rev-list", "--parents", "-n", "1", transport.commit).split(" ")).toEqual([transport.commit, f.base])
    expect(git(linked, "rev-parse", `${transport.commit}^{tree}`)).toBe(transport.tree)
    expect(git(workspace, "rev-parse", "HEAD")).toBe(transport.commit)
    expect(git(workspace, "status", "--porcelain")).toBe("")
    expect(git(linked, "show", `${transport.commit}:keep.txt`)).toBe("residual")
    expect(git(linked, "show", `${transport.commit}:renamed.txt`)).toBe("delete")
    expect(git(linked, "ls-tree", transport.commit, "mode.sh").split(" ")[0]).toBe("100755")
    git(linked, "gc", "--prune=now")
    expect(git(linked, "rev-parse", transport.ref)).toBe(transport.commit)
    expect(ctl(runs, "cleanup", "--run-id", "run-tree", "--unit-id", "U2", "--abandon", "--expect-transport", transport.commit).word).toBe("CLEANED")
    expect(worktreePaths(linked)).not.toContain(path.resolve(workspace))
    expect(sh(linked, ["git", "rev-parse", "-q", "--verify", transport.ref], false).status).not.toBe(0)
    expect(existsSync(path.join(runs, "run-tree", "jobs", job))).toBe(false)
    expect(existsSync(path.join(runs, "run-tree", "units", "U2", "result"))).toBe(false)
    expect(existsSync(path.join(runs, "run-tree", "units", "U2", "packet.md"))).toBe(false)
    expect(existsSync(path.join(runs, "run-tree", "units", "U2", "authorization.json"))).toBe(false)
    const compact = ctl(runs, "status", "--run-id", "run-tree", "--unit-id", "U2").body.unit
    expect(compact.cleanup.artifact_cleanup.complete).toBe(true)
    expect(compact.attempts[0].terminal_receipt).toMatchObject({
      actual_route: "codex",
      packet_digest: packetDigest("packet"),
      terminal_status: "completed",
      evidence_count: 1,
    })

    expect(init(runs, "run-empty", f).word).toBe("READY")
    ctl(runs, "prepare", "--run-id", "run-empty", "--unit-id", "empty", "--base", f.base, "--packet", packetFile("empty-packet"))
    const emptyJob = fakeDoneJob(runs, "run-empty", "empty", "empty-packet")
    ctl(runs, "record-job", "--run-id", "run-empty", "--unit-id", "empty", "--attempt-id", "attempt-1", "--job-id", emptyJob)
    const empty = ctl(runs, "terminalize", "--run-id", "run-empty", "--unit-id", "empty").body.transport
    expect(empty.tree).toBe(git(linked, "rev-parse", `${f.base}^{tree}`))
    expect(git(linked, "rev-list", "--parents", "-n", "1", empty.commit).split(" ")).toEqual([empty.commit, f.base])
    expect(ctl(runs, "cleanup", "--run-id", "run-empty", "--unit-id", "empty", "--abandon", "--expect-transport", empty.commit).word).toBe("CLEANED")
  })

  test("pins a transport ref with the repository object ID width", () => {
    const f = makeRepo("sha256")
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    expect(init(runs, "run-sha256", f).word).toBe("READY")
    expect(ctl(
      runs, "prepare", "--run-id", "run-sha256", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("sha256 packet"),
    ).word).toBe("PREPARED")
    const job = fakeDoneJob(runs, "run-sha256", "U", "sha256 packet", "job-sha256")
    expect(ctl(
      runs, "record-job", "--run-id", "run-sha256", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    ).word).toBe("AUTHORING")

    const terminal = ctl(runs, "terminalize", "--run-id", "run-sha256", "--unit-id", "U")
    expect(terminal.word).toBe("INTEGRATION_PENDING")
    expect(terminal.body.transport.commit).toHaveLength(64)
    expect(git(f.repo, "rev-parse", terminal.body.transport.ref)).toBe(terminal.body.transport.commit)
  })

  test("blocks ignored untracked worker output omitted from changed-files evidence", () => {
    const f = makeRepo()
    writeFileSync(path.join(f.repo, ".gitignore"), "ignored-output/\n")
    git(f.repo, "add", ".gitignore")
    git(f.repo, "commit", "-m", "ignore generated output")
    f.base = git(f.repo, "rev-parse", "HEAD")
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    expect(init(runs, "run-ignored-worker", f).word).toBe("READY")
    expect(ctl(
      runs, "prepare", "--run-id", "run-ignored-worker", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("ignored worker packet"),
    ).word).toBe("PREPARED")
    const workspace = path.join(runs, "run-ignored-worker", "units", "U", "workspace")
    mkdirSync(path.join(workspace, "ignored-output"))
    writeFileSync(path.join(workspace, "ignored-output", "fixture.txt"), "required fixture\n")
    const job = fakeDoneJob(
      runs,
      "run-ignored-worker",
      "U",
      "ignored worker packet",
      "job-ignored-worker",
      "completed",
      [],
    )
    expect(ctl(
      runs, "record-job", "--run-id", "run-ignored-worker", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    ).word).toBe("AUTHORING")

    const terminal = ctl(runs, "terminalize", "--run-id", "run-ignored-worker", "--unit-id", "U")
    expect(terminal.word).toBe("BLOCKED")
    expect(terminal.stderr).toContain("ignored untracked output")
    expect(terminal.stderr).toContain("ignored-output/fixture.txt")
    const status = ctl(runs, "status", "--run-id", "run-ignored-worker", "--unit-id", "U").body.unit
    expect(status.state).toBe("authored")
    expect(status.transport.commit).toBeNull()
    expect(status.attempts[0].terminal_validation_failure).toMatchObject({
      word: "BLOCKED",
      reason: expect.stringContaining("ignored untracked output"),
      job_id: job,
    })
    expect(status.attempts[0].fallback).toMatchObject({
      eligible: true,
      reason: "terminal-validation-failure",
      claimed: null,
    })
    expect(existsSync(path.join(workspace, "ignored-output", "fixture.txt"))).toBe(true)
    expect(ctl(
      runs, "claim-fallback", "--run-id", "run-ignored-worker", "--unit-id", "U",
      "--caller-mode", "headless",
    ).word).toBe("FALLBACK_AUTHORIZED")
    renameSync(
      path.join(workspace, "ignored-output", "fixture.txt"),
      path.join(workspace, "ignored-output", "incidental.txt"),
    )
    const owned = ctl(runs, "terminalize", "--run-id", "run-ignored-worker", "--unit-id", "U")
    expect(owned.word).toBe("REFUSED")
    expect(owned.stderr).toContain("native fallback already owns implementation")
    const claimed = ctl(runs, "status", "--run-id", "run-ignored-worker", "--unit-id", "U").body.unit
    expect(claimed.state).toBe("authored")
    expect(claimed.transport.commit).toBeNull()
    expect(claimed.attempts[0].terminal_validation_failure).toBeTruthy()
    expect(claimed.attempts[0].fallback.claimed).toBeTruthy()
    expect(ctl(
      runs, "cleanup", "--run-id", "run-ignored-worker", "--unit-id", "U",
      "--abandon", "--expect-job", job,
    ).word).toBe("CLEANED")
    expect(existsSync(workspace)).toBe(false)
  })

  test("authorizes fallback and abandonment after post-receipt gitlink validation fails", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-gitlink-worker"
    expect(init(runs, runId, f).word).toBe("READY")
    expect(ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("gitlink worker packet"),
    ).word).toBe("PREPARED")
    const workspace = path.join(runs, runId, "units", "U", "workspace")
    const nested = path.join(workspace, "nested-module")
    mkdirSync(nested)
    git(nested, "init", "-b", "main")
    git(nested, "config", "user.name", "Nested Test")
    git(nested, "config", "user.email", "nested@example.test")
    writeFileSync(path.join(nested, "nested.txt"), "nested\n")
    git(nested, "add", "nested.txt")
    git(nested, "commit", "-m", "nested seed")
    const job = fakeDoneJob(runs, runId, "U", "gitlink worker packet", "job-gitlink-worker")
    expect(ctl(
      runs, "record-job", "--run-id", runId, "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    ).word).toBe("AUTHORING")

    const terminal = ctl(runs, "terminalize", "--run-id", runId, "--unit-id", "U")
    expect(terminal.word).toBe("BLOCKED")
    expect(terminal.stderr).toContain("submodule state cannot be transported implicitly")
    const status = ctl(runs, "status", "--run-id", runId, "--unit-id", "U").body.unit
    expect(status.state).toBe("authored")
    expect(status.attempts[0].terminal_receipt).toMatchObject({ terminal_status: "completed" })
    expect(status.attempts[0].terminal_validation_failure).toMatchObject({
      word: "BLOCKED",
      reason: "submodule state cannot be transported implicitly",
      job_id: job,
    })
    expect(status.attempts[0].fallback).toMatchObject({
      eligible: true,
      reason: "terminal-validation-failure",
      claimed: null,
    })
    expect(ctl(
      runs, "claim-fallback", "--run-id", runId, "--unit-id", "U", "--caller-mode", "headless",
    ).word).toBe("FALLBACK_AUTHORIZED")
    expect(ctl(
      runs, "cleanup", "--run-id", runId, "--unit-id", "U",
      "--abandon", "--expect-job", job,
    ).word).toBe("CLEANED")
    expect(existsSync(workspace)).toBe(false)
  })

  test("allows an unchanged baseline gitlink but blocks changing it", () => {
    const f = makeRepo()
    const baselineTarget = f.base
    git(f.repo, "update-index", "--add", "--cacheinfo", "160000", baselineTarget, "baseline-module")
    git(f.repo, "commit", "-m", "add baseline gitlink")
    mkdirSync(path.join(f.repo, "baseline-module"))
    f.base = git(f.repo, "rev-parse", "HEAD")
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-baseline-gitlink"
    expect(init(runs, runId, f).word).toBe("READY")

    expect(ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "unchanged",
      "--base", f.base, "--packet", packetFile("unchanged gitlink packet"),
    ).word).toBe("PREPARED")
    const unchangedWorkspace = path.join(runs, runId, "units", "unchanged", "workspace")
    writeFileSync(path.join(unchangedWorkspace, "keep.txt"), "transported\n")
    const unchangedJob = fakeDoneJob(
      runs, runId, "unchanged", "unchanged gitlink packet", "job-unchanged-gitlink",
    )
    expect(ctl(
      runs, "record-job", "--run-id", runId, "--unit-id", "unchanged",
      "--attempt-id", "attempt-1", "--job-id", unchangedJob,
    ).word).toBe("AUTHORING")
    const unchanged = ctl(runs, "terminalize", "--run-id", runId, "--unit-id", "unchanged")
    expect(unchanged.word).toBe("INTEGRATION_PENDING")
    expect(git(f.repo, "ls-tree", unchanged.body.transport.commit, "baseline-module")).toContain(
      `160000 commit ${baselineTarget}`,
    )

    expect(ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "changed",
      "--base", f.base, "--packet", packetFile("changed gitlink packet"),
    ).word).toBe("PREPARED")
    const changedWorkspace = path.join(runs, runId, "units", "changed", "workspace")
    git(changedWorkspace, "update-index", "--cacheinfo", "160000", f.base, "baseline-module")
    const changedJob = fakeDoneJob(
      runs, runId, "changed", "changed gitlink packet", "job-changed-gitlink",
    )
    expect(ctl(
      runs, "record-job", "--run-id", runId, "--unit-id", "changed",
      "--attempt-id", "attempt-1", "--job-id", changedJob,
    ).word).toBe("AUTHORING")
    const changed = ctl(runs, "terminalize", "--run-id", runId, "--unit-id", "changed")
    expect(changed.word).toBe("BLOCKED")
    expect(changed.stderr).toContain("submodule state cannot be transported implicitly")
  })

  test("retires ignored-output fallback eligibility after terminalization recovers", () => {
    const f = makeRepo()
    writeFileSync(path.join(f.repo, ".gitignore"), "ignored-output/\n")
    git(f.repo, "add", ".gitignore")
    git(f.repo, "commit", "-m", "ignore generated output")
    f.base = git(f.repo, "rev-parse", "HEAD")
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    expect(init(runs, "run-ignored-recovery", f).word).toBe("READY")
    expect(ctl(
      runs, "prepare", "--run-id", "run-ignored-recovery", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("ignored recovery packet"),
    ).word).toBe("PREPARED")
    const workspace = path.join(runs, "run-ignored-recovery", "units", "U", "workspace")
    mkdirSync(path.join(workspace, "ignored-output"))
    const reportedOutput = path.join(workspace, "ignored-output", "fixture.txt")
    writeFileSync(reportedOutput, "required fixture\n")
    const job = fakeDoneJob(
      runs,
      "run-ignored-recovery",
      "U",
      "ignored recovery packet",
      "job-ignored-recovery",
      "completed",
      ["ignored-output/fixture.txt"],
    )
    expect(ctl(
      runs, "record-job", "--run-id", "run-ignored-recovery", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    ).word).toBe("AUTHORING")
    expect(ctl(
      runs, "terminalize", "--run-id", "run-ignored-recovery", "--unit-id", "U",
    ).word).toBe("BLOCKED")

    renameSync(reportedOutput, path.join(workspace, "recovered.txt"))
    expect(ctl(
      runs, "terminalize", "--run-id", "run-ignored-recovery", "--unit-id", "U",
    ).word).toBe("INTEGRATION_PENDING")
    const recovered = ctl(
      runs, "status", "--run-id", "run-ignored-recovery", "--unit-id", "U",
    ).body.unit
    expect(recovered.state).toBe("integration-pending")
    expect(recovered.transport.commit).toBeTruthy()
    expect(recovered.attempts[0].terminal_validation_failure).toBeUndefined()
    expect(recovered.attempts[0].fallback).toEqual({ eligible: false, reason: null, claimed: null })

    const fallback = ctl(
      runs, "claim-fallback", "--run-id", "run-ignored-recovery", "--unit-id", "U",
      "--caller-mode", "headless",
    )
    expect(fallback.word).toBe("REFUSED")
    expect(fallback.stderr).toContain("pinned worker transport must be reconciled")
  })

  test("blocks incidental ignored worker side effects outside reported outputs", () => {
    const f = makeRepo()
    writeFileSync(path.join(f.repo, ".gitignore"), "cache/\n")
    git(f.repo, "add", ".gitignore")
    git(f.repo, "commit", "-m", "ignore cache")
    f.base = git(f.repo, "rev-parse", "HEAD")
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    expect(init(runs, "run-ignored-cache", f).word).toBe("READY")
    expect(ctl(
      runs, "prepare", "--run-id", "run-ignored-cache", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("ignored cache packet"),
    ).word).toBe("PREPARED")
    const workspace = path.join(runs, "run-ignored-cache", "units", "U", "workspace")
    writeFileSync(path.join(workspace, "result.txt"), "shippable\n")
    mkdirSync(path.join(workspace, "cache"))
    writeFileSync(path.join(workspace, "cache", "tool.bin"), "incidental\n")
    const job = fakeDoneJob(
      runs,
      "run-ignored-cache",
      "U",
      "ignored cache packet",
      "job-ignored-cache",
      "completed",
      ["result.txt"],
    )
    expect(ctl(
      runs, "record-job", "--run-id", "run-ignored-cache", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    ).word).toBe("AUTHORING")

    const terminal = ctl(runs, "terminalize", "--run-id", "run-ignored-cache", "--unit-id", "U")
    expect(terminal.word).toBe("BLOCKED")
    expect(terminal.stderr).toContain("cache/tool.bin")
    const status = ctl(runs, "status", "--run-id", "run-ignored-cache", "--unit-id", "U").body.unit
    expect(status.state).toBe("authored")
    expect(status.transport.commit).toBeNull()
    expect(status.attempts[0].terminal_validation_failure).toMatchObject({
      word: "BLOCKED",
      reason: expect.stringContaining("ignored untracked output"),
      job_id: job,
    })
  })

  test("retains scope-expansion evidence but refuses ordinary fold-in", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-scope-expansion", f)
    ctl(
      runs, "prepare", "--run-id", "run-scope-expansion", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    )
    const workspace = path.join(runs, "run-scope-expansion", "units", "U", "workspace")
    writeFileSync(path.join(workspace, "candidate.txt"), "requires broader scope\n")
    const job = fakeDoneJob(
      runs, "run-scope-expansion", "U", "packet", "job-scope-expansion", "scope_expansion",
    )
    ctl(
      runs, "record-job", "--run-id", "run-scope-expansion", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )

    const terminal = ctl(runs, "terminalize", "--run-id", "run-scope-expansion", "--unit-id", "U")
    expect(terminal.word).toBe("INTEGRATION_PENDING")
    expect(git(f.repo, "show", `${terminal.body.transport.commit}:candidate.txt`)).toBe("requires broader scope")
    const resultPath = path.join(runs, "run-scope-expansion", "units", "U", "result", "implementation-result.json")
    expect(JSON.parse(readFileSync(resultPath, "utf8"))).toMatchObject({
      terminal_status: "scope_expansion",
      scope_expansion: { requested_paths: ["shared.ts"], reason: "required by unit" },
    })
    expect(ctl(runs, "status", "--run-id", "run-scope-expansion", "--unit-id", "U").body.unit).toMatchObject({
      state: "integration-pending",
      transport: terminal.body.transport,
      attempts: [{ terminal_receipt: { terminal_status: "scope_expansion", scope_expansion_requested: true } }],
    })

    const lock = ctl(runs, "integration-acquire", "--run-id", "run-scope-expansion", "--unit-id", "U")
    expect(lock.word).toBe("ACQUIRED")
    const preflight = ctl(
      runs, "preflight", "--run-id", "run-scope-expansion", "--unit-id", "U",
      "--lock-token", lock.body.lock_token,
    )
    expect(preflight.word).toBe("BLOCKED")
    expect(preflight.body).toMatchObject({
      terminal_status: "scope_expansion",
      transport: terminal.body.transport,
      recovery_path: path.join(runs, "run-scope-expansion", "units", "U"),
    })
    expect(ctl(
      runs, "integration-release", "--run-id", "run-scope-expansion", "--unit-id", "U",
      "--lock-token", lock.body.lock_token,
    ).word).toBe("RELEASED")

    const integrated = ctl(
      runs, "integrate", "--run-id", "run-scope-expansion", "--unit-id", "U",
      "--commit-message", "integrate U", "--", "true",
    )
    expect(integrated.word).toBe("BLOCKED")
    expect(git(f.repo, "rev-parse", "HEAD")).toBe(f.base)
    expect(git(f.repo, "status", "--porcelain")).toBe("")
    expect(existsSync(resultPath)).toBe(true)
    expect(git(f.repo, "rev-parse", terminal.body.transport.ref)).toBe(terminal.body.transport.commit)
  })

  test("retains a worker blocker for host resolution without authorizing native fallback", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-worker-blocked", f)
    ctl(
      runs, "prepare", "--run-id", "run-worker-blocked", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    )
    const job = fakeDoneJob(runs, "run-worker-blocked", "U", "packet", "job-worker-blocked", "blocked")
    ctl(
      runs, "record-job", "--run-id", "run-worker-blocked", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )

    const terminal = ctl(runs, "terminalize", "--run-id", "run-worker-blocked", "--unit-id", "U")
    expect(terminal.code).toBe(1)
    expect(terminal.word).toBe("BLOCKED")
    expect(terminal.body).toMatchObject({
      unit_id: "U",
      terminal_status: "blocked",
      summary: "done",
      terminal_receipt: { terminal_status: "blocked", summary: "done" },
      recovery_path: path.join(runs, "run-worker-blocked", "units", "U"),
    })

    const unit = ctl(runs, "status", "--run-id", "run-worker-blocked", "--unit-id", "U").body.unit
    expect(unit).toMatchObject({
      state: "authored",
      attempts: [{
        process_state: "done",
        terminal_receipt: { terminal_status: "blocked", summary: "done" },
        fallback: { eligible: false, claimed: null },
      }],
    })
    expect(unit.attempts[0].terminal_validation_failure).toBeUndefined()

    const fallback = ctl(
      runs, "claim-fallback", "--run-id", "run-worker-blocked", "--unit-id", "U",
      "--caller-mode", "interactive",
    )
    expect(fallback.word).toBe("REFUSED")
    expect(fallback.stderr).toContain("successful worker output must be reconciled rather than bypassed")

    expect(ctl(
      runs, "cleanup", "--run-id", "run-worker-blocked", "--unit-id", "U",
      "--abandon", "--expect-job", "wrong-job",
    ).word).toBe("REFUSED")
    const resultPath = path.join(runs, "run-worker-blocked", "units", "U", "result", "implementation-result.json")
    const exactResult = readFileSync(resultPath, "utf8")
    const changedResult = JSON.parse(exactResult)
    changedResult.summary = "changed after host resolution"
    writeFileSync(resultPath, `${JSON.stringify(changedResult)}\n`, { mode: 0o600 })
    expect(ctl(
      runs, "cleanup", "--run-id", "run-worker-blocked", "--unit-id", "U",
      "--abandon", "--expect-job", job,
    ).word).toBe("BLOCKED")
    writeFileSync(resultPath, exactResult, { mode: 0o600 })
    const authorizationPath = path.join(runs, "run-worker-blocked", "units", "U", "authorization.json")
    const packetPath = path.join(runs, "run-worker-blocked", "units", "U", "packet.md")
    const jobPath = path.join(runs, "run-worker-blocked", "jobs", job)
    expect(ctl(
      runs, "cleanup", "--run-id", "run-worker-blocked", "--unit-id", "U",
      "--abandon", "--expect-job", job,
    ).word).toBe("CLEANED")
    const cleaned = ctl(runs, "status", "--run-id", "run-worker-blocked", "--unit-id", "U").body.unit
    expect(cleaned).toMatchObject({
      state: "cleaned",
      cleanup: {
        abandoned: true,
        abandonment_receipt: {
          kind: "retained-worker-blocker",
          value: job,
          process_state: "done",
          terminal_status: "blocked",
          result_sha256: unit.attempts[0].terminal_receipt.result_sha256,
          raw_log_sha256: unit.attempts[0].terminal_receipt.raw_log_sha256,
        },
        artifact_cleanup: { complete: true },
      },
      packet: { retained: false },
      attempts: [{ bulky_artifacts_retained: false, authorization_retained: false }],
    })
    for (const pruned of [resultPath, authorizationPath, packetPath, jobPath]) {
      expect(existsSync(pruned)).toBe(false)
    }

    const retried = ctl(
      runs, "prepare", "--run-id", "run-worker-blocked", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("corrected packet"), "--attempt-id", "attempt-2",
    )
    expect(retried).toMatchObject({ word: "PREPARED", body: { attempt_id: "attempt-2", resumed: false } })
    expect(ctl(runs, "status", "--run-id", "run-worker-blocked", "--unit-id", "U").body.unit).toMatchObject({
      state: "queued",
      cleanup: null,
      attempts: [
        { attempt_id: "attempt-1", cleanup_receipt: { abandonment_receipt: { kind: "retained-worker-blocker" } } },
        { attempt_id: "attempt-2" },
      ],
    })
  })

  test("refuses to abandon ordinary completed done output by terminal job id", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-completed-done", f)
    ctl(
      runs, "prepare", "--run-id", "run-completed-done", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    )
    const job = fakeDoneJob(runs, "run-completed-done", "U", "packet", "job-completed-done")
    ctl(
      runs, "record-job", "--run-id", "run-completed-done", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )
    expect(ctl(runs, "sync-job", "--run-id", "run-completed-done", "--unit-id", "U").word).toBe("SYNCED")

    const rejected = ctl(
      runs, "cleanup", "--run-id", "run-completed-done", "--unit-id", "U",
      "--abandon", "--expect-job", job,
    )
    expect(rejected.word).toBe("REFUSED")
    expect(rejected.stderr).toContain("done output is not an exactly retained worker blocker")
    expect(existsSync(path.join(runs, "run-completed-done", "units", "U", "workspace"))).toBe(true)
  })

  test("resume retains a trusted worker blocker while reconciling later units", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-resume-worker-blocked", f)
    for (const [unitId, terminalStatus] of [
      ["U-blocked", "blocked"],
      ["U-ready", "completed"],
    ] as const) {
      const packet = `packet-${unitId}`
      ctl(
        runs, "prepare", "--run-id", "run-resume-worker-blocked", "--unit-id", unitId,
        "--base", f.base, "--packet", packetFile(packet),
      )
      const job = fakeDoneJob(
        runs, "run-resume-worker-blocked", unitId, packet, `job-${unitId}`, terminalStatus,
      )
      ctl(
        runs, "record-job", "--run-id", "run-resume-worker-blocked", "--unit-id", unitId,
        "--attempt-id", "attempt-1", "--job-id", job,
      )
    }
    expect(ctl(
      runs, "terminalize", "--run-id", "run-resume-worker-blocked", "--unit-id", "U-blocked",
    ).word).toBe("BLOCKED")

    const resumed = ctl(runs, "resume", "--run-id", "run-resume-worker-blocked")
    expect(resumed.word).toBe("RESUMED")
    expect(resumed.body.actions).toContainEqual({
      unit_id: "U-blocked",
      action: "worker-blocker-retained",
      terminal_status: "blocked",
      summary: "done",
      recovery_path: path.join(runs, "run-resume-worker-blocked", "units", "U-blocked"),
    })
    expect(resumed.body.actions).toContainEqual(expect.objectContaining({
      unit_id: "U-ready",
      action: "terminalized",
    }))
    const status = ctl(runs, "status", "--run-id", "run-resume-worker-blocked").body
    expect(status.units["U-blocked"]).toMatchObject({
      state: "authored",
      attempts: [{ terminal_receipt: { terminal_status: "blocked", summary: "done" } }],
    })
    expect(status.units["U-ready"].state).toBe("integration-pending")
  })

  test("resume does not swallow unrelated terminalization blockers", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-resume-invalid-terminal", f)
    ctl(
      runs, "prepare", "--run-id", "run-resume-invalid-terminal", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    )
    const job = fakeDoneJob(runs, "run-resume-invalid-terminal", "U", "packet")
    const resultPath = path.join(
      runs, "run-resume-invalid-terminal", "units", "U", "result", "implementation-result.json",
    )
    const result = JSON.parse(readFileSync(resultPath, "utf8"))
    result.requested_route = "claude"
    writeFileSync(resultPath, `${JSON.stringify(result)}\n`, { mode: 0o600 })
    ctl(
      runs, "record-job", "--run-id", "run-resume-invalid-terminal", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )

    const resumed = ctl(runs, "resume", "--run-id", "run-resume-invalid-terminal")
    expect(resumed.word).toBe("BLOCKED")
    expect(resumed.body).toMatchObject({ mismatches: { requested_route: { expected: "codex", actual: "claude" } } })
    expect(resumed.stderr).toContain("adapter terminal receipt does not match controller authorization")
  })

  test("preflight requires accepted canonical commits for every dependency", () => {
    const unmet = makeRepo()
    const unmetRuns = path.join(tmp("ce-work-runs-"), "ce-work")
    init(unmetRuns, "run-unmet-dependencies", unmet)
    ctl(
      unmetRuns, "prepare", "--run-id", "run-unmet-dependencies", "--unit-id", "U1",
      "--base", unmet.base, "--packet", packetFile("dependency packet"),
    )
    ctl(
      unmetRuns, "prepare", "--run-id", "run-unmet-dependencies", "--unit-id", "U2",
      "--base", unmet.base, "--packet", packetFile("dependent packet"),
      "--dependency", "U1", "--dependency", "missing",
    )
    const unmetJob = fakeDoneJob(unmetRuns, "run-unmet-dependencies", "U2", "dependent packet")
    ctl(
      unmetRuns, "record-job", "--run-id", "run-unmet-dependencies", "--unit-id", "U2",
      "--attempt-id", "attempt-1", "--job-id", unmetJob,
    )
    ctl(unmetRuns, "terminalize", "--run-id", "run-unmet-dependencies", "--unit-id", "U2")
    const unmetLock = ctl(
      unmetRuns, "integration-acquire", "--run-id", "run-unmet-dependencies", "--unit-id", "U2",
    )
    const blocked = ctl(
      unmetRuns, "preflight", "--run-id", "run-unmet-dependencies", "--unit-id", "U2",
      "--lock-token", unmetLock.body.lock_token,
    )
    expect(blocked.word).toBe("BLOCKED")
    expect(blocked.body).toEqual({
      unit_id: "U2",
      missing_dependencies: ["missing"],
      unaccepted_dependencies: ["U1"],
    })
    expect(ctl(
      unmetRuns, "integration-release", "--run-id", "run-unmet-dependencies", "--unit-id", "U2",
      "--lock-token", unmetLock.body.lock_token,
    ).word).toBe("RELEASED")

    const accepted = makeRepo()
    const acceptedRuns = path.join(tmp("ce-work-runs-"), "ce-work")
    init(acceptedRuns, "run-accepted-dependency", accepted)
    ctl(
      acceptedRuns, "prepare", "--run-id", "run-accepted-dependency", "--unit-id", "U1",
      "--base", accepted.base, "--packet", packetFile("accepted dependency packet"),
    )
    const dependencyWorkspace = path.join(acceptedRuns, "run-accepted-dependency", "units", "U1", "workspace")
    writeFileSync(path.join(dependencyWorkspace, "dependency.txt"), "accepted\n")
    const dependencyJob = fakeDoneJob(
      acceptedRuns, "run-accepted-dependency", "U1", "accepted dependency packet", "job-dependency",
    )
    ctl(
      acceptedRuns, "record-job", "--run-id", "run-accepted-dependency", "--unit-id", "U1",
      "--attempt-id", "attempt-1", "--job-id", dependencyJob,
    )
    ctl(acceptedRuns, "terminalize", "--run-id", "run-accepted-dependency", "--unit-id", "U1")
    const integrated = ctl(
      acceptedRuns, "integrate", "--run-id", "run-accepted-dependency", "--unit-id", "U1",
      "--commit-message", "test: integrate dependency", "--", "true",
    )
    expect(integrated.word).toBe("UNIT_COMMITTED")
    const dependency = ctl(
      acceptedRuns, "status", "--run-id", "run-accepted-dependency", "--unit-id", "U1",
    ).body.unit
    expect(dependency.state).toBe("cleaned")
    expect(dependency.integration.canonical_commit.commit).toBe(integrated.body.canonical_commit)

    ctl(
      acceptedRuns, "prepare", "--run-id", "run-accepted-dependency", "--unit-id", "U2",
      "--base", integrated.body.canonical_commit, "--packet", packetFile("accepted dependent packet"),
      "--dependency", "U1",
    )
    const dependentJob = fakeDoneJob(
      acceptedRuns, "run-accepted-dependency", "U2", "accepted dependent packet", "job-dependent",
    )
    ctl(
      acceptedRuns, "record-job", "--run-id", "run-accepted-dependency", "--unit-id", "U2",
      "--attempt-id", "attempt-1", "--job-id", dependentJob,
    )
    ctl(acceptedRuns, "terminalize", "--run-id", "run-accepted-dependency", "--unit-id", "U2")
    const acceptedLock = ctl(
      acceptedRuns, "integration-acquire", "--run-id", "run-accepted-dependency", "--unit-id", "U2",
    )
    expect(ctl(
      acceptedRuns, "preflight", "--run-id", "run-accepted-dependency", "--unit-id", "U2",
      "--lock-token", acceptedLock.body.lock_token,
    ).word).toBe("PREFLIGHT_OK")
    expect(ctl(
      acceptedRuns, "restore", "--run-id", "run-accepted-dependency", "--unit-id", "U2",
      "--lock-token", acceptedLock.body.lock_token,
    ).word).toBe("PRESERVED")
    expect(ctl(
      acceptedRuns, "integration-release", "--run-id", "run-accepted-dependency", "--unit-id", "U2",
      "--lock-token", acceptedLock.body.lock_token,
    ).word).toBe("RELEASED")
  })

  test("integrates an early-prepared unit after its dependency chain is accepted", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-late-dependency-heads"
    init(runs, runId, f)

    const units = [
      { id: "U1", dependencies: [] },
      { id: "U2", dependencies: ["U1"] },
      { id: "U3", dependencies: ["U1", "U2"] },
    ]
    for (const unit of units) {
      ctl(
        runs, "prepare", "--run-id", runId, "--unit-id", unit.id,
        "--base", f.base, "--packet", packetFile(`packet-${unit.id}`),
        ...unit.dependencies.flatMap((dependency) => ["--dependency", dependency]),
      )
      const workspace = path.join(runs, runId, "units", unit.id, "workspace")
      writeFileSync(path.join(workspace, `${unit.id}.txt`), `${unit.id}\n`)
      const job = fakeDoneJob(runs, runId, unit.id, `packet-${unit.id}`, `job-${unit.id}`)
      ctl(
        runs, "record-job", "--run-id", runId, "--unit-id", unit.id,
        "--attempt-id", "attempt-1", "--job-id", job,
      )
      expect(ctl(runs, "terminalize", "--run-id", runId, "--unit-id", unit.id).word).toBe("INTEGRATION_PENDING")
    }

    const first = ctl(
      runs, "integrate", "--run-id", runId, "--unit-id", "U1",
      "--commit-message", "test: integrate first dependency", "--", "true",
    )
    expect(first.word).toBe("UNIT_COMMITTED")
    const second = ctl(
      runs, "integrate", "--run-id", runId, "--unit-id", "U2",
      "--commit-message", "test: integrate second dependency", "--", "true",
    )
    expect(second.word).toBe("UNIT_COMMITTED")

    git(f.repo, "reset", "--hard", f.base)
    const staleLock = ctl(runs, "integration-acquire", "--run-id", runId, "--unit-id", "U3")
    const stale = ctl(
      runs, "preflight", "--run-id", runId, "--unit-id", "U3",
      "--lock-token", staleLock.body.lock_token,
    )
    expect(stale.word).toBe("BLOCKED")
    expect(stale.body).toMatchObject({
      unit_id: "U3",
      missing_ancestry: {
        [f.base]: expect.arrayContaining([
          first.body.canonical_commit,
          second.body.canonical_commit,
        ]),
      },
    })
    expect(ctl(
      runs, "integration-release", "--run-id", runId, "--unit-id", "U3",
      "--lock-token", staleLock.body.lock_token,
    ).word).toBe("RELEASED")

    git(f.repo, "reset", "--hard", second.body.canonical_commit)
    writeFileSync(path.join(f.repo, "unrelated.txt"), "unrelated canonical advance\n")
    git(f.repo, "add", "unrelated.txt")
    git(f.repo, "commit", "-m", "unrelated canonical advance")
    const lock = ctl(runs, "integration-acquire", "--run-id", runId, "--unit-id", "U3")
    const blocked = ctl(
      runs, "preflight", "--run-id", runId, "--unit-id", "U3",
      "--lock-token", lock.body.lock_token,
    )
    expect(blocked.word).toBe("BLOCKED")
    expect(blocked.stderr).toContain("canonical HEAD advanced outside the recorded wave")
    expect(ctl(
      runs, "integration-release", "--run-id", runId, "--unit-id", "U3",
      "--lock-token", lock.body.lock_token,
    ).word).toBe("RELEASED")

    git(f.repo, "reset", "--hard", second.body.canonical_commit)
    const dependent = ctl(
      runs, "integrate", "--run-id", runId, "--unit-id", "U3",
      "--commit-message", "test: integrate dependent unit", "--", "true",
    )
    expect(dependent.word).toBe("UNIT_COMMITTED")
    expect(readFileSync(path.join(f.repo, "U1.txt"), "utf8")).toBe("U1\n")
    expect(readFileSync(path.join(f.repo, "U2.txt"), "utf8")).toBe("U2\n")
    expect(readFileSync(path.join(f.repo, "U3.txt"), "utf8")).toBe("U3\n")
  })

  test("fold-in is host-owned, lock-serialized, restorable, and cleanup is explicit", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-fold", f)
    ctl(runs, "prepare", "--run-id", "run-fold", "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"))
    const workspace = path.join(runs, "run-fold", "units", "U", "workspace")
    writeFileSync(path.join(workspace, "new.txt"), "new\n")
    const job = fakeDoneJob(runs, "run-fold", "U", "packet")
    ctl(runs, "record-job", "--run-id", "run-fold", "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job)
    const t = ctl(runs, "terminalize", "--run-id", "run-fold", "--unit-id", "U").body.transport
    const lock = ctl(runs, "integration-acquire", "--run-id", "run-fold", "--unit-id", "U")
    expect(lock.word).toBe("ACQUIRED")
    const token = lock.body.lock_token
    expect(ctl(runs, "integration-acquire", "--run-id", "run-fold", "--unit-id", "U").word).toBe("REFUSED")
    const resumedLock = ctl(runs, "integration-acquire", "--run-id", "run-fold", "--unit-id", "U", "--resume")
    expect(resumedLock.word).toBe("ACQUIRED")
    expect(resumedLock.body).toMatchObject({ lock_token: token, resumed: true })
    expect(ctl(runs, "preflight", "--run-id", "run-fold", "--unit-id", "U", "--lock-token", token).word).toBe("PREFLIGHT_OK")
    git(f.repo, "cherry-pick", "--no-commit", t.commit)
    expect(existsSync(path.join(f.repo, "new.txt"))).toBe(true)
    expect(ctl(runs, "restore", "--run-id", "run-fold", "--unit-id", "U", "--lock-token", token).word).toBe("PRESERVED")
    expect(git(f.repo, "status", "--porcelain")).toBe("")
    expect(existsSync(path.join(f.repo, "new.txt"))).toBe(false)
    expect(ctlWithEnv(
      runs,
      { CE_WORK_TEST_FAULT: "integration-release-after-unlink" },
      "integration-release", "--run-id", "run-fold", "--unit-id", "U", "--lock-token", token,
    ).word).toBe("INTERRUPTED")
    expect(ctl(runs, "integration-release", "--run-id", "run-fold", "--unit-id", "U", "--lock-token", token).word).toBe("RELEASED")
    expect(ctl(runs, "cleanup", "--run-id", "run-fold", "--unit-id", "U", "--abandon", "--expect-transport", t.commit).word).toBe("CLEANED")
    expect(sh(f.repo, ["git", "rev-parse", "-q", "--verify", t.ref], false).status).not.toBe(0)
  })

  test("an interrupted old release does not unlink a newer run's live integration lock", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const prepare = (runId: string) => {
      init(runs, runId, f)
      ctl(
        runs, "prepare", "--run-id", runId, "--unit-id", "U",
        "--base", f.base, "--packet", packetFile(`${runId} packet`),
      )
      const job = fakeDoneJob(runs, runId, "U", `${runId} packet`, `${runId}-job`)
      ctl(
        runs, "record-job", "--run-id", runId, "--unit-id", "U",
        "--attempt-id", "attempt-1", "--job-id", job,
      )
      ctl(runs, "terminalize", "--run-id", runId, "--unit-id", "U")
    }
    prepare("run-old-release")
    prepare("run-new-owner")

    const oldLock = ctl(
      runs, "integration-acquire", "--run-id", "run-old-release", "--unit-id", "U",
    )
    expect(ctlWithEnv(
      runs,
      { CE_WORK_TEST_FAULT: "integration-release-after-unlink" },
      "integration-release", "--run-id", "run-old-release", "--unit-id", "U",
      "--lock-token", oldLock.body.lock_token,
    ).word).toBe("INTERRUPTED")
    expect(ctl(runs, "status", "--run-id", "run-old-release").body.integration_lock.phase).toBe("releasing")

    const newLock = ctl(
      runs, "integration-acquire", "--run-id", "run-new-owner", "--unit-id", "U",
    )
    expect(newLock.word).toBe("ACQUIRED")
    const resumedOld = ctl(runs, "resume", "--run-id", "run-old-release")
    expect(resumedOld.word).toBe("RESUMED")
    expect(resumedOld.body.actions).toContainEqual({
      unit_id: "U",
      action: "integration-release-reconciled",
    })
    expect(ctl(runs, "status", "--run-id", "run-old-release").body.integration_lock).toBeNull()

    const resumedNew = ctl(
      runs, "integration-acquire", "--run-id", "run-new-owner", "--unit-id", "U", "--resume",
    )
    expect(resumedNew.word).toBe("ACQUIRED")
    expect(resumedNew.body.lock_token).toBe(newLock.body.lock_token)
    expect(ctl(
      runs, "integration-release", "--run-id", "run-new-owner", "--unit-id", "U",
      "--lock-token", newLock.body.lock_token,
    ).word).toBe("RELEASED")
  })

  test("unit and plan-wide verification disclose ignored state instead of restoring it", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-ignored-verification"
    writeFileSync(
      path.join(f.repo, ".git", "info", "exclude"),
      "*.verification-cache\nlocal-cache/\nempty-cache/\nnode_modules/\n",
    )
    writeFileSync(path.join(f.repo, "existing.verification-cache"), "preserve me\n")
    const ignoredDirectory = path.join(f.repo, "local-cache")
    mkdirSync(ignoredDirectory)
    writeFileSync(path.join(ignoredDirectory, "a.txt"), "a\n")
    writeFileSync(path.join(ignoredDirectory, "b.txt"), "b\n")
    mkdirSync(path.join(f.repo, "empty-cache"))
    init(runs, runId, f)
    ctl(runs, "prepare", "--run-id", runId, "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"))
    const workspace = path.join(runs, runId, "units", "U", "workspace")
    writeFileSync(path.join(workspace, "integrated.txt"), "integrated\n")
    const job = fakeDoneJob(runs, runId, "U", "packet")
    ctl(runs, "record-job", "--run-id", runId, "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job)
    ctl(runs, "terminalize", "--run-id", runId, "--unit-id", "U")

    const integrated = ctl(
      runs, "integrate", "--run-id", runId, "--unit-id", "U",
      "--commit-message", "feat(test): integrate ignored verification fixture",
      "--", "python3", "-c",
      "from pathlib import Path; Path('existing.verification-cache').write_text('mutated'); p = Path('node_modules/.cache/x'); p.parent.mkdir(parents=True); p.write_text('created')",
    )
    expect(integrated.word).toBe("UNIT_COMMITTED")
    expect(integrated.body).not.toHaveProperty("cleaned")
    expect(integrated.body.cleaned_paths).toEqual([])
    const unitIgnoredState = {
      before: 3,
      after: 4,
      changed: 1,
      created: 1,
      removed: 0,
      uninspectable: 0,
      sample: { changed: ["existing.verification-cache"], created: ["node_modules/.cache/x"], removed: [] },
      sample_limit: 20,
      restored: false,
    }
    expect(integrated.body.ignored_state).toEqual(unitIgnoredState)
    expect(readFileSync(path.join(f.repo, "existing.verification-cache"), "utf8")).toBe("mutated")
    expect(readFileSync(path.join(f.repo, "node_modules", ".cache", "x"), "utf8")).toBe("created")
    expect(git(f.repo, "status", "--porcelain")).toBe("")
    expect(ctl(runs, "status", "--run-id", runId).body.units.U.integration.verification.ignored_state).toEqual(
      unitIgnoredState,
    )

    const verified = ctl(
      runs, "verify-run", "--run-id", runId,
      "--verification-summary", "ignored plan artifact removal",
      "--", "python3", "-c",
      "import shutil, os; shutil.rmtree('local-cache'); os.rmdir('empty-cache')",
    )
    expect(verified.word).toBe("RUN_VERIFIED")
    expect(verified.body.cleaned_paths).toEqual([])
    expect(verified.body.ignored_state).toMatchObject({
      before: 4,
      after: 2,
      changed: 0,
      created: 0,
      removed: 2,
      restored: false,
      sample: { changed: [], created: [], removed: ["local-cache/a.txt", "local-cache/b.txt"] },
    })
    expect(existsSync(ignoredDirectory)).toBe(false)
    expect(existsSync(path.join(f.repo, "empty-cache"))).toBe(false)
    expect(ctl(runs, "status", "--run-id", runId).body.verifications.at(-1)).toMatchObject({
      verification_exit: 0,
      canonical_state_changed: false,
      cleaned_paths: [],
      ignored_state: { removed: 2, sample: { removed: ["local-cache/a.txt", "local-cache/b.txt"] }, restored: false },
    })

    const failedPlan = ctl(
      runs, "verify-run", "--run-id", runId,
      "--verification-summary", "failed plan verification with ignored mutation",
      "--", "python3", "-c",
      "from pathlib import Path; Path('existing.verification-cache').write_text('mutated again'); Path('keep.txt').write_text('tracked mutation'); raise SystemExit(9)",
    )
    expect(failedPlan.word).toBe("BLOCKED")
    expect(failedPlan.body).toMatchObject({
      verification_exit: 9,
      cleaned_paths: ["keep.txt"],
      ignored_state: { changed: 1, created: 0, removed: 0, restored: false, sample: { changed: ["existing.verification-cache"] } },
    })
    expect(readFileSync(path.join(f.repo, "existing.verification-cache"), "utf8")).toBe("mutated again")
    expect(readFileSync(path.join(f.repo, "keep.txt"), "utf8")).toBe("keep\n")
    expect(git(f.repo, "status", "--porcelain")).toBe("")
    expect(ctl(runs, "status", "--run-id", runId).body.verifications.at(-1)).toMatchObject({
      verification_exit: 9,
      canonical_state_changed: true,
      cleaned_paths: ["keep.txt"],
      ignored_state: { changed: 1, sample: { changed: ["existing.verification-cache"] }, restored: false },
    })
  })

})

