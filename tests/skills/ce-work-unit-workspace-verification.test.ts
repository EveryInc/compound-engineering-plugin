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
  seedWarmCheckoutFixture,
} from "./helpers/ce-work-workspace-harness"

setDefaultTimeout(30_000)

registerWorkspaceCleanup()

describe("ce-work unit workspace controller: verification locks, waves, and checkpoints", () => {
  function ignoredModule(repo: string, body: string[]) {
    const source = [
      "import json, os, sys",
      `sys.path.insert(0, ${JSON.stringify(path.dirname(SCRIPT))})`,
      "import unit_workspace_ignored as ignored",
      "repo = sys.argv[1]",
      ...body,
    ].join("\n")
    const result = sh(repo, ["python3", "-c", source, repo])
    return JSON.parse(result.stdout)
  }

  test("init then prepare succeed on a warm checkout with a large ignored inventory", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-warm-checkout"
    seedWarmCheckoutFixture(f.repo, 513, 1, { nestedRepo: true })

    const ready = init(runs, runId, f)
    expect(ready.word).toBe("READY")
    expect(ready.body.blocking_counts).toBeUndefined()
    expect(existsSync(path.join(runs, runId))).toBe(true)

    const prepared = ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    )
    expect(prepared.word).toBe("PREPARED")
    expect(prepared.body.blocking_counts).toBeUndefined()
    expect(existsSync(path.join(runs, runId, "units", "U", "workspace"))).toBe(true)
  })

  test("inventory_ignored_state records symlinks, hardlinks, and nested repositories without refusing", () => {
    const f = makeRepo()
    seedWarmCheckoutFixture(f.repo, 600, 1, { nestedRepo: true })
    mkdirSync(path.join(f.repo, "node_modules", "empty-dir"))
    const out = ignoredModule(f.repo, [
      "inv = ignored.inventory_ignored_state(repo)",
      "print(json.dumps({'count': len(inv), 'paths': sorted(inv), 'nested': inv.get('nested/'), 'link': inv.get('node_modules/.bin/tool-a')}))",
    ])
    expect(out.count).toBe(604)
    expect(out.paths).toContain("nested/")
    expect(out.paths.some((p: string) => p.startsWith("nested/") && p !== "nested/")).toBe(false)
    expect(out.paths.some((p: string) => p.includes("empty-dir"))).toBe(false)
    expect(out.nested[0]).toBe("directory")
    expect(out.link[0]).toBe("symlink")
  })

  test("diff_ignored_state buckets overwrite, chmod, retarget, deletion, and creation", () => {
    const f = makeRepo()
    writeFileSync(path.join(f.repo, ".git", "info", "exclude"), "cache/\n")
    const cache = path.join(f.repo, "cache")
    mkdirSync(path.join(cache, "empty"), { recursive: true })
    writeFileSync(path.join(cache, "overwrite"), "aaaa")
    writeFileSync(path.join(cache, "chmod"), "m")
    writeFileSync(path.join(cache, "target-a"), "a")
    writeFileSync(path.join(cache, "target-b"), "b")
    symlinkSync("target-a", path.join(cache, "link"))
    writeFileSync(path.join(cache, "gone"), "g")
    writeFileSync(path.join(cache, "same"), "s")
    const out = ignoredModule(f.repo, [
      "before = ignored.inventory_ignored_state(repo)",
      "st = os.stat(os.path.join(repo, 'cache', 'overwrite'))",
      "open(os.path.join(repo, 'cache', 'overwrite'), 'w').write('bbbb')",
      "os.utime(os.path.join(repo, 'cache', 'overwrite'), ns=(st.st_atime_ns, st.st_mtime_ns))",
      "os.chmod(os.path.join(repo, 'cache', 'chmod'), 0o600)",
      "os.unlink(os.path.join(repo, 'cache', 'link')); os.symlink('target-b', os.path.join(repo, 'cache', 'link'))",
      "os.unlink(os.path.join(repo, 'cache', 'gone'))",
      "os.makedirs(os.path.join(repo, 'cache', 'deep', 'er'))",
      "open(os.path.join(repo, 'cache', 'deep', 'er', 'new'), 'w').write('n')",
      "after = ignored.inventory_ignored_state(repo)",
      "print(json.dumps({'nt': os.name == 'nt', 'diff': ignored.diff_ignored_state(before, after)}))",
    ])
    const diff = out.diff
    expect(diff.before).toBe(7)
    expect(diff.after).toBe(7)
    expect(diff.removed).toBe(1)
    expect(diff.created).toBe(1)
    expect(diff.uninspectable).toBe(0)
    expect(diff.sample.removed).toEqual(["cache/gone"])
    expect(diff.sample.created).toEqual(["cache/deep/er/new"])
    expect(diff.sample_limit).toBe(20)
    expect(diff.restored).toBe(false)
    const expectedChanged = out.nt
      ? ["cache/chmod", "cache/link"]
      : ["cache/chmod", "cache/link", "cache/overwrite"]
    expect(diff.sample.changed).toEqual(expectedChanged)
    expect(diff.changed).toBe(expectedChanged.length)
    expect(diff.sample.changed).not.toContain("cache/same")
    expect(JSON.stringify(diff)).not.toContain("cache/empty")
  })

  test("diff_ignored_state caps samples at the limit while counts stay exact", () => {
    const f = makeRepo()
    writeFileSync(path.join(f.repo, ".git", "info", "exclude"), "cache/\n")
    const cache = path.join(f.repo, "cache")
    mkdirSync(cache)
    for (let index = 0; index < 25; index += 1) {
      writeFileSync(path.join(cache, `${index.toString().padStart(3, "0")}`), "x")
    }
    const out = ignoredModule(f.repo, [
      "before = ignored.inventory_ignored_state(repo)",
      "import shutil; shutil.rmtree(os.path.join(repo, 'cache'))",
      "after = ignored.inventory_ignored_state(repo)",
      "print(json.dumps(ignored.diff_ignored_state(before, after)))",
    ])
    expect(out.before).toBe(25)
    expect(out.after).toBe(0)
    expect(out.removed).toBe(25)
    expect(out.sample.removed).toHaveLength(20)
    expect(out.sample.removed).toEqual([...out.sample.removed].sort())
    expect(out.sample.removed[0]).toBe("cache/000")
    expect(out.sample.removed[19]).toBe("cache/019")
  })

  test("inventory_ignored_state records unreadable entries as uninspectable instead of refusing", () => {
    if (process.getuid?.() === 0) return
    const f = makeRepo()
    writeFileSync(path.join(f.repo, ".git", "info", "exclude"), "cache/\n")
    const locked = path.join(f.repo, "cache", "locked")
    mkdirSync(locked, { recursive: true })
    writeFileSync(path.join(locked, "secret"), "s")
    writeFileSync(path.join(f.repo, "cache", "open"), "o")
    chmodSync(locked, 0o600)
    try {
      const out = ignoredModule(f.repo, [
        "before = ignored.inventory_ignored_state(repo)",
        "after = ignored.inventory_ignored_state(repo)",
        "diff = ignored.diff_ignored_state(before, after)",
        "print(json.dumps({'entry': before.get('cache/locked/secret'), 'diff': diff}))",
      ])
      expect(out.entry[0]).toBe("uninspectable")
      expect(out.diff.uninspectable).toBeGreaterThan(0)
      expect(out.diff.changed).toBe(0)
      expect(out.diff.removed).toBe(0)
    } finally {
      chmodSync(locked, 0o700)
    }
  })

  test("prepare passes through supported ignored regular files", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    writeFileSync(path.join(f.repo, ".git", "info", "exclude"), "supported.verification-cache\n")
    writeFileSync(path.join(f.repo, "supported.verification-cache"), "supported\n")
    init(runs, "run-ignored-capability-clear", f)

    expect(ctl(
      runs, "prepare", "--run-id", "run-ignored-capability-clear", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    ).word).toBe("PREPARED")
  })

  test("integrate on a warm checkout commits and reports zero ignored divergence", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-warm-integrate"
    seedWarmCheckoutFixture(f.repo, 600, 1, { nestedRepo: true })
    init(runs, runId, f)
    ctl(runs, "prepare", "--run-id", runId, "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"))
    const workspace = path.join(runs, runId, "units", "U", "workspace")
    writeFileSync(path.join(workspace, "integrated.txt"), "integrated\n")
    const job = fakeDoneJob(runs, runId, "U", "packet")
    ctl(runs, "record-job", "--run-id", runId, "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job)
    ctl(runs, "terminalize", "--run-id", runId, "--unit-id", "U")

    const integrated = ctl(
      runs, "integrate", "--run-id", runId, "--unit-id", "U",
      "--commit-message", "feat(test): integrate on a warm checkout",
      "--", "python3", "-c", "pass",
    )
    expect(integrated.word).toBe("UNIT_COMMITTED")
    expect(integrated.body).not.toHaveProperty("cleaned")
    expect(integrated.body.cleaned_paths).toEqual([])
    expect(integrated.body.ignored_state).toMatchObject({
      changed: 0,
      created: 0,
      removed: 0,
      uninspectable: 0,
      restored: false,
      sample: { changed: [], created: [], removed: [] },
    })
    expect(integrated.body.ignored_state.before).toBeGreaterThan(512)
    expect(integrated.body.ignored_state.after).toBe(integrated.body.ignored_state.before)
    expect(existsSync(path.join(f.repo, "node_modules", ".bin", "tool-a"))).toBe(true)
    expect(ctl(runs, "status", "--run-id", runId).body.units.U.integration.verification.ignored_state).toMatchObject({
      changed: 0,
      created: 0,
      removed: 0,
      restored: false,
    })
  })

  test("failed unit verification restores tracked state and discloses ignored state without restoring it", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-ignored-verification-failure"
    writeFileSync(path.join(f.repo, ".git", "info", "exclude"), "*.verification-cache\n")
    writeFileSync(path.join(f.repo, "existing.verification-cache"), "preserve me\n")
    init(runs, runId, f)
    ctl(runs, "prepare", "--run-id", runId, "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"))
    const workspace = path.join(runs, runId, "units", "U", "workspace")
    writeFileSync(path.join(workspace, "integrated.txt"), "integrated\n")
    const job = fakeDoneJob(runs, runId, "U", "packet")
    ctl(runs, "record-job", "--run-id", runId, "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job)
    ctl(runs, "terminalize", "--run-id", runId, "--unit-id", "U")

    const failed = ctl(
      runs, "integrate", "--run-id", runId, "--unit-id", "U",
      "--commit-message", "feat(test): integration must not commit",
      "--", "python3", "-c",
      "from pathlib import Path; Path('existing.verification-cache').write_text('mutated'); Path('failed.verification-cache').write_text('failed'); Path('scratch.txt').write_text('scratch'); Path('keep.txt').write_text('tracked mutation'); raise SystemExit(7)",
    )
    expect(failed.word).toBe("BLOCKED")
    expect(failed.body).toMatchObject({
      verification_exit: 7,
      canonical_state_changed: true,
      cleaned_paths: ["keep.txt", "scratch.txt"],
      ignored_state: {
        changed: 1,
        created: 1,
        removed: 0,
        restored: false,
        sample: { changed: ["existing.verification-cache"], created: ["failed.verification-cache"], removed: [] },
      },
    })
    expect(readFileSync(path.join(f.repo, "existing.verification-cache"), "utf8")).toBe("mutated")
    expect(readFileSync(path.join(f.repo, "failed.verification-cache"), "utf8")).toBe("failed")
    expect(existsSync(path.join(f.repo, "scratch.txt"))).toBe(false)
    expect(existsSync(path.join(f.repo, "integrated.txt"))).toBe(false)
    expect(readFileSync(path.join(f.repo, "keep.txt"), "utf8")).toBe("keep\n")
    expect(git(f.repo, "rev-parse", "HEAD")).toBe(f.base)
    expect(git(f.repo, "status", "--porcelain")).toBe("")
    expect(ctl(runs, "status", "--run-id", runId).body).toMatchObject({
      integration_lock: null,
      units: { U: { state: "preserved", integration: { restore: { exact: true } } } },
    })
  })

  test("failed unit verification that only moves ignored state reports unchanged canonical state", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-failed-verification-ignored-only"
    writeFileSync(path.join(f.repo, ".git", "info", "exclude"), "local-cache/\n")
    mkdirSync(path.join(f.repo, "local-cache"))
    writeFileSync(path.join(f.repo, "local-cache", "entry.txt"), "cached\n")
    init(runs, runId, f)
    ctl(runs, "prepare", "--run-id", runId, "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"))
    const workspace = path.join(runs, runId, "units", "U", "workspace")
    const transportOnly = path.join(workspace, "transport-only")
    mkdirSync(transportOnly)
    writeFileSync(path.join(transportOnly, "new.txt"), "transport output\n")
    const job = fakeDoneJob(runs, runId, "U", "packet")
    ctl(runs, "record-job", "--run-id", runId, "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job)
    expect(ctl(runs, "terminalize", "--run-id", runId, "--unit-id", "U").word).toBe("INTEGRATION_PENDING")

    const failed = ctl(
      runs, "integrate", "--run-id", runId, "--unit-id", "U",
      "--commit-message", "feat(test): integration must roll back",
      "--", "python3", "-c",
      "import shutil; shutil.rmtree('local-cache'); raise SystemExit(7)",
    )
    expect(failed.word).toBe("BLOCKED")
    expect(failed.body).toMatchObject({
      verification_exit: 7,
      canonical_state_changed: false,
      cleaned_paths: [],
      ignored_state: { changed: 0, created: 0, removed: 1, restored: false, sample: { removed: ["local-cache/entry.txt"] } },
    })
    expect(existsSync(path.join(f.repo, "transport-only"))).toBe(false)
    expect(existsSync(path.join(f.repo, "local-cache"))).toBe(false)
    expect(git(f.repo, "status", "--porcelain")).toBe("")
    expect(ctl(runs, "status", "--run-id", runId).body).toMatchObject({
      integration_lock: null,
      units: { U: { state: "preserved", integration: { restore: { exact: true } } } },
    })
  })

  test("resume releases an integration lock acquired before preflight intent", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-preflight-gap", f)
    ctl(
      runs, "prepare", "--run-id", "run-preflight-gap", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    )
    const workspace = path.join(runs, "run-preflight-gap", "units", "U", "workspace")
    writeFileSync(path.join(workspace, "new.txt"), "new\n")
    const job = fakeDoneJob(runs, "run-preflight-gap", "U", "packet")
    ctl(
      runs, "record-job", "--run-id", "run-preflight-gap", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )
    ctl(runs, "terminalize", "--run-id", "run-preflight-gap", "--unit-id", "U")
    expect(ctl(
      runs, "integration-acquire", "--run-id", "run-preflight-gap", "--unit-id", "U",
    ).word).toBe("ACQUIRED")

    const resumed = ctl(runs, "resume", "--run-id", "run-preflight-gap")
    expect(resumed.word).toBe("RESUMED")
    expect(resumed.body.actions).toContainEqual({
      unit_id: "U",
      action: "preflight-lock-released",
    })
    expect(ctl(runs, "status", "--run-id", "run-preflight-gap").body.integration_lock).toBeNull()
    expect(ctl(
      runs, "integration-acquire", "--run-id", "run-preflight-gap", "--unit-id", "U",
    ).word).toBe("ACQUIRED")
  })

  test("resume adopts and releases a same-run lock orphaned before manifest ownership", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-lock-orphan", f)
    ctl(
      runs, "prepare", "--run-id", "run-lock-orphan", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    )
    const workspace = path.join(runs, "run-lock-orphan", "units", "U", "workspace")
    writeFileSync(path.join(workspace, "new.txt"), "new\n")
    const job = fakeDoneJob(runs, "run-lock-orphan", "U", "packet")
    ctl(
      runs, "record-job", "--run-id", "run-lock-orphan", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )
    ctl(runs, "terminalize", "--run-id", "run-lock-orphan", "--unit-id", "U")
    const headBefore = git(f.repo, "rev-parse", "HEAD")
    const statusBefore = git(f.repo, "status", "--porcelain=v2")

    const interrupted = ctlWithEnv(
      runs,
      { CE_WORK_TEST_FAULT: "integration-lock-after-create" },
      "integrate", "--run-id", "run-lock-orphan", "--unit-id", "U",
      "--commit-message", "integrate U", "--", "true",
    )
    expect(interrupted.word).toBe("INTERRUPTED")
    expect(ctl(runs, "status", "--run-id", "run-lock-orphan").body.integration_lock).toBeNull()
    expect(git(f.repo, "rev-parse", "HEAD")).toBe(headBefore)
    expect(git(f.repo, "status", "--porcelain=v2")).toBe(statusBefore)

    const resumed = ctl(runs, "resume", "--run-id", "run-lock-orphan")
    expect(resumed.word).toBe("RESUMED")
    expect(resumed.body.actions).toContainEqual({ unit_id: "U", action: "integration-lock-adopted" })
    expect(resumed.body.actions).toContainEqual({ unit_id: "U", action: "preflight-lock-released" })
    expect(ctl(runs, "status", "--run-id", "run-lock-orphan").body.integration_lock).toBeNull()
    expect(git(f.repo, "rev-parse", "HEAD")).toBe(headBefore)
    expect(git(f.repo, "status", "--porcelain=v2")).toBe(statusBefore)

    expect(ctl(
      runs, "integration-acquire", "--run-id", "run-lock-orphan", "--unit-id", "U",
    ).word).toBe("ACQUIRED")
  })

  test("resume preserves an exact preflight snapshot and releases its integration lock", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-preflight-exact", f)
    ctl(
      runs, "prepare", "--run-id", "run-preflight-exact", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    )
    const workspace = path.join(runs, "run-preflight-exact", "units", "U", "workspace")
    writeFileSync(path.join(workspace, "new.txt"), "new\n")
    const job = fakeDoneJob(runs, "run-preflight-exact", "U", "packet")
    ctl(
      runs, "record-job", "--run-id", "run-preflight-exact", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )
    ctl(runs, "terminalize", "--run-id", "run-preflight-exact", "--unit-id", "U")
    writeFileSync(path.join(f.repo, ".git", "info", "exclude"), "new.txt\n")
    writeFileSync(path.join(f.repo, "new.txt"), "ignored canonical data\n")
    const token = ctl(
      runs, "integration-acquire", "--run-id", "run-preflight-exact", "--unit-id", "U",
    ).body.lock_token
    const preflight = ctl(
      runs, "preflight", "--run-id", "run-preflight-exact", "--unit-id", "U", "--lock-token", token,
    )
    expect(preflight.word).toBe("PREFLIGHT_OK")
    const headBefore = git(f.repo, "rev-parse", "HEAD")
    const statusBefore = git(f.repo, "status", "--porcelain=v2")

    const resumed = ctl(runs, "resume", "--run-id", "run-preflight-exact")

    expect(resumed.word).toBe("RESUMED")
    expect(resumed.body.actions).toContainEqual({
      unit_id: "U",
      action: "preflight-exact-state-recovered",
      canonical_preserved: true,
      integration_lock_released: true,
    })
    const recovered = ctl(runs, "status", "--run-id", "run-preflight-exact")
    expect(recovered.body.integration_lock).toBeNull()
    expect(recovered.body.units.U).toMatchObject({
      state: "preserved",
      integration: {
        restore: {
          exact: true,
          already_exact: true,
          snapshot: preflight.body.pre_fold,
        },
      },
    })
    expect(git(f.repo, "rev-parse", "HEAD")).toBe(headBefore)
    expect(git(f.repo, "status", "--porcelain=v2")).toBe(statusBefore)
    expect(readFileSync(path.join(f.repo, "new.txt"), "utf8")).toBe("ignored canonical data\n")

    const retryToken = ctl(
      runs, "integration-acquire", "--run-id", "run-preflight-exact", "--unit-id", "U",
    ).body.lock_token
    expect(ctl(
      runs, "preflight", "--run-id", "run-preflight-exact", "--unit-id", "U", "--lock-token", retryToken,
    ).word).toBe("PREFLIGHT_OK")
  })

  test("resume completes an interrupted restore, releases its lock, and reconciles its blocker", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-restore-resume", f)
    ctl(
      runs, "prepare", "--run-id", "run-restore-resume", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    )
    const workspace = path.join(runs, "run-restore-resume", "units", "U", "workspace")
    writeFileSync(path.join(workspace, "new.txt"), "new\n")
    const job = fakeDoneJob(runs, "run-restore-resume", "U", "packet")
    ctl(
      runs, "record-job", "--run-id", "run-restore-resume", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )
    const transport = ctl(
      runs, "terminalize", "--run-id", "run-restore-resume", "--unit-id", "U",
    ).body.transport

    const interrupted = ctlWithEnv(
      runs,
      { CE_WORK_TEST_FAULT: "before-canonical-commit,restore-after-reset" },
      "integrate", "--run-id", "run-restore-resume", "--unit-id", "U",
      "--commit-message", "integrate U", "--", "true",
    )
    expect(interrupted.word).toBe("BLOCKED")
    expect(interrupted.body).toMatchObject({
      reason: "integration failed and exact restoration could not be proven",
      retain_integration_lock: true,
    })
    const beforeResume = ctl(runs, "status", "--run-id", "run-restore-resume").body
    expect(beforeResume.units.U.state).toBe("restoring")
    expect(beforeResume.integration_lock).toMatchObject({ unit_id: "U", phase: "held" })
    expect(beforeResume.blockers).toHaveLength(1)

    const manifestPath = path.join(runs, "run-restore-resume", "manifest.json")
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    manifest.blockers.push({
      at: "2026-07-16T00:00:00Z",
      unit_id: "U",
      reason: "unrelated retained recovery blocker",
      retain_integration_lock: true,
    })
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
    chmodSync(manifestPath, 0o600)

    const resumed = ctl(runs, "resume", "--run-id", "run-restore-resume")
    expect(resumed.word).toBe("RESUMED")
    expect(resumed.body.actions).toContainEqual({
      unit_id: "U",
      action: "restored",
      canonical_preserved: true,
      integration_lock_released: true,
    })
    const recovered = ctl(runs, "status", "--run-id", "run-restore-resume").body
    expect(recovered.units.U.state).toBe("preserved")
    expect(recovered.units.U.integration.restore).toMatchObject({ exact: true })
    expect(recovered.integration_lock).toBeNull()
    const applicable = recovered.blockers.find(
      (blocker: any) => blocker.reason === "integration failed and exact restoration could not be proven",
    )
    const unrelated = recovered.blockers.find(
      (blocker: any) => blocker.reason === "unrelated retained recovery blocker",
    )
    expect(applicable).toMatchObject({ resolved_by: "resume" })
    expect(applicable.resolved_at).toBeTruthy()
    expect(unrelated.resolved_at).toBeUndefined()
    expect(git(f.repo, "rev-parse", "HEAD")).toBe(f.base)
    expect(git(f.repo, "status", "--porcelain")).toBe("")

    const fallback = ctl(
      runs, "claim-fallback", "--run-id", "run-restore-resume", "--unit-id", "U",
      "--caller-mode", "headless",
    )
    expect(fallback.word).toBe("FALLBACK_AUTHORIZED")
    expect(fallback.body.reason).toBe("canonical-attempt-preserved")
    expect(ctl(
      runs, "cleanup", "--run-id", "run-restore-resume", "--unit-id", "U",
      "--abandon", "--expect-transport", transport.commit,
    ).word).toBe("CLEANED")
  })

  test("resume releases a lock stranded after exact restoration was recorded", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-preserved-lock", f)
    ctl(
      runs, "prepare", "--run-id", "run-preserved-lock", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    )
    const workspace = path.join(runs, "run-preserved-lock", "units", "U", "workspace")
    writeFileSync(path.join(workspace, "new.txt"), "new\n")
    const job = fakeDoneJob(runs, "run-preserved-lock", "U", "packet")
    ctl(
      runs, "record-job", "--run-id", "run-preserved-lock", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )
    const transport = ctl(
      runs, "terminalize", "--run-id", "run-preserved-lock", "--unit-id", "U",
    ).body.transport
    const token = ctl(
      runs, "integration-acquire", "--run-id", "run-preserved-lock", "--unit-id", "U",
    ).body.lock_token
    const preflight = ctl(
      runs, "preflight", "--run-id", "run-preserved-lock", "--unit-id", "U", "--lock-token", token,
    ).body.pre_fold
    git(f.repo, "cherry-pick", "--no-commit", transport.commit)
    ctl(runs, "mark-applied", "--run-id", "run-preserved-lock", "--unit-id", "U", "--lock-token", token)
    expect(ctl(
      runs, "restore", "--run-id", "run-preserved-lock", "--unit-id", "U", "--lock-token", token,
    ).word).toBe("PRESERVED")
    const stranded = ctl(runs, "status", "--run-id", "run-preserved-lock").body
    expect(stranded.units.U).toMatchObject({
      state: "preserved",
      integration: { restore: { exact: true, snapshot: preflight } },
    })
    expect(stranded.integration_lock).toMatchObject({ unit_id: "U", nonce: token, phase: "held" })

    const resumed = ctl(runs, "resume", "--run-id", "run-preserved-lock")
    expect(resumed.word).toBe("RESUMED")
    expect(resumed.body.actions).toContainEqual({
      unit_id: "U",
      action: "integration-release-reconciled",
    })
    expect(ctl(runs, "status", "--run-id", "run-preserved-lock").body.integration_lock).toBeNull()
    expect(git(f.repo, "status", "--porcelain")).toBe("")
  })

  test("refuses a wave whose terminalized transports overlap", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-wave-collision", f)
    const transports: any[] = []
    for (const [position, unitId] of ["U-a", "U-b"].entries()) {
      ctl(
        runs, "prepare", "--run-id", "run-wave-collision", "--unit-id", unitId,
        "--base", f.base, "--packet", packetFile(`packet-${unitId}`),
        "--wave-id", "wave-1", "--wave-position", String(position),
      )
      const workspace = path.join(runs, "run-wave-collision", "units", unitId, "workspace")
      writeFileSync(path.join(workspace, "keep.txt"), `${unitId}\n`)
    }
    const terminalizeUnit = (unitId: string) => {
      const job = fakeDoneJob(runs, "run-wave-collision", unitId, `packet-${unitId}`, `job-${unitId}`)
      ctl(
        runs, "record-job", "--run-id", "run-wave-collision", "--unit-id", unitId,
        "--attempt-id", "attempt-1", "--job-id", job,
      )
      return ctl(runs, "terminalize", "--run-id", "run-wave-collision", "--unit-id", unitId).body.transport
    }

    transports.push(terminalizeUnit("U-a"))
    const token = ctl(runs, "integration-acquire", "--run-id", "run-wave-collision", "--unit-id", "U-a").body.lock_token
    const unterminated = ctl(
      runs, "preflight", "--run-id", "run-wave-collision", "--unit-id", "U-a", "--lock-token", token,
    )
    expect(unterminated.word).toBe("BLOCKED")
    expect(unterminated.body.reason).toBe("wave not fully terminalized")

    transports.push(terminalizeUnit("U-b"))
    const blocked = ctl(
      runs, "preflight", "--run-id", "run-wave-collision", "--unit-id", "U-a", "--lock-token", token,
    )
    expect(blocked.word).toBe("BLOCKED")
    expect(blocked.body.reason).toContain("changed-path collision")
    expect(ctl(
      runs, "cleanup", "--run-id", "run-wave-collision", "--unit-id", "U-a",
      "--abandon", "--expect-transport", transports[0].commit,
    ).word).toBe("CLEANED")
    expect(ctl(
      runs, "integration-release", "--run-id", "run-wave-collision", "--unit-id", "U-a", "--lock-token", token,
    ).word).toBe("RELEASED")
    expect(ctl(
      runs, "cleanup", "--run-id", "run-wave-collision", "--unit-id", "U-b",
      "--abandon", "--expect-transport", transports[1].commit,
    ).word).toBe("CLEANED")
  })

  test("advances a non-overlapping external sibling after native wave completion", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-wave-native-external"
    init(runs, runId, f)

    for (const [position, unitId] of ["U-native", "U-external"].entries()) {
      ctl(
        runs, "prepare", "--run-id", runId, "--unit-id", unitId,
        "--base", f.base, "--packet", packetFile(`packet-${unitId}`),
        "--wave-id", "wave-1", "--wave-position", String(position),
      )
    }

    const externalWorkspace = path.join(runs, runId, "units", "U-external", "workspace")
    writeFileSync(path.join(externalWorkspace, "external.txt"), "external\n")
    const externalJob = fakeDoneJob(runs, runId, "U-external", "packet-U-external", "job-external")
    ctl(
      runs, "record-job", "--run-id", runId, "--unit-id", "U-external",
      "--attempt-id", "attempt-1", "--job-id", externalJob,
    )
    const externalTransport = ctl(
      runs, "terminalize", "--run-id", runId, "--unit-id", "U-external",
    ).body.transport

    const nativeJob = fakeRunningJob(runs, runId, "U-native", "packet-U-native", "job-native")
    ctl(
      runs, "record-job", "--run-id", runId, "--unit-id", "U-native",
      "--attempt-id", "attempt-1", "--job-id", nativeJob,
    )
    terminalizeFakeJob(runs, runId, nativeJob, "failed")
    expect(ctl(
      runs, "claim-fallback", "--run-id", runId, "--unit-id", "U-native", "--caller-mode", "headless",
    ).word).toBe("FALLBACK_AUTHORIZED")
    writeFileSync(path.join(f.repo, "native.txt"), "native\n")
    git(f.repo, "add", "native.txt")
    git(f.repo, "commit", "-m", "native wave member")
    const nativeHead = git(f.repo, "rev-parse", "HEAD")
    const completed = ctl(
      runs, "complete-fallback", "--run-id", runId, "--unit-id", "U-native",
      "--accepted-head", nativeHead, "--evidence-digest", "a".repeat(64),
      "--summary", "native checks passed",
    )
    expect(completed).toMatchObject({
      word: "FALLBACK_COMPLETED",
      body: {
        eligible_siblings: ["U-external"],
        completion: { changed_paths: ["native.txt"] },
      },
    })
    expect(ctl(runs, "status", "--run-id", runId).body.units).toMatchObject({
      "U-native": { state: "native-completed" },
      "U-external": { wave: { allowed_heads: [f.base, nativeHead] } },
    })

    const manifestPath = path.join(runs, runId, "manifest.json")
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    manifest.units["U-native"].attempts[0].fallback.completed.changed_paths = [1]
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`)
    expect(ctl(
      runs, "integration-acquire", "--run-id", runId, "--unit-id", "U-external",
    )).toMatchObject({
      word: "BLOCKED",
      body: { reason: "earlier wave unit not resolved", units: ["U-native"] },
    })
    manifest.units["U-native"].attempts[0].fallback.completed.changed_paths = ["native.txt"]
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`)

    const token = ctl(
      runs, "integration-acquire", "--run-id", runId, "--unit-id", "U-external",
    ).body.lock_token
    expect(ctl(
      runs, "preflight", "--run-id", runId, "--unit-id", "U-external", "--lock-token", token,
    ).word).toBe("PREFLIGHT_OK")
    git(f.repo, "cherry-pick", "--no-commit", externalTransport.commit)
    expect(ctl(
      runs, "mark-applied", "--run-id", runId, "--unit-id", "U-external", "--lock-token", token,
    ).word).toBe("APPLIED")
    expect(ctl(
      runs, "mark-verified", "--run-id", runId, "--unit-id", "U-external", "--lock-token", token,
      "--evidence-digest", "external-green",
    ).word).toBe("VERIFIED")
    git(f.repo, "commit", "-m", "integrate external wave member")
    expect(ctl(
      runs, "mark-committed", "--run-id", runId, "--unit-id", "U-external", "--lock-token", token,
    ).word).toBe("COMMITTED")
    expect(readFileSync(path.join(f.repo, "native.txt"), "utf8")).toBe("native\n")
    expect(readFileSync(path.join(f.repo, "external.txt"), "utf8")).toBe("external\n")
  })

  test("rejects a native wave completion that collides with an external sibling", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-wave-native-collision"
    init(runs, runId, f)
    for (const [position, unitId] of ["U-native", "U-external"].entries()) {
      ctl(
        runs, "prepare", "--run-id", runId, "--unit-id", unitId,
        "--base", f.base, "--packet", packetFile(`packet-${unitId}`),
        "--wave-id", "wave-1", "--wave-position", String(position),
      )
    }

    const externalWorkspace = path.join(runs, runId, "units", "U-external", "workspace")
    writeFileSync(path.join(externalWorkspace, "keep.txt"), "external collision\n")
    const externalJob = fakeDoneJob(runs, runId, "U-external", "packet-U-external", "job-external")
    ctl(
      runs, "record-job", "--run-id", runId, "--unit-id", "U-external",
      "--attempt-id", "attempt-1", "--job-id", externalJob,
    )
    ctl(runs, "terminalize", "--run-id", runId, "--unit-id", "U-external")

    const nativeJob = fakeRunningJob(runs, runId, "U-native", "packet-U-native", "job-native")
    ctl(
      runs, "record-job", "--run-id", runId, "--unit-id", "U-native",
      "--attempt-id", "attempt-1", "--job-id", nativeJob,
    )
    terminalizeFakeJob(runs, runId, nativeJob, "failed")
    ctl(runs, "claim-fallback", "--run-id", runId, "--unit-id", "U-native", "--caller-mode", "headless")
    writeFileSync(path.join(f.repo, "keep.txt"), "native collision\n")
    git(f.repo, "add", "keep.txt")
    git(f.repo, "commit", "-m", "colliding native wave member")
    const nativeHead = git(f.repo, "rev-parse", "HEAD")

    const blocked = ctl(
      runs, "complete-fallback", "--run-id", runId, "--unit-id", "U-native",
      "--accepted-head", nativeHead, "--evidence-digest", "b".repeat(64),
      "--summary", "native checks passed",
    )
    expect(blocked).toMatchObject({
      word: "BLOCKED",
      body: {
        reason: "changed-path collision",
        collisions: { "U-native:U-external": ["keep.txt"] },
      },
    })
    expect(ctl(runs, "status", "--run-id", runId).body.units).toMatchObject({
      "U-native": { state: "authoring" },
      "U-external": { wave: { allowed_heads: [f.base] } },
    })
  })

  test("restores a failed wave unit exactly before an unaffected sibling integrates", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-wave-restore", f)
    const transports: Record<string, any> = {}
    for (const [position, unitId] of ["U-a", "U-b"].entries()) {
      ctl(
        runs, "prepare", "--run-id", "run-wave-restore", "--unit-id", unitId,
        "--base", f.base, "--packet", packetFile(`packet-${unitId}`),
        "--wave-id", "wave-1", "--wave-position", String(position),
      )
      const workspace = path.join(runs, "run-wave-restore", "units", unitId, "workspace")
      writeFileSync(path.join(workspace, `${unitId}.txt`), `${unitId}\n`)
      const job = fakeDoneJob(runs, "run-wave-restore", unitId, `packet-${unitId}`, `job-${unitId}`)
      ctl(
        runs, "record-job", "--run-id", "run-wave-restore", "--unit-id", unitId,
        "--attempt-id", "attempt-1", "--job-id", job,
      )
      transports[unitId] = ctl(runs, "terminalize", "--run-id", "run-wave-restore", "--unit-id", unitId).body.transport
    }

    const failedToken = ctl(runs, "integration-acquire", "--run-id", "run-wave-restore", "--unit-id", "U-a").body.lock_token
    expect(ctl(
      runs, "preflight", "--run-id", "run-wave-restore", "--unit-id", "U-a", "--lock-token", failedToken,
    ).word).toBe("PREFLIGHT_OK")
    git(f.repo, "cherry-pick", "--no-commit", transports["U-a"].commit)
    expect(ctl(
      runs, "mark-applied", "--run-id", "run-wave-restore", "--unit-id", "U-a", "--lock-token", failedToken,
    ).word).toBe("APPLIED")
    // Canonical verification is treated as failed: restore before any sibling.
    expect(ctl(
      runs, "restore", "--run-id", "run-wave-restore", "--unit-id", "U-a", "--lock-token", failedToken,
    ).word).toBe("PRESERVED")
    expect(git(f.repo, "rev-parse", "HEAD")).toBe(f.base)
    expect(git(f.repo, "status", "--porcelain")).toBe("")
    expect(ctl(
      runs, "integration-release", "--run-id", "run-wave-restore", "--unit-id", "U-a", "--lock-token", failedToken,
    ).word).toBe("RELEASED")

    const siblingToken = ctl(runs, "integration-acquire", "--run-id", "run-wave-restore", "--unit-id", "U-b").body.lock_token
    expect(ctl(
      runs, "preflight", "--run-id", "run-wave-restore", "--unit-id", "U-b", "--lock-token", siblingToken,
    ).word).toBe("PREFLIGHT_OK")
    git(f.repo, "cherry-pick", "--no-commit", transports["U-b"].commit)
    ctl(runs, "mark-applied", "--run-id", "run-wave-restore", "--unit-id", "U-b", "--lock-token", siblingToken)
    ctl(
      runs, "mark-verified", "--run-id", "run-wave-restore", "--unit-id", "U-b", "--lock-token", siblingToken,
      "--evidence-digest", "sibling-green",
    )
    git(f.repo, "commit", "-m", "feat(test): integrate unaffected sibling")
    expect(ctl(
      runs, "mark-committed", "--run-id", "run-wave-restore", "--unit-id", "U-b", "--lock-token", siblingToken,
    ).word).toBe("COMMITTED")
    expect(existsSync(path.join(f.repo, "U-a.txt"))).toBe(false)
    expect(readFileSync(path.join(f.repo, "U-b.txt"), "utf8")).toBe("U-b\n")
    expect(ctl(runs, "cleanup", "--run-id", "run-wave-restore", "--unit-id", "U-b").word).toBe("CLEANED")
    expect(ctl(
      runs, "integration-release", "--run-id", "run-wave-restore", "--unit-id", "U-b", "--lock-token", siblingToken,
    ).word).toBe("RELEASED")
    expect(ctl(
      runs, "cleanup", "--run-id", "run-wave-restore", "--unit-id", "U-a",
      "--abandon", "--expect-transport", transports["U-a"].commit,
    ).word).toBe("CLEANED")
  })

  test("records the only dirty selected plan as a narrow checkpoint", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    writeFileSync(f.plan, "# Plan\n\nchanged\n")
    const digest = createHash("sha256").update(readFileSync(f.plan)).digest("hex")
    f.digest = digest
    expect(init(runs, "run-plan", f).word).toBe("READY")
    const hooks = path.join(path.resolve(f.repo, git(f.repo, "rev-parse", "--git-dir")), "hooks")
    mkdirSync(hooks, { recursive: true })
    writeFileSync(
      path.join(hooks, "pre-commit"),
      "#!/bin/sh\nprintf 'hook mutation\\n' > hook-generated.txt\ngit add hook-generated.txt\n",
      { mode: 0o755 },
    )
    const cp = ctl(runs, "checkpoint-plan", "--run-id", "run-plan")
    expect(cp.word).toBe("CHECKPOINTED")
    expect(git(f.repo, "status", "--porcelain")).toBe("")
    expect(git(f.repo, "diff-tree", "--no-commit-id", "--name-only", "-r", cp.body.checkpoint.commit)).toBe("docs/plans/plan.md")

    writeFileSync(f.plan, "again\n")
    writeFileSync(path.join(f.repo, "other.txt"), "other\n")
    const blocked = ctl(runs, "checkpoint-plan", "--run-id", "run-plan")
    expect(blocked.word).toBe("BLOCKED")
    expect(git(f.repo, "rev-parse", "HEAD")).toBe(cp.body.checkpoint.commit)
  })

  test("reconciles a plan checkpoint whose manifest receipt was interrupted exactly once", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    writeFileSync(f.plan, "# Plan\n\nchanged\n")
    f.digest = createHash("sha256").update(readFileSync(f.plan)).digest("hex")
    expect(init(runs, "run-plan-receipt", f).word).toBe("READY")

    const interrupted = ctlWithEnv(
      runs,
      { CE_WORK_TEST_FAULT: "checkpoint-plan-after-commit" },
      "checkpoint-plan", "--run-id", "run-plan-receipt",
    )
    expect(interrupted.word).toBe("INTERRUPTED")
    const checkpointCommit = git(f.repo, "rev-parse", "HEAD")
    expect(checkpointCommit).not.toBe(f.base)
    expect(git(f.repo, "status", "--porcelain")).toBe("")

    const manifestPath = path.join(runs, "run-plan-receipt", "manifest.json")
    const before = JSON.parse(readFileSync(manifestPath, "utf8"))
    expect(before.plan.checkpoint).toBeNull()
    expect(before.events.filter((row: any) => row.kind === "plan-checkpoint")).toHaveLength(0)

    const recovered = ctl(runs, "checkpoint-plan", "--run-id", "run-plan-receipt")
    expect(recovered.word).toBe("CHECKPOINTED")
    expect(recovered.body.checkpoint).toMatchObject({
      prior_head: f.base,
      commit: checkpointCommit,
      path: "docs/plans/plan.md",
      digest: f.digest,
    })
    const again = ctl(runs, "checkpoint-plan", "--run-id", "run-plan-receipt")
    expect(again.word).toBe("NOOP")
    expect(again.body.checkpoint).toEqual(recovered.body.checkpoint)
    const after = JSON.parse(readFileSync(manifestPath, "utf8"))
    expect(after.plan.checkpoint).toEqual(recovered.body.checkpoint)
    expect(after.events.filter((row: any) => row.kind === "plan-checkpoint")).toHaveLength(1)
  })

  test("blocks unrelated clean HEAD movement instead of adopting it as a plan checkpoint", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    expect(init(runs, "run-plan-unrelated-head", f).word).toBe("READY")
    writeFileSync(path.join(f.repo, "unrelated.txt"), "manual change\n")
    git(f.repo, "add", "unrelated.txt")
    git(f.repo, "commit", "-m", "docs: unrelated manual commit")

    const blocked = ctl(runs, "checkpoint-plan", "--run-id", "run-plan-unrelated-head")
    expect(blocked.word).toBe("BLOCKED")
    expect(blocked.body).toMatchObject({ expected_prior_head: f.base, head: git(f.repo, "rev-parse", "HEAD") })
    const manifest = JSON.parse(readFileSync(path.join(runs, "run-plan-unrelated-head", "manifest.json"), "utf8"))
    expect(manifest.plan.checkpoint).toBeNull()
    expect(manifest.events.filter((row: any) => row.kind === "plan-checkpoint")).toHaveLength(0)
  })

  test("recovers worktree and transport crash windows without duplicate dispatch", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-crash", f)
    const interrupted = ctlWithEnv(
      runs,
      { CE_WORK_TEST_FAULT: "after-worktree-add" },
      "prepare", "--run-id", "run-crash", "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"),
    )
    expect(interrupted.word).toBe("INTERRUPTED")
    const adopted = ctl(runs, "prepare", "--run-id", "run-crash", "--unit-id", "U", "--base", f.base, "--packet", packetFile("packet"))
    expect(adopted.word).toBe("PREPARED")
    const workspace = adopted.body.workspace
    writeFileSync(path.join(workspace, "crash.txt"), "survives\n")
    fakeDoneJob(runs, "run-crash", "U", "packet")
    const refInterrupted = ctlWithEnv(
      runs,
      { CE_WORK_TEST_FAULT: "after-transport-ref" },
      "resume", "--run-id", "run-crash",
    )
    expect(refInterrupted.word).toBe("INTERRUPTED")
    const done = ctl(runs, "resume", "--run-id", "run-crash")
    expect(done.word).toBe("RESUMED")
    expect(done.body.redispatched).toBe(false)
    expect(done.body.actions.filter((a: any) => a.action === "terminalized")).toHaveLength(1)
    const status = ctl(runs, "status", "--run-id", "run-crash", "--unit-id", "U")
    const commit = status.body.unit.transport.commit
    expect(git(f.repo, "rev-list", "--parents", "-n", "1", commit).split(" ")).toEqual([commit, f.base])
    const again = ctl(runs, "resume", "--run-id", "run-crash")
    expect(again.body.actions).toEqual([])
    expect(ctlWithEnv(runs, { CE_WORK_TEST_FAULT: "cleanup-after-worktree-remove" }, "cleanup", "--run-id", "run-crash", "--unit-id", "U", "--abandon", "--expect-transport", commit).word).toBe("INTERRUPTED")
    expect(existsSync(workspace)).toBe(false)
    mkdirSync(workspace)
    writeFileSync(path.join(workspace, "retained-after-unregister.txt"), "must be removed\n")
    expect(ctl(runs, "cleanup", "--run-id", "run-crash", "--unit-id", "U", "--abandon", "--expect-transport", commit).word).toBe("CLEANED")
    expect(existsSync(workspace)).toBe(false)
  })

  test("discovers a successful run whose plan verification lock was not released", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-verify-release-crash", f)
    const prepared = ctl(
      runs, "prepare", "--run-id", "run-verify-release-crash", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    )
    writeFileSync(path.join(prepared.body.workspace, "verified.txt"), "verified\n")
    const job = fakeDoneJob(runs, "run-verify-release-crash", "U", "packet")
    ctl(
      runs, "record-job", "--run-id", "run-verify-release-crash", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )
    ctl(runs, "terminalize", "--run-id", "run-verify-release-crash", "--unit-id", "U")
    expect(ctl(
      runs, "integrate", "--run-id", "run-verify-release-crash", "--unit-id", "U",
      "--commit-message", "feat(test): integrate verification crash fixture", "--", "true",
    ).word).toBe("UNIT_COMMITTED")

    const interrupted = ctlWithEnv(
      runs,
      { CE_WORK_TEST_FAULT: "verify-run-after-receipt" },
      "verify-run", "--run-id", "run-verify-release-crash",
      "--verification-summary", "successful plan verification", "--", "true",
    )
    expect(interrupted.word).toBe("INTERRUPTED")
    const stranded = ctl(runs, "status", "--run-id", "run-verify-release-crash").body
    expect(stranded.units.U.state).toBe("cleaned")
    expect(stranded.verifications.at(-1).verification_exit).toBe(0)
    expect(stranded.integration_lock).toMatchObject({ unit_id: "U", phase: "held" })

    const resumed = ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest)
    expect(resumed.word).toBe("RESUMED")
    expect(resumed.body).toMatchObject({ run_id: "run-verify-release-crash" })
    expect(resumed.body.actions).toContainEqual({
      unit_id: "U",
      action: "integration-release-reconciled",
    })
    expect(ctl(runs, "status", "--run-id", "run-verify-release-crash").body.integration_lock).toBeNull()
    expect(ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest).word).toBe("NOT_FOUND")
  })

  test("releases a receipted plan verification lock held by native fallback completion", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-native-verify-release-crash", f)
    ctl(
      runs, "prepare", "--run-id", "run-native-verify-release-crash", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("native verification packet"),
    )
    const job = fakeRunningJob(
      runs, "run-native-verify-release-crash", "U", "native verification packet",
    )
    ctl(
      runs, "record-job", "--run-id", "run-native-verify-release-crash", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )
    terminalizeFakeJob(runs, "run-native-verify-release-crash", job, "failed")
    ctl(runs, "resume", "--run-id", "run-native-verify-release-crash")
    expect(ctl(
      runs, "claim-fallback", "--run-id", "run-native-verify-release-crash", "--unit-id", "U",
      "--caller-mode", "headless",
    ).word).toBe("FALLBACK_AUTHORIZED")

    writeFileSync(path.join(f.repo, "native.txt"), "accepted native implementation\n")
    git(f.repo, "add", "native.txt")
    git(f.repo, "commit", "-m", "feat(test): complete native fallback")
    const nativeHead = git(f.repo, "rev-parse", "HEAD")
    expect(ctl(
      runs, "complete-fallback", "--run-id", "run-native-verify-release-crash", "--unit-id", "U",
      "--accepted-head", nativeHead, "--evidence-digest", "a".repeat(64),
      "--summary", "native checks passed",
    ).word).toBe("FALLBACK_COMPLETED")

    const interrupted = ctlWithEnv(
      runs,
      { CE_WORK_TEST_FAULT: "verify-run-after-receipt" },
      "verify-run", "--run-id", "run-native-verify-release-crash",
      "--verification-summary", "successful native plan verification", "--", "true",
    )
    expect(interrupted.word).toBe("INTERRUPTED")
    const stranded = ctl(runs, "status", "--run-id", "run-native-verify-release-crash").body
    expect(stranded.units.U.state).toBe("native-completed")
    expect(stranded.verifications.at(-1).verification_exit).toBe(0)
    expect(stranded.integration_lock).toMatchObject({ unit_id: "U", phase: "held" })

    const resumed = ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest)
    expect(resumed.word).toBe("RESUMED")
    expect(resumed.body).toMatchObject({ run_id: "run-native-verify-release-crash" })
    expect(resumed.body.actions).toContainEqual({
      unit_id: "U",
      action: "integration-release-reconciled",
    })
    expect(ctl(
      runs, "status", "--run-id", "run-native-verify-release-crash",
    ).body.integration_lock).toBeNull()
    expect(ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest).word).toBe("NOT_FOUND")
  })

  test("releases a failed plan verification lock held by native fallback completion", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-native-failed-verify-release-crash", f)
    ctl(
      runs, "prepare", "--run-id", "run-native-failed-verify-release-crash", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("native failed verification packet"),
    )
    const job = fakeRunningJob(
      runs, "run-native-failed-verify-release-crash", "U", "native failed verification packet",
    )
    ctl(
      runs, "record-job", "--run-id", "run-native-failed-verify-release-crash", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )
    terminalizeFakeJob(runs, "run-native-failed-verify-release-crash", job, "failed")
    ctl(runs, "resume", "--run-id", "run-native-failed-verify-release-crash")
    expect(ctl(
      runs, "claim-fallback", "--run-id", "run-native-failed-verify-release-crash", "--unit-id", "U",
      "--caller-mode", "headless",
    ).word).toBe("FALLBACK_AUTHORIZED")

    writeFileSync(path.join(f.repo, "native.txt"), "accepted native implementation\n")
    git(f.repo, "add", "native.txt")
    git(f.repo, "commit", "-m", "feat(test): complete native fallback")
    const nativeHead = git(f.repo, "rev-parse", "HEAD")
    expect(ctl(
      runs, "complete-fallback", "--run-id", "run-native-failed-verify-release-crash", "--unit-id", "U",
      "--accepted-head", nativeHead, "--evidence-digest", "a".repeat(64),
      "--summary", "native checks passed",
    ).word).toBe("FALLBACK_COMPLETED")

    const interrupted = ctlWithEnv(
      runs,
      { CE_WORK_TEST_FAULT: "verify-run-after-receipt" },
      "verify-run", "--run-id", "run-native-failed-verify-release-crash",
      "--verification-summary", "failed native plan verification", "--", "false",
    )
    expect(interrupted.word).toBe("INTERRUPTED")
    const stranded = ctl(runs, "status", "--run-id", "run-native-failed-verify-release-crash").body
    expect(stranded.units.U.state).toBe("native-completed")
    expect(stranded.verifications.at(-1).verification_exit).not.toBe(0)
    expect(stranded.blockers.at(-1)).toMatchObject({ reason: "plan-wide verification failed" })
    expect(stranded.blockers.at(-1).retain_integration_lock).toBeUndefined()
    expect(stranded.integration_lock).toMatchObject({ unit_id: "U", phase: "held" })

    const resumed = ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest)
    expect(resumed.word).toBe("RESUMED")
    expect(resumed.body.actions).toContainEqual({
      unit_id: "U",
      action: "integration-release-reconciled",
    })
    expect(ctl(
      runs, "status", "--run-id", "run-native-failed-verify-release-crash",
    ).body.integration_lock).toBeNull()
  })

  test("retains a plan verification lock interrupted before its receipt", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-verify-pre-receipt-crash", f)
    const prepared = ctl(
      runs, "prepare", "--run-id", "run-verify-pre-receipt-crash", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    )
    writeFileSync(path.join(prepared.body.workspace, "verified.txt"), "verified\n")
    const job = fakeDoneJob(runs, "run-verify-pre-receipt-crash", "U", "packet")
    ctl(
      runs, "record-job", "--run-id", "run-verify-pre-receipt-crash", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )
    ctl(runs, "terminalize", "--run-id", "run-verify-pre-receipt-crash", "--unit-id", "U")
    expect(ctl(
      runs, "integrate", "--run-id", "run-verify-pre-receipt-crash", "--unit-id", "U",
      "--commit-message", "feat(test): integrate pre-receipt crash fixture", "--", "true",
    ).word).toBe("UNIT_COMMITTED")

    const interrupted = ctlWithEnv(
      runs,
      { CE_WORK_TEST_FAULT: "verify-run-before-receipt" },
      "verify-run", "--run-id", "run-verify-pre-receipt-crash",
      "--verification-summary", "interrupted plan verification", "--",
      "python3", "-c", "from pathlib import Path; Path('verified.txt').write_text('mutated\\n')",
    )
    expect(interrupted.word).toBe("INTERRUPTED")
    const manifest = JSON.parse(readFileSync(path.join(runs, "run-verify-pre-receipt-crash", "manifest.json"), "utf8"))
    expect(manifest.verification_attempts.at(-1)).toMatchObject({
      status: "pending",
      integration_lock_nonce: manifest.integration_lock.nonce,
      lock_unit_id: "U",
    })
    expect(manifest.verifications).toEqual([])
    expect(git(f.repo, "status", "--porcelain")).toBe("M verified.txt")

    const resumed = ctl(runs, "resume", "--run-id", "run-verify-pre-receipt-crash")
    expect(resumed.word).toBe("BLOCKED")
    expect(resumed.body).toMatchObject({
      verification_attempt_id: manifest.verification_attempts.at(-1).attempt_id,
      retain_integration_lock: true,
    })
    expect(ctl(runs, "status", "--run-id", "run-verify-pre-receipt-crash").body.integration_lock).toMatchObject({
      unit_id: "U",
      phase: "held",
    })
  })

  test("resume finishes interrupted abandoned artifact cleanup and restores retry eligibility", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-abandoned-cleanup-crash", f)
    const prepared = ctl(
      runs, "prepare", "--run-id", "run-abandoned-cleanup-crash", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("first packet"),
    )
    writeFileSync(path.join(prepared.body.workspace, "abandoned.txt"), "abandoned\n")
    const job = fakeDoneJob(runs, "run-abandoned-cleanup-crash", "U", "first packet")
    ctl(
      runs, "record-job", "--run-id", "run-abandoned-cleanup-crash", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )
    const transport = ctl(
      runs, "terminalize", "--run-id", "run-abandoned-cleanup-crash", "--unit-id", "U",
    ).body.transport

    const interrupted = ctlWithEnv(
      runs,
      { CE_WORK_TEST_FAULT: "cleanup-before-artifact-prune" },
      "cleanup", "--run-id", "run-abandoned-cleanup-crash", "--unit-id", "U",
      "--abandon", "--expect-transport", transport.commit,
    )
    expect(interrupted.word).toBe("INTERRUPTED")
    const stranded = ctl(runs, "status", "--run-id", "run-abandoned-cleanup-crash").body.units.U
    expect(stranded).toMatchObject({
      state: "cleaned",
      cleanup: { abandoned: true, artifact_cleanup: { complete: false } },
    })
    expect(existsSync(stranded.packet.path)).toBe(true)

    const resumed = ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest)
    expect(resumed.word).toBe("RESUMED")
    expect(resumed.body.actions).toContainEqual({
      unit_id: "U",
      action: "artifact-cleanup-reconciled",
    })
    const cleaned = ctl(runs, "status", "--run-id", "run-abandoned-cleanup-crash").body.units.U
    expect(cleaned.cleanup).toMatchObject({
      abandoned: true,
      artifact_cleanup: { complete: true },
    })
    expect(existsSync(cleaned.packet.path)).toBe(false)

    const retried = ctl(
      runs, "prepare", "--run-id", "run-abandoned-cleanup-crash", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("retry packet"), "--attempt-id", "attempt-2",
    )
    expect(retried.word).toBe("PREPARED")
    expect(retried.body).toMatchObject({ attempt_id: "attempt-2", resumed: false })
  })

})
