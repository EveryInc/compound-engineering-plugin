import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  statSync,
  truncateSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"

setDefaultTimeout(30_000)

const SCRIPT = path.join(__dirname, "../../skills/ce-work/scripts/unit-workspace.py")
const ADAPTER = path.join(__dirname, "../../skills/ce-work/scripts/cross-model-work.sh")
const roots: string[] = []

function tmp(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix))
  roots.push(root)
  return root
}

function sh(cwd: string, argv: string[], check = true) {
  const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: "utf8" })
  if (check && r.status !== 0) throw new Error(`${argv.join(" ")}\n${r.stderr}`)
  return r
}

function git(cwd: string, ...args: string[]): string {
  return sh(cwd, ["git", ...args]).stdout.trim()
}

function makeRepo(objectFormat: "sha1" | "sha256" = "sha1"): { repo: string; plan: string; digest: string; base: string } {
  const repo = path.join(tmp("ce-work-repo-"), "repo")
  mkdirSync(repo)
  git(repo, "init", `--object-format=${objectFormat}`, "-b", "main")
  git(repo, "config", "user.name", "CE Work Test")
  git(repo, "config", "user.email", "ce-work@example.test")
  mkdirSync(path.join(repo, "docs", "plans"), { recursive: true })
  writeFileSync(path.join(repo, "keep.txt"), "keep\n")
  writeFileSync(path.join(repo, "delete.txt"), "delete\n")
  writeFileSync(path.join(repo, "mode.sh"), "#!/bin/sh\necho old\n")
  chmodSync(path.join(repo, "mode.sh"), 0o644)
  const plan = path.join(repo, "docs", "plans", "plan.md")
  writeFileSync(plan, "# Plan\n")
  git(repo, "add", ".")
  git(repo, "commit", "-m", "seed")
  const digest = createHash("sha256").update(readFileSync(plan)).digest("hex")
  return { repo, plan, digest, base: git(repo, "rev-parse", "HEAD") }
}

function packetFile(content: string): string {
  const packet = path.join(tmp("ce-work-packet-"), "unit.md")
  writeFileSync(packet, content, { mode: 0o600 })
  return packet
}

function packetDigest(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}

function ctl(runsRoot: string, ...args: string[]) {
  return ctlWithEnv(runsRoot, {}, ...args)
}

function ctlWithEnv(runsRoot: string, extraEnv: Record<string, string>, ...args: string[]) {
  return ctlWithScriptAndEnv(SCRIPT, runsRoot, extraEnv, ...args)
}

function ctlWithScript(script: string, runsRoot: string, ...args: string[]) {
  return ctlWithScriptAndEnv(script, runsRoot, {}, ...args)
}

function ctlWithScriptAndEnv(script: string, runsRoot: string, extraEnv: Record<string, string>, ...args: string[]) {
  const r = spawnSync("python3", [script, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      CE_WORK_RUNS_ROOT: runsRoot,
      CE_PEER_JOBS_ROOT: path.dirname(runsRoot),
      ...extraEnv,
    },
  })
  const lines = r.stdout.trim().split("\n")
  let body: any = null
  if (lines.length > 1) body = JSON.parse(lines.slice(1).join("\n"))
  return { code: r.status ?? -1, word: lines[0] || "", body, stderr: r.stderr }
}

function ownerRootProbe(ownerRoot: string, runsRoot: string, foreignLike = false) {
  const source = [
    "import os, sys",
    `sys.path.insert(0, ${JSON.stringify(path.dirname(SCRIPT))})`,
    "import unit_workspace_state as state",
    "state.OWNER_SCRATCH_ROOT = sys.argv[1]",
    foreignLike ? "state._EFFECTIVE_UID = os.geteuid() + 1" : "",
    "print(state.ensure_root())",
  ].filter(Boolean).join("; ")
  return spawnSync("python3", ["-c", source, ownerRoot], {
    encoding: "utf8",
    env: {
      ...process.env,
      CE_WORK_RUNS_ROOT: runsRoot,
      CE_PEER_JOBS_ROOT: "",
    },
  })
}

function init(runsRoot: string, runId: string, fixture: ReturnType<typeof makeRepo>) {
  return initWithBinding(runsRoot, runId, fixture, "prefer")
}

