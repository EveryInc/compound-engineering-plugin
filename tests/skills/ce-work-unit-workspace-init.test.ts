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

describe("ce-work unit workspace controller: init, identity, and dispatch authorization", () => {
  test("ignores inherited Git repository-selection and index variables", () => {
    const f = makeRepo()
    const decoy = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const initialized = ctlWithEnv(
      runs,
      { GIT_DIR: path.join(decoy.repo, ".git"), GIT_WORK_TREE: decoy.repo },
      "init", "--run-id", "run-sanitized-git-env", "--repo", f.repo,
      "--plan", f.plan, "--plan-digest", f.digest,
      "--binding-json", '{"mode":"prefer","target":"codex","model":null,"source":"test"}',
      "--egress-json", '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["U"],"restrictions":[]}',
    )
    expect(initialized.word).toBe("READY")
    const manifest = JSON.parse(readFileSync(path.join(initialized.body.recovery_path, "manifest.json"), "utf8"))
    expect(manifest.repository.toplevel).toBe(realpathSync(f.repo))

    const ambientIndex = path.join(tmp("ce-work-index-"), "ambient.index")
    const prepared = ctlWithEnv(
      runs,
      { GIT_INDEX_FILE: ambientIndex },
      "prepare", "--run-id", "run-sanitized-git-env", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("sanitized Git environment"),
    )
    expect(prepared.word).toBe("PREPARED")
    expect(existsSync(ambientIndex)).toBe(false)
  })

  test("unit and plan-wide verification ignore inherited Git local environment", () => {
    const f = makeRepo()
    const decoy = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-verification-sanitized-git-env"
    const gitLocalEnvVars = git(f.repo, "rev-parse", "--local-env-vars").split("\n")
    const ambientGitEnv = Object.fromEntries(gitLocalEnvVars.map((name) => [name, "ambient-decoy"]))
    Object.assign(ambientGitEnv, {
      GIT_DIR: path.join(decoy.repo, ".git"),
      GIT_WORK_TREE: decoy.repo,
      GIT_INDEX_FILE: path.join(decoy.repo, ".git", "index"),
    })
    const verificationProbe = [
      "import os, subprocess",
      `forbidden = set(${JSON.stringify(gitLocalEnvVars)})`,
      "leaked = forbidden.intersection(os.environ)",
      "assert not leaked, sorted(leaked)",
      `expected = os.path.realpath(${JSON.stringify(f.repo)})`,
      "actual = os.path.realpath(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())",
      "assert actual == expected, (actual, expected)",
    ].join("; ")

    init(runs, runId, f)
    ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("sanitized verification environment"),
    )
    const workspace = path.join(runs, runId, "units", "U", "workspace")
    writeFileSync(path.join(workspace, "integrated.txt"), "integrated\n")
    const job = fakeDoneJob(runs, runId, "U", "sanitized verification environment")
    ctl(
      runs, "record-job", "--run-id", runId, "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )
    ctl(runs, "terminalize", "--run-id", runId, "--unit-id", "U")

    const integrated = ctlWithEnv(
      runs, ambientGitEnv,
      "integrate", "--run-id", runId, "--unit-id", "U",
      "--commit-message", "feat(test): integrate sanitized verification fixture",
      "--", "python3", "-c", verificationProbe,
    )
    expect(integrated.word).toBe("UNIT_COMMITTED")

    const verified = ctlWithEnv(
      runs, ambientGitEnv,
      "verify-run", "--run-id", runId,
      "--", "python3", "-c", verificationProbe,
    )
    expect(verified.word).toBe("RUN_VERIFIED")
  })

  test("derives the CE Work runs root from the generic peer root when needed", () => {
    const f = makeRepo()
    const peerRoot = tmp("ce-work-peer-root-")
    const runs = path.join(peerRoot, "ce-work")
    const result = ctlWithEnv(
      runs,
      { CE_WORK_RUNS_ROOT: "", CE_PEER_JOBS_ROOT: peerRoot },
      "init", "--run-id", "run-peer-root-only", "--repo", f.repo,
      "--plan", f.plan, "--plan-digest", f.digest,
      "--binding-json", '{"mode":"prefer","target":"codex","model":null,"source":"test"}',
      "--egress-json", '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["U2"],"restrictions":[]}',
    )
    expect(result.word).toBe("READY")
    expect(result.body.recovery_path).toBe(path.join(runs, "run-peer-root-only"))
    expect(existsSync(path.join(runs, "run-peer-root-only", "manifest.json"))).toBe(true)
  })

  test("repairs the owner scratch root and rejects unsafe owner-root entries", () => {
    const repairParent = tmp("ce-work-owner-repair-")
    const repairRoot = path.join(repairParent, "compound-engineering-owner")
    const repairRuns = path.join(repairRoot, "ce-work")
    mkdirSync(repairRoot, { mode: 0o755 })
    chmodSync(repairRoot, 0o755)
    const repaired = ownerRootProbe(repairRoot, repairRuns)
    expect(repaired.status).toBe(0)
    expect(statSync(repairRoot).mode & 0o777).toBe(0o700)
    expect(statSync(repairRuns).mode & 0o777).toBe(0o700)

    const linkTarget = tmp("ce-work-owner-link-target-")
    const linkRoot = path.join(tmp("ce-work-owner-link-parent-"), "compound-engineering-owner")
    symlinkSync(linkTarget, linkRoot, "dir")
    const linked = ownerRootProbe(linkRoot, path.join(linkRoot, "ce-work"))
    expect(linked.status).not.toBe(0)
    expect(linked.stderr).toContain("cannot safely open owner scratch root")
    expect(existsSync(path.join(linkTarget, "ce-work"))).toBe(false)

    const foreignRoot = path.join(tmp("ce-work-owner-foreign-"), "compound-engineering-owner")
    mkdirSync(foreignRoot, { mode: 0o700 })
    const foreign = ownerRootProbe(foreignRoot, path.join(foreignRoot, "ce-work"), true)
    expect(foreign.status).not.toBe(0)
    expect(foreign.stderr).toContain("owner scratch root is not owned by current user")
    expect(existsSync(path.join(foreignRoot, "ce-work"))).toBe(false)

    const externalParent = tmp("ce-work-external-root-")
    chmodSync(externalParent, 0o755)
    const unrelatedOwnerRoot = path.join(tmp("ce-work-unrelated-owner-"), "compound-engineering-owner")
    const externalRuns = path.join(externalParent, "ce-work")
    expect(ownerRootProbe(unrelatedOwnerRoot, externalRuns).status).toBe(0)
    expect(statSync(externalParent).mode & 0o777).toBe(0o755)
  })

  test("creates private durable state and rejects unsafe identity or mode", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const good = init(runs, "run-1", f)
    expect(good.code).toBe(0)
    expect(good.word).toBe("READY")
    expect(good.body).toMatchObject({ source_kind: "plan", source_digest: f.digest })
    expect(ctl(runs, "status", "--run-id", "run-1").body.source).toEqual({
      kind: "plan",
      storage: "repository",
      path: "docs/plans/plan.md",
      digest: f.digest,
    })
    expect(statSync(path.join(runs, "run-1")).mode & 0o777).toBe(0o700)
    expect(statSync(path.join(runs, "run-1", "manifest.json")).mode & 0o777).toBe(0o600)

    expect(init(runs, "../escape", f).word).toBe("REFUSED")
    chmodSync(path.join(runs, "run-1", "manifest.json"), 0o644)
    const unsafe = ctl(runs, "status", "--run-id", "run-1")
    expect(unsafe.word).toBe("UNREADABLE")
    expect(unsafe.body).toBeNull()

    const second = init(runs, "run-symlink", f)
    expect(second.word).toBe("READY")
    const manifest = path.join(runs, "run-symlink", "manifest.json")
    rmSync(manifest)
    symlinkSync(f.plan, manifest)
    expect(ctl(runs, "resume", "--run-id", "run-symlink").word).toBe("UNREADABLE")

    const outside = path.join(tmp("ce-work-outside-"), "plan.md")
    writeFileSync(outside, "# Plan\n")
    const digest = createHash("sha256").update(readFileSync(outside)).digest("hex")
    expect(ctl(runs, "init", "--run-id", "outside", "--repo", f.repo, "--plan", outside, "--plan-digest", digest).word).toBe("REFUSED")
  })

  test("refuses mixed resume selectors instead of ignoring repository identity", () => {
    const f = makeRepo()
    const other = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-bound-to-first-repo", f)

    const mixed = ctl(
      runs, "resume", "--run-id", "run-bound-to-first-repo",
      "--repo", other.repo, "--plan-digest", other.digest,
    )

    expect(mixed.word).toBe("REFUSED")
    expect(mixed.stderr).toContain("--run-id alone or both --repo and --plan-digest")
    expect(ctl(runs, "status", "--run-id", "run-bound-to-first-repo").word).toBe("STATUS")
    const manifest = JSON.parse(readFileSync(path.join(runs, "run-bound-to-first-repo", "manifest.json"), "utf8"))
    expect(manifest.repository.toplevel).toBe(realpathSync(f.repo))
  })

  test("persists a bounded prompt source privately without pretending it is a repository plan", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const prompt = "# Bare-prompt implementation brief\n\n## Goal\nAdd the requested behavior.\n"
    const first = initWithPrompt(runs, "run-prompt", f, prompt)

    expect(first.result).toMatchObject({
      word: "READY",
      body: { resumed: false, source_kind: "prompt", source_digest: first.digest },
    })
    const stored = path.join(runs, "run-prompt", "source", "bare-prompt.md")
    expect(readFileSync(stored, "utf8")).toBe(prompt)
    expect(statSync(stored).mode & 0o777).toBe(0o600)
    expect(ctl(runs, "status", "--run-id", "run-prompt").body.source).toEqual({
      kind: "prompt",
      storage: "run",
      path: "source/bare-prompt.md",
      digest: first.digest,
    })
    expect(JSON.parse(readFileSync(path.join(runs, "run-prompt", "manifest.json"), "utf8")).plan).toEqual({
      kind: "prompt",
      path: null,
      digest: first.digest,
      checkpoint: null,
    })
    expect(ctl(runs, "checkpoint-plan", "--run-id", "run-prompt")).toMatchObject({
      word: "NOOP",
      body: { checkpoint: null, source_kind: "prompt" },
    })
    const unitPacket = packetFile("# P1\n\nAdd retry limits.\n")
    const prepared = ctl(
      runs, "prepare", "--run-id", "run-prompt", "--unit-id", "P1",
      "--base", f.base, "--packet", unitPacket,
    )
    expect(prepared).toMatchObject({ word: "PREPARED", body: { unit_id: "P1" } })

    const resumed = ctl(
      runs, "init", "--run-id", "run-prompt", "--repo", f.repo,
      "--prompt-brief", first.brief, "--prompt-digest", first.digest,
      "--binding-json", '{"mode":"prefer","target":"codex","model":null,"source":"test"}',
      "--egress-json", '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["P1"],"restrictions":[]}',
    )
    expect(resumed).toMatchObject({
      word: "READY",
      body: { resumed: true, source_kind: "prompt", source_digest: first.digest },
    })

    const changed = initWithPrompt(runs, "run-prompt", f, `${prompt}\nChanged scope.\n`)
    expect(changed.result.word).toBe("BLOCKED")
    expect(changed.result.stderr).toContain("another repository or source")

    writeFileSync(path.join(f.repo, "dirty.txt"), "dirty\n")
    const dirtyCheckpoint = ctl(runs, "checkpoint-plan", "--run-id", "run-prompt")
    expect(dirtyCheckpoint.word).toBe("BLOCKED")
    expect(dirtyCheckpoint.stderr).toContain("requires a clean canonical checkout")
  })

  test("rejects malformed, mismatched, or linked prompt source inputs", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const brief = packetFile("bounded prompt\n")
    const binding = '{"mode":"prefer","target":"codex","model":null,"source":"test"}'
    const egress = '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["P1"],"restrictions":[]}'

    expect(ctl(
      runs, "init", "--run-id", "prompt-wrong-digest", "--repo", f.repo,
      "--prompt-brief", brief, "--prompt-digest", "0".repeat(64),
      "--binding-json", binding, "--egress-json", egress,
    ).word).toBe("REFUSED")
    expect(existsSync(path.join(runs, "prompt-wrong-digest"))).toBe(false)

    expect(ctl(
      runs, "init", "--run-id", "prompt-wrong-flag", "--repo", f.repo,
      "--prompt-brief", brief, "--plan-digest", packetDigest("bounded prompt\n"),
      "--binding-json", binding, "--egress-json", egress,
    ).word).toBe("REFUSED")

    const linked = path.join(tmp("ce-work-prompt-link-"), "brief.md")
    symlinkSync(brief, linked)
    const linkedResult = ctl(
      runs, "init", "--run-id", "prompt-link", "--repo", f.repo,
      "--prompt-brief", linked, "--prompt-digest", packetDigest("bounded prompt\n"),
      "--binding-json", binding, "--egress-json", egress,
    )
    expect(linkedResult.word).toBe("REFUSED")
    expect(linkedResult.stderr).toContain("prompt brief")

    const repositoryBrief = path.join(f.repo, "prompt-brief.md")
    writeFileSync(repositoryBrief, "bounded prompt\n")
    expect(ctl(
      runs, "init", "--run-id", "prompt-in-repo", "--repo", f.repo,
      "--prompt-brief", repositoryBrief, "--prompt-digest", packetDigest("bounded prompt\n"),
      "--binding-json", binding, "--egress-json", egress,
    ).word).toBe("REFUSED")

    const trusted = initWithPrompt(runs, "prompt-tamper", f, "trusted prompt\n")
    expect(trusted.result.word).toBe("READY")
    writeFileSync(path.join(runs, "prompt-tamper", "source", "bare-prompt.md"), "tampered prompt\n", { mode: 0o600 })
    expect(ctl(runs, "status", "--run-id", "prompt-tamper").word).toBe("UNREADABLE")
  })

  test("reports an actionable blocker when a run directory exists without controller state", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    mkdirSync(path.join(runs, ".locks"), { recursive: true, mode: 0o700 })
    chmodSync(runs, 0o700)
    chmodSync(path.join(runs, ".locks"), 0o700)
    mkdirSync(path.join(runs, "precreated"), { mode: 0o755 })

    const result = init(runs, "precreated", f)

    expect(result.word).toBe("BLOCKED")
    expect(result.body).toBeNull()
    expect(result.stderr).toContain("exists without a controller manifest")
    expect(result.stderr).toContain("choose a new run id")
  })

  test("validates the fixed route at init and refuses conflicting resume sanctions", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const binding = JSON.stringify({ mode: "require", target: "codex", model: null, source: "test" })
    const invalid = ctl(
      runs, "init", "--run-id", "invalid-route", "--repo", f.repo, "--plan", f.plan,
      "--plan-digest", f.digest, "--binding-json", binding,
      "--egress-json", JSON.stringify({ route: "codex-local", intermediaries: [], restrictions: [] }),
    )
    expect(invalid.word).toBe("REFUSED")
    expect(invalid.stderr).toContain("unsupported egress route 'codex-local'")
    expect(invalid.stderr).toContain("codex, claude, grok-cli, cursor, composer, grok-cursor")
    expect(existsSync(path.join(runs, "invalid-route"))).toBe(false)

    for (const [runId, malformed, message] of [
      ["missing-binding-mode", { target: "codex", model: null, source: "test" }, "exactly mode, target, model, and source"],
      ["invalid-binding-mode", { mode: "preferred", target: "codex", model: null, source: "test" }, "mode must be 'prefer' or 'require'"],
      ["extra-binding-field", { mode: "prefer", target: "codex", model: null, source: "test", extra: true }, "exactly mode, target, model, and source"],
      ["empty-binding-source", { mode: "prefer", target: "codex", model: null, source: "" }, "source must be a non-empty string"],
    ] as const) {
      const malformedResult = ctl(
        runs, "init", "--run-id", runId, "--repo", f.repo, "--plan", f.plan,
        "--plan-digest", f.digest, "--binding-json", JSON.stringify(malformed),
        "--egress-json", JSON.stringify({ route: "codex", intermediaries: [], restrictions: [] }),
      )
      expect(malformedResult.word).toBe("REFUSED")
      expect(malformedResult.stderr).toContain(message)
      expect(existsSync(path.join(runs, runId))).toBe(false)
    }

    for (const [index, model] of ["composer-2.5-fast", "grok-4.6", "cursor-grok-4.6-high", "model@beta"].entries()) {
      const runId = `invalid-cursor-model-${index}`
      const invalidModel = ctl(
        runs, "init", "--run-id", runId, "--repo", f.repo, "--plan", f.plan,
        "--plan-digest", f.digest,
        "--binding-json", JSON.stringify({ mode: "require", target: "cursor", model, source: "test" }),
        "--egress-json", JSON.stringify({ route: "cursor", intermediaries: [], restrictions: [] }),
      )
      expect(invalidModel.word).toBe("REFUSED")
      expect(invalidModel.stderr).toContain("model is not compatible")
      expect(existsSync(path.join(runs, runId))).toBe(false)
    }

    const first = initWithBinding(runs, "fixed-sanction", f, "require")
    expect(first.word).toBe("READY")
    const resumed = initWithBinding(runs, "fixed-sanction", f, "require")
    expect(resumed).toMatchObject({ word: "READY", body: { resumed: true } })
    const conflicting = ctl(
      runs, "init", "--run-id", "fixed-sanction", "--repo", f.repo, "--plan", f.plan,
      "--plan-digest", f.digest, "--binding-json", binding,
      "--egress-json", JSON.stringify({ route: "codex", intermediaries: [], restrictions: ["different"] }),
    )
    expect(conflicting.word).toBe("BLOCKED")
    expect(conflicting.stderr).toContain("binding or egress sanction differs")
    expect(JSON.parse(readFileSync(path.join(runs, "fixed-sanction", "manifest.json"), "utf8")).egress.restrictions).toEqual([])
  })

  test("owns packet bytes and rejects route or receipt substitution", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-authority", f)
    const source = packetFile("authorized packet")
    const prepared = ctl(
      runs, "prepare", "--run-id", "run-authority", "--unit-id", "U", "--base", f.base, "--packet", source,
    )
    expect(prepared.word).toBe("PREPARED")
    expect(prepared.body.packet_digest).toBe(packetDigest("authorized packet"))
    expect(readFileSync(prepared.body.packet_path, "utf8")).toBe("authorized packet")
    const authorizationText = readFileSync(prepared.body.authorization_path, "utf8")
    const authorization = JSON.parse(authorizationText)
    expect(authorization).toEqual({
      schema_version: 1,
      run_id: "run-authority",
      unit_id: "U",
      attempt_id: "attempt-1",
      route: "codex",
      target: "codex",
      harness: "codex",
      intermediaries: [],
      model_requested: "auto",
      restriction_posture: "adapter-enforced",
      restrictions: [],
      activity_posture: "hard-only",
      packet_digest: packetDigest("authorized packet"),
    })
    expect(prepared.body.authorization_digest).toBe(packetDigest(readFileSync(prepared.body.authorization_path, "utf8")))
    writeFileSync(source, "substituted packet")
    expect(ctl(
      runs, "prepare", "--run-id", "run-authority", "--unit-id", "U", "--base", f.base, "--packet", source,
    ).word).toBe("BLOCKED")
    writeFileSync(source, "authorized packet", { mode: 0o600 })
    writeFileSync(prepared.body.authorization_path, `${JSON.stringify({ ...authorization, route: "claude" })}\n`, { mode: 0o600 })
    chmodSync(prepared.body.authorization_path, 0o600)
    expect(ctl(
      runs, "prepare", "--run-id", "run-authority", "--unit-id", "U", "--base", f.base, "--packet", source,
    ).word).toBe("BLOCKED")
    writeFileSync(prepared.body.authorization_path, authorizationText, { mode: 0o600 })
    chmodSync(prepared.body.authorization_path, 0o600)

    const job = fakeDoneJob(runs, "run-authority", "U", "authorized packet", "job-authority")
    const metaPath = path.join(runs, "run-authority", "jobs", job, "meta.json")
    const meta = JSON.parse(readFileSync(metaPath, "utf8"))
    meta.label = "U-attempt-1"
    writeFileSync(metaPath, `${JSON.stringify(meta)}\n`, { mode: 0o600 })
    chmodSync(metaPath, 0o600)
    const wrongLabel = ctl(
      runs, "record-job", "--run-id", "run-authority", "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job,
    )
    expect(wrongLabel.word).toBe("BLOCKED")
    expect(wrongLabel.stderr).toContain("runner label must equal unit id exactly: expected 'U', got 'U-attempt-1'")
    meta.label = "U"
    meta.result_path = path.join(runs, "run-authority", "units", "U", "result", "result.json")
    writeFileSync(metaPath, `${JSON.stringify(meta)}\n`, { mode: 0o600 })
    chmodSync(metaPath, 0o600)
    const wrongResult = ctl(
      runs, "record-job", "--run-id", "run-authority", "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job,
    )
    expect(wrongResult.word).toBe("BLOCKED")
    expect(wrongResult.stderr).toContain("runner result path must be the controller result file")
    expect(wrongResult.stderr).toContain("implementation-result.json")
    meta.result_path = path.join(runs, "run-authority", "units", "U", "result", "implementation-result.json")
    meta.worker_argv[1] = path.join(runs, "run-authority", "units", "U", "other-authorization.json")
    writeFileSync(metaPath, `${JSON.stringify(meta)}\n`, { mode: 0o600 })
    chmodSync(metaPath, 0o600)
    expect(ctl(
      runs, "record-job", "--run-id", "run-authority", "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job,
    ).word).toBe("BLOCKED")
    meta.worker_argv[1] = prepared.body.authorization_path
    writeFileSync(metaPath, `${JSON.stringify(meta)}\n`, { mode: 0o600 })
    chmodSync(metaPath, 0o600)
    expect(ctl(
      runs, "record-job", "--run-id", "run-authority", "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job,
    ).word).toBe("AUTHORING")
    const resultPath = path.join(runs, "run-authority", "units", "U", "result", "implementation-result.json")
    const result = JSON.parse(readFileSync(resultPath, "utf8"))
    result.actual_route = "claude"
    result.evidence = ["x".repeat(3 * 1024 * 1024)]
    writeFileSync(resultPath, `${JSON.stringify(result)}\n`, { mode: 0o600 })
    chmodSync(resultPath, 0o600)
    expect(statSync(resultPath).size).toBeGreaterThan(2 * 1024 * 1024)
    expect(statSync(resultPath).size).toBeLessThan(5 * 1024 * 1024)
    const blocked = ctl(runs, "terminalize", "--run-id", "run-authority", "--unit-id", "U")
    expect(blocked.word).toBe("BLOCKED")
    expect(blocked.body.mismatches.actual_route).toEqual({ expected: "codex", actual: "claude" })
    const failed = ctl(runs, "status", "--run-id", "run-authority", "--unit-id", "U").body.unit.attempts[0]
    expect(failed.terminal_validation_failure).toMatchObject({
      word: "BLOCKED",
      reason: "adapter terminal receipt does not match controller authorization",
      job_id: job,
    })
    expect(failed.fallback).toMatchObject({ eligible: true, reason: "terminal-validation-failure" })
    expect(ctl(
      runs, "cleanup", "--run-id", "run-authority", "--unit-id", "U",
      "--abandon", "--expect-job", job,
    ).word).toBe("CLEANED")
  })

  test("authorizes dispatch only for the exact recorded run unit attempt and paths", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    init(runs, "run-handshake", f)
    const first = ctl(
      runs, "prepare", "--run-id", "run-handshake", "--unit-id", "U-a", "--base", f.base,
      "--packet", packetFile("packet-a"), "--attempt-id", "attempt-1",
    ).body
    const second = ctl(
      runs, "prepare", "--run-id", "run-handshake", "--unit-id", "U-b", "--base", f.base,
      "--packet", packetFile("packet-b"), "--attempt-id", "attempt-1",
    ).body
    const handAuth = packetFile(readFileSync(first.authorization_path, "utf8"))
    expect(authorizeDispatch(runs, "run-handshake", "U-a", first, { authorization: handAuth }).word).toBe("BLOCKED")
    expect(authorizeDispatch(runs, "run-handshake", "U-a", first, { attemptId: "attempt-2" }).word).toBe("AMBIGUOUS")
    expect(authorizeDispatch(runs, "run-handshake", "U-b", second, {
      authorization: first.authorization_path,
      authorizationDigest: first.authorization_digest,
    }).word).toBe("BLOCKED")
    expect(authorizeDispatch(runs, "run-handshake", "U-a", first, { authorizationDigest: "0".repeat(64) }).word).toBe("BLOCKED")
    expect(authorizeDispatch(runs, "run-handshake", "U-a", first, { workspace: second.workspace }).word).toBe("BLOCKED")
    expect(authorizeDispatch(runs, "run-handshake", "U-a", first, { packet: second.packet_path }).word).toBe("BLOCKED")
    expect(authorizeDispatch(runs, "run-handshake", "U-a", first, { packetDigest: second.packet_digest }).word).toBe("BLOCKED")
    expect(authorizeDispatch(runs, "run-handshake", "U-a", first, { resultDir: second.result_dir }).word).toBe("BLOCKED")

    const revision = ctl(runs, "status", "--run-id", "run-handshake").body.revision
    const authorized = authorizeDispatch(runs, "run-handshake", "U-a", first)
    expect(authorized.word).toBe("AUTHORIZED")
    expect(authorized.body).toMatchObject({
      run_id: "run-handshake",
      unit_id: "U-a",
      attempt_id: "attempt-1",
      authorization_digest: first.authorization_digest,
      packet_digest: first.packet_digest,
    })
    const bound = ctl(runs, "status", "--run-id", "run-handshake").body
    expect(bound.revision).toBeGreaterThan(revision)
    expect(bound.units["U-a"].state).toBe("authoring")
    expect(bound.units["U-a"].attempts[0].job_id).toBe(authorized.body.job_id)
    expect(ctl(
      runs, "record-job", "--run-id", "run-handshake", "--unit-id", "U-a",
      "--attempt-id", "attempt-1", "--job-id", authorized.body.job_id,
    ).body.resumed).toBe(true)
    expect(authorizeDispatch(runs, "run-handshake", "U-a", first).word).toBe("AMBIGUOUS")

    init(runs, "run-hand-authored", f)
    expect(authorizeDispatch(runs, "run-hand-authored", "fake-unit", first).word).toBe("REFUSED")
  })

  test("rejects a swapped result directory before reading terminal receipt or raw log", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-result-dir-swap"
    init(runs, runId, f)
    const prepared = ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    ).body
    const job = fakeDoneJob(runs, runId, "U", "packet", "job-result-dir-swap")
    expect(ctl(
      runs, "record-job", "--run-id", runId, "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    ).word).toBe("AUTHORING")

    const originalResultDir = `${prepared.result_dir}.original`
    renameSync(prepared.result_dir, originalResultDir)
    mkdirSync(prepared.result_dir, { mode: 0o700 })
    const forgedLog = path.join(prepared.result_dir, "adapter.log")
    writeFileSync(forgedLog, "forged adapter activity\n", { mode: 0o600 })
    const forged = JSON.parse(readFileSync(path.join(originalResultDir, "implementation-result.json"), "utf8"))
    forged.summary = "forged result"
    forged.raw_log = forgedLog
    writeFileSync(
      path.join(prepared.result_dir, "implementation-result.json"),
      `${JSON.stringify(forged)}\n`,
      { mode: 0o600 },
    )

    const terminal = ctl(runs, "terminalize", "--run-id", runId, "--unit-id", "U")
    expect(terminal.word).toBe("UNREADABLE")
    expect(terminal.stderr).toContain("controller result directory identity changed")
    const status = ctl(runs, "status", "--run-id", runId, "--unit-id", "U").body.unit
    expect(status.state).toBe("authoring")
    expect(status.attempts[0].terminal_receipt).toBeNull()
    expect(readFileSync(forgedLog, "utf8")).toBe("forged adapter activity\n")
  })

  test("does not backfill a missing result-directory identity on resumed prepare", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-result-dir-legacy-resume"
    const packet = packetFile("packet")
    init(runs, runId, f)
    expect(ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U",
      "--base", f.base, "--packet", packet,
    ).word).toBe("PREPARED")
    const manifestPath = path.join(runs, runId, "manifest.json")
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    delete manifest.units.U.result_dir_identity
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, { mode: 0o600 })

    const resumed = ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U",
      "--base", f.base, "--packet", packet,
    )
    expect(resumed.word).toBe("UNREADABLE")
    expect(resumed.stderr).toContain("no valid controller-recorded result directory identity")
  })

  test("blocks polluted registered workspaces before resumed prepare or first dispatch authorization", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-pristine-dispatch"
    init(runs, runId, f)

    const prepareUnit = (unitId: string) => {
      const packet = packetFile(`packet-${unitId}`)
      const prepared = ctl(
        runs, "prepare", "--run-id", runId, "--unit-id", unitId, "--base", f.base, "--packet", packet,
      )
      expect(prepared.word).toBe("PREPARED")
      return { packet, prepared: prepared.body }
    }
    const advance = (workspace: string) => {
      writeFileSync(path.join(workspace, "worker.txt"), "premature\n")
      git(workspace, "add", "worker.txt")
      git(
        workspace,
        "-c", "user.name=Worker", "-c", "user.email=worker@example.test",
        "commit", "-m", "premature worker commit",
      )
    }

    const resumedHead = prepareUnit("U-prepare-head")
    advance(resumedHead.prepared.workspace)
    const resumedHeadBlocked = ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U-prepare-head", "--base", f.base,
      "--packet", resumedHead.packet,
    )
    expect(resumedHeadBlocked.word).toBe("BLOCKED")
    expect(resumedHeadBlocked.stderr).toContain("workspace HEAD no longer equals the recorded base")

    const resumedDirty = prepareUnit("U-prepare-dirty")
    writeFileSync(path.join(resumedDirty.prepared.workspace, "keep.txt"), "premature staged edit\n")
    git(resumedDirty.prepared.workspace, "add", "keep.txt")
    const resumedDirtyBlocked = ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U-prepare-dirty", "--base", f.base,
      "--packet", resumedDirty.packet,
    )
    expect(resumedDirtyBlocked.word).toBe("BLOCKED")
    expect(resumedDirtyBlocked.stderr).toContain("workspace is dirty before dispatch authorization")

    const authorizeHead = prepareUnit("U-authorize-head")
    advance(authorizeHead.prepared.workspace)
    const authorizeHeadBlocked = authorizeDispatch(runs, runId, "U-authorize-head", authorizeHead.prepared)
    expect(authorizeHeadBlocked.word).toBe("BLOCKED")
    expect(authorizeHeadBlocked.stderr).toContain("workspace HEAD no longer equals the recorded base")

    const authorizeDirty = prepareUnit("U-authorize-dirty")
    writeFileSync(path.join(authorizeDirty.prepared.workspace, "keep.txt"), "premature unstaged edit\n")
    const authorizeDirtyBlocked = authorizeDispatch(runs, runId, "U-authorize-dirty", authorizeDirty.prepared)
    expect(authorizeDirtyBlocked.word).toBe("BLOCKED")
    expect(authorizeDirtyBlocked.stderr).toContain("workspace is dirty before dispatch authorization")
  })

  test("requires an exact durable authorization receipt before relaxing pristine dispatch validation", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-prebound-authorization"
    init(runs, runId, f)

    const prepare = (unitId: string) => ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", unitId, "--base", f.base,
      "--packet", packetFile(`packet-${unitId}`),
    ).body
    const prebind = (unitId: string, prepared: any, jobId: string) => {
      fakeRunningJob(runs, runId, unitId, `packet-${unitId}`, jobId)
      const recorded = ctl(
        runs, "record-job", "--run-id", runId, "--unit-id", unitId,
        "--attempt-id", "attempt-1", "--job-id", jobId,
      )
      expect(recorded.word).toBe("AUTHORING")
      expect(recorded.body.resumed).toBe(false)
      expect(prepared.packet_digest).toBe(packetDigest(`packet-${unitId}`))
    }

    const wrongHead = prepare("U-prebound-head")
    const wrongHeadJob = "job-prebound-head"
    prebind("U-prebound-head", wrongHead, wrongHeadJob)
    writeFileSync(path.join(wrongHead.workspace, "worker.txt"), "premature\n")
    git(wrongHead.workspace, "add", "worker.txt")
    git(
      wrongHead.workspace,
      "-c", "user.name=Worker", "-c", "user.email=worker@example.test",
      "commit", "-m", "premature worker commit",
    )
    const wrongHeadBlocked = authorizeDispatch(runs, runId, "U-prebound-head", wrongHead, { jobId: wrongHeadJob })
    expect(wrongHeadBlocked.word).toBe("BLOCKED")
    expect(wrongHeadBlocked.stderr).toContain("workspace HEAD no longer equals the recorded base")

    const dirty = prepare("U-prebound-dirty")
    const dirtyJob = "job-prebound-dirty"
    prebind("U-prebound-dirty", dirty, dirtyJob)
    writeFileSync(path.join(dirty.workspace, "keep.txt"), "premature dirty edit\n")
    const dirtyBlocked = authorizeDispatch(runs, runId, "U-prebound-dirty", dirty, { jobId: dirtyJob })
    expect(dirtyBlocked.word).toBe("BLOCKED")
    expect(dirtyBlocked.stderr).toContain("workspace is dirty before dispatch authorization")

    const pristine = prepare("U-prebound-pristine")
    const pristineJob = "job-prebound-pristine"
    prebind("U-prebound-pristine", pristine, pristineJob)
    const authorized = authorizeDispatch(runs, runId, "U-prebound-pristine", pristine, { jobId: pristineJob })
    expect(authorized.word).toBe("AUTHORIZED")
    expect(authorized.body.resumed).toBe(false)
    const pristineStatus = ctl(runs, "status", "--run-id", runId, "--unit-id", "U-prebound-pristine").body.unit
    expect(pristineStatus.attempts[0].dispatch_authorization_receipt).toEqual({
      attempt_id: "attempt-1",
      job_id: pristineJob,
      authorization_path: pristine.authorization_path,
      authorization_digest: pristine.authorization_digest,
      workspace: pristine.workspace,
      packet_path: pristine.packet_path,
      packet_digest: pristine.packet_digest,
      result_dir: pristine.result_dir,
      result_dir_identity: pristineStatus.result_dir_identity,
    })

    writeFileSync(path.join(pristine.workspace, "keep.txt"), "legitimate worker edit\n")
    const resumed = authorizeDispatch(runs, runId, "U-prebound-pristine", pristine, { jobId: pristineJob })
    expect(resumed.word).toBe("AUTHORIZED")
    expect(resumed.body.resumed).toBe(true)

    const manifestPath = path.join(runs, runId, "manifest.json")
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    manifest.units["U-prebound-pristine"].attempts[0].dispatch_authorization_receipt.packet_digest = "0".repeat(64)
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
    chmodSync(manifestPath, 0o600)
    const mismatched = authorizeDispatch(runs, runId, "U-prebound-pristine", pristine, { jobId: pristineJob })
    expect(mismatched.word).toBe("BLOCKED")
    expect(mismatched.stderr).toContain("recorded dispatch authorization does not match the exact request")
  })

  test("returns the recorded canonical adapter from a symlinked skill for fresh and resumed dispatch", () => {
    const f = makeRepo()
    const linkedSkill = path.join(tmp("ce-work-linked-skill-"), "ce-work")
    symlinkSync(path.join(__dirname, "../../skills/ce-work"), linkedSkill, "dir")
    const linkedController = path.join(linkedSkill, "scripts", "unit-workspace.py")
    const canonicalAdapter = realpathSync(path.join(linkedSkill, "scripts", "cross-model-work.sh"))
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-linked-adapter"
    expect(ctlWithScript(
      linkedController, runs,
      "init", "--run-id", runId, "--repo", f.repo, "--plan", f.plan,
      "--plan-digest", f.digest,
      "--binding-json", '{"mode":"prefer","target":"codex","model":null,"source":"test"}',
      "--egress-json", '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["U"],"restrictions":[]}',
    ).word).toBe("READY")
    const packet = packetFile("linked adapter packet")
    const fresh = ctlWithScript(
      linkedController, runs,
      "prepare", "--run-id", runId, "--unit-id", "U", "--base", f.base, "--packet", packet,
    )
    expect(fresh).toMatchObject({ word: "PREPARED", body: { adapter: canonicalAdapter, resumed: false } })
    const attempt = ctlWithScript(linkedController, runs, "status", "--run-id", runId, "--unit-id", "U").body.unit.attempts[0]
    expect(attempt.adapter).toBe(canonicalAdapter)

    const resumed = ctlWithScript(
      linkedController, runs,
      "prepare", "--run-id", runId, "--unit-id", "U", "--base", f.base, "--packet", packet,
    )
    expect(resumed).toMatchObject({ word: "PREPARED", body: { adapter: canonicalAdapter, resumed: true } })
    expect(authorizeDispatch(runs, runId, "U", fresh.body, { adapter: fresh.body.adapter }).word).toBe("AUTHORIZED")
  })

})