function initWithBinding(
  runsRoot: string,
  runId: string,
  fixture: ReturnType<typeof makeRepo>,
  mode: "prefer" | "require",
) {
  return ctl(
    runsRoot,
    "init",
    "--run-id", runId,
    "--repo", fixture.repo,
    "--plan", fixture.plan,
    "--plan-digest", fixture.digest,
    "--binding-json", JSON.stringify({ mode, target: "codex", model: null, source: "test" }),
    "--egress-json", '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["U2"],"restrictions":[]}',
  )
}

function initWithPrompt(
  runsRoot: string,
  runId: string,
  fixture: ReturnType<typeof makeRepo>,
  prompt: string,
) {
  const brief = packetFile(prompt)
  return {
    brief,
    digest: packetDigest(prompt),
    result: ctl(
      runsRoot,
      "init",
      "--run-id", runId,
      "--repo", fixture.repo,
      "--prompt-brief", brief,
      "--prompt-digest", packetDigest(prompt),
      "--binding-json", JSON.stringify({ mode: "prefer", target: "codex", model: null, source: "test" }),
      "--egress-json", '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["P1"],"restrictions":[]}',
    ),
  }
}

function authorizeDispatch(
  runsRoot: string,
  runId: string,
  unitId: string,
  prepared: any,
  overrides: Record<string, string> = {},
) {
  const values = {
    runId,
    unitId,
    attemptId: "attempt-1",
    authorization: prepared.authorization_path,
    authorizationDigest: prepared.authorization_digest,
    workspace: prepared.workspace,
    packet: prepared.packet_path,
    packetDigest: prepared.packet_digest,
    resultDir: prepared.result_dir,
    adapter: ADAPTER,
    ...overrides,
  }
  const jobId = values.jobId ?? `job-auth-${Math.random().toString(16).slice(2)}`
  const jobDir = path.join(runsRoot, runId, "jobs", jobId)
  mkdirSync(jobDir, { recursive: true, mode: 0o700 })
  chmodSync(jobDir, 0o700)
  writeFileSync(path.join(jobDir, "meta.json"), `${JSON.stringify({
    job_id: jobId,
    skill: "ce-work",
    run_id: values.runId,
    label: values.unitId,
    input_digest: values.packetDigest,
    worker_argv: [values.adapter, values.authorization, values.workspace, values.packet, values.packetDigest, values.resultDir],
    result_path: path.join(values.resultDir, "implementation-result.json"),
  })}\n`, { mode: 0o600 })
  return ctl(
    runsRoot,
    "authorize-dispatch",
    "--run-id", values.runId,
    "--unit-id", values.unitId,
    "--attempt-id", values.attemptId,
    "--job-id", jobId,
    "--authorization", values.authorization,
    "--authorization-digest", values.authorizationDigest,
    "--workspace", values.workspace,
    "--packet", values.packet,
    "--packet-digest", values.packetDigest,
    "--result-dir", values.resultDir,
  )
}

function fakeRunningJob(runsRoot: string, runId: string, unitId: string, packetContent: string, id = "job-live") {
  const dir = path.join(runsRoot, runId, "jobs", id)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(path.join(runsRoot, runId, "jobs"), 0o700)
  chmodSync(dir, 0o700)
  const digest = packetDigest(packetContent)
  const unitRoot = path.join(runsRoot, runId, "units", unitId)
  const meta = {
    job_id: id,
    skill: "ce-work",
    run_id: runId,
    label: unitId,
    input_digest: digest,
    result_path: path.join(unitRoot, "result", "implementation-result.json"),
    worker_argv: [ADAPTER, path.join(unitRoot, "authorization.json"), path.join(unitRoot, "workspace"), path.join(unitRoot, "packet.md"), digest, path.join(unitRoot, "result")],
  }
  for (const [name, value] of [
    ["meta.json", JSON.stringify(meta) + "\n"],
    ["pid", JSON.stringify({ supervisor_pid: 2_000_000_001, supervisor_pgid: 2_000_000_001, worker_pid: 2_000_000_002 }) + "\n"],
    ["out.log", "last known activity\n"],
  ]) {
    writeFileSync(path.join(dir, name), value as string, { mode: 0o600 })
    chmodSync(path.join(dir, name), 0o600)
  }
  return id
}

function terminalizeFakeJob(runsRoot: string, runId: string, id: string, state: "failed" | "timeout" | "died-without-result") {
  const dir = path.join(runsRoot, runId, "jobs", id)
  writeFileSync(path.join(dir, "status"), `${state}\n`, { mode: 0o600 })
  writeFileSync(path.join(dir, "reason"), `test ${state}\n`, { mode: 0o600 })
  chmodSync(path.join(dir, "status"), 0o600)
  chmodSync(path.join(dir, "reason"), 0o600)
}

function fakeDoneJob(
  runsRoot: string,
  runId: string,
  unitId: string,
  packetContent: string,
  id = "job-1",
  terminalStatus: "completed" | "blocked" | "scope_expansion" = "completed",
) {
  const dir = path.join(runsRoot, runId, "jobs", id)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(path.join(runsRoot, runId, "jobs"), 0o700)
  chmodSync(dir, 0o700)
  const digest = packetDigest(packetContent)
  const unitRoot = path.join(runsRoot, runId, "units", unitId)
  const resultDir = path.join(unitRoot, "result")
  const resultPath = path.join(resultDir, "implementation-result.json")
  const logPath = path.join(resultDir, "adapter.log")
  const meta = {
    job_id: id,
    skill: "ce-work",
    run_id: runId,
    label: unitId,
    input_digest: digest,
    result_path: resultPath,
    worker_argv: [ADAPTER, path.join(unitRoot, "authorization.json"), path.join(unitRoot, "workspace"), path.join(unitRoot, "packet.md"), digest, resultDir],
  }
  for (const [name, value] of [
    ["meta.json", JSON.stringify(meta) + "\n"],
    ["status", "done\n"],
    ["reason", "worker exited 0\n"],
    ["out.log", "activity\n"],
  ]) {
    writeFileSync(path.join(dir, name), value as string, { mode: 0o600 })
    chmodSync(path.join(dir, name), 0o600)
  }
  writeFileSync(logPath, "adapter activity\n", { mode: 0o600 })
  chmodSync(logPath, 0o600)
  writeFileSync(resultPath, `${JSON.stringify({
    schema_version: 1,
    terminal_status: terminalStatus,
    summary: "done",
    changed_files: [],
    evidence: ["fake"],
    scope_expansion: terminalStatus === "scope_expansion"
      ? { requested_paths: ["shared.ts"], reason: "required by unit" }
      : null,
    requested_route: "codex",
    actual_route: "codex",
    target: "codex",
    harness: "codex",
    intermediaries: [],
    model_requested: "auto",
    model_actual: "unverified",
    model_receipt_status: "unverified",
    activity_posture: "incremental",
    restriction_posture: "adapter-enforced",
    failure_reason: null,
    raw_log: logPath,
    packet_digest: digest,
  })}\n`, { mode: 0o600 })
  chmodSync(resultPath, 0o600)
  return id
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe("ce-work unit workspace controller", () => {
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

    for (const [index, model] of ["composer-2.5-fast", "grok-4.5", "cursor-grok-4.5-high", "rock@beta"].entries()) {
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
    expect(ctl(runs, "status", "--run-id", runId, "--unit-id", "U-prebound-pristine").body.unit.attempts[0].dispatch_authorization_receipt).toEqual({
      attempt_id: "attempt-1",
      job_id: pristineJob,
      authorization_path: pristine.authorization_path,
      authorization_digest: pristine.authorization_digest,
      workspace: pristine.workspace,
      packet_path: pristine.packet_path,
      packet_digest: pristine.packet_digest,
      result_dir: pristine.result_dir,
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

  test("unit and plan-wide verification restore existing ignored artifacts and clean new ones", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    writeFileSync(path.join(f.repo, ".git", "info", "exclude"), "*.verification-cache\n")
    writeFileSync(path.join(f.repo, "existing.verification-cache"), "preserve me\n")
    mkdirSync(path.join(f.repo, "pre-existing-empty"))
    init(runs, "run-ignored-verification", f)
    ctl(
      runs, "prepare", "--run-id", "run-ignored-verification", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    )
    const workspace = path.join(runs, "run-ignored-verification", "units", "U", "workspace")
    writeFileSync(path.join(workspace, "integrated.txt"), "integrated\n")
    const job = fakeDoneJob(runs, "run-ignored-verification", "U", "packet")
    ctl(
      runs, "record-job", "--run-id", "run-ignored-verification", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )
    ctl(runs, "terminalize", "--run-id", "run-ignored-verification", "--unit-id", "U")

    const integrated = ctl(
      runs, "integrate", "--run-id", "run-ignored-verification", "--unit-id", "U",
      "--commit-message", "feat(test): integrate ignored verification fixture",
      "--", "python3", "-c",
      "from pathlib import Path; Path('existing.verification-cache').write_text('mutated'); Path('unit-empty/sub').mkdir(parents=True); p = Path('unit-build/sub/unit.verification-cache'); p.parent.mkdir(parents=True); p.write_text('unit')",
    )
    expect(integrated.word).toBe("UNIT_COMMITTED")
    expect(integrated.body.cleaned_paths).toEqual([
      "existing.verification-cache",
      "unit-build",
      "unit-build/sub",
      "unit-build/sub/unit.verification-cache",
      "unit-empty",
      "unit-empty/sub",
    ])
    expect(existsSync(path.join(f.repo, "unit-build"))).toBe(false)
    expect(existsSync(path.join(f.repo, "unit-empty"))).toBe(false)
    expect(existsSync(path.join(f.repo, "pre-existing-empty"))).toBe(true)
    expect(readFileSync(path.join(f.repo, "existing.verification-cache"), "utf8")).toBe("preserve me\n")

    const verified = ctl(
      runs, "verify-run", "--run-id", "run-ignored-verification",
      "--verification-summary", "ignored plan artifact cleanup",
      "--", "python3", "-c",
      "from pathlib import Path; Path('existing.verification-cache').unlink(); Path('plan-empty/sub').mkdir(parents=True); p = Path('plan-build/sub/plan.verification-cache'); p.parent.mkdir(parents=True); p.write_text('plan')",
    )
    expect(verified.word).toBe("RUN_VERIFIED")
    expect(verified.body.cleaned_paths).toEqual([
      "existing.verification-cache",
      "plan-build",
      "plan-build/sub",
      "plan-build/sub/plan.verification-cache",
      "plan-empty",
      "plan-empty/sub",
    ])
    expect(existsSync(path.join(f.repo, "plan-build"))).toBe(false)
    expect(existsSync(path.join(f.repo, "plan-empty"))).toBe(false)
    expect(existsSync(path.join(f.repo, "pre-existing-empty"))).toBe(true)
    expect(readFileSync(path.join(f.repo, "existing.verification-cache"), "utf8")).toBe("preserve me\n")
    expect(ctl(runs, "status", "--run-id", "run-ignored-verification").body.verifications.at(-1)).toMatchObject({
      verification_exit: 0,
      cleaned_paths: [
        "existing.verification-cache",
        "plan-build",
        "plan-build/sub",
        "plan-build/sub/plan.verification-cache",
        "plan-empty",
        "plan-empty/sub",
      ],
    })

    const failedPlan = ctl(
      runs, "verify-run", "--run-id", "run-ignored-verification",
      "--verification-summary", "failed ignored plan artifact cleanup",
      "--", "python3", "-c",
      "from pathlib import Path; Path('existing.verification-cache').write_text('mutated again'); Path('keep.txt').write_text('tracked mutation'); raise SystemExit(9)",
    )
    expect(failedPlan.word).toBe("BLOCKED")
    expect(failedPlan.body).toMatchObject({
      verification_exit: 9,
      cleaned_paths: ["existing.verification-cache", "keep.txt"],
    })
    expect(readFileSync(path.join(f.repo, "existing.verification-cache"), "utf8")).toBe("preserve me\n")
    expect(readFileSync(path.join(f.repo, "keep.txt"), "utf8")).toBe("keep\n")
  })

  test("refuses ignored snapshots over deterministic entry or byte bounds before verification", () => {
    const cases: Array<[string, (repo: string) => void]> = [
      ["bytes", (repo) => {
        const oversized = path.join(repo, "oversized.verification-cache")
        writeFileSync(oversized, "")
        truncateSync(oversized, 64 * 1024 * 1024 + 1)
      }],
      ["entries", (repo) => {
        const cache = path.join(repo, "many-ignored")
        mkdirSync(cache)
        for (let index = 0; index < 513; index += 1) {
          writeFileSync(path.join(cache, `${index.toString().padStart(4, "0")}.verification-cache`), "x")
        }
      }],
    ]

    for (const [limit, populate] of cases) {
      const f = makeRepo()
      const runs = path.join(tmp("ce-work-runs-"), "ce-work")
      const runId = `run-ignored-limit-${limit}`
      writeFileSync(path.join(f.repo, ".git", "info", "exclude"), "*.verification-cache\n")
      populate(f.repo)
      init(runs, runId, f)
      ctl(
        runs, "prepare", "--run-id", runId, "--unit-id", "U",
        "--base", f.base, "--packet", packetFile("packet"),
      )
      const workspace = path.join(runs, runId, "units", "U", "workspace")
      writeFileSync(path.join(workspace, "integrated.txt"), "integrated\n")
      const job = fakeDoneJob(runs, runId, "U", "packet")
      ctl(
        runs, "record-job", "--run-id", runId, "--unit-id", "U",
        "--attempt-id", "attempt-1", "--job-id", job,
      )
      ctl(runs, "terminalize", "--run-id", runId, "--unit-id", "U")
      const marker = path.join(tmp("ce-work-verification-marker-"), "ran")

      const refused = ctl(
        runs, "integrate", "--run-id", runId, "--unit-id", "U",
        "--commit-message", "feat(test): verification must not run",
        "--", "python3", "-c",
        `from pathlib import Path; Path(${JSON.stringify(marker)}).write_text('ran')`,
      )
      expect(refused.word).toBe("REFUSED")
      expect(refused.stderr).toContain("ignored artifact snapshot exceeds")
      expect(existsSync(marker)).toBe(false)
      const resultDir = path.join(runs, runId, "units", "U", "result")
      expect(readdirSync(resultDir).some((name) => name.startsWith("ignored-snapshot-"))).toBe(false)
    }
  })

  test("failed unit verification reports and removes its new ignored artifact", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    writeFileSync(path.join(f.repo, ".git", "info", "exclude"), "*.verification-cache\n")
    writeFileSync(path.join(f.repo, "existing.verification-cache"), "preserve me\n")
    init(runs, "run-ignored-verification-failure", f)
    ctl(
      runs, "prepare", "--run-id", "run-ignored-verification-failure", "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    )
    const workspace = path.join(runs, "run-ignored-verification-failure", "units", "U", "workspace")
    writeFileSync(path.join(workspace, "integrated.txt"), "integrated\n")
    const job = fakeDoneJob(runs, "run-ignored-verification-failure", "U", "packet")
    ctl(
      runs, "record-job", "--run-id", "run-ignored-verification-failure", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", job,
    )
    ctl(runs, "terminalize", "--run-id", "run-ignored-verification-failure", "--unit-id", "U")

    const failed = ctl(
      runs, "integrate", "--run-id", "run-ignored-verification-failure", "--unit-id", "U",
      "--commit-message", "feat(test): integration must not commit",
      "--", "python3", "-c",
      "from pathlib import Path; Path('existing.verification-cache').write_text('mutated'); Path('failed.verification-cache').write_text('failed'); raise SystemExit(7)",
    )
    expect(failed.word).toBe("BLOCKED")
    expect(failed.body).toMatchObject({
      verification_exit: 7,
      canonical_state_changed: false,
      cleaned_paths: ["existing.verification-cache", "failed.verification-cache"],
    })
    expect(existsSync(path.join(f.repo, "failed.verification-cache"))).toBe(false)
    expect(readFileSync(path.join(f.repo, "existing.verification-cache"), "utf8")).toBe("preserve me\n")
    expect(git(f.repo, "rev-parse", "HEAD")).toBe(f.base)
    expect(git(f.repo, "status", "--porcelain")).toBe("")
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
    expect(ctl(runs, "cleanup", "--run-id", "run-crash", "--unit-id", "U", "--abandon", "--expect-transport", commit).word).toBe("CLEANED")
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

function worktreePaths(repo: string): string[] {
  const out = git(repo, "worktree", "list", "--porcelain")
  return out.split("\n").filter((line) => line.startsWith("worktree ")).map((line) => path.resolve(line.slice(9)))
}
