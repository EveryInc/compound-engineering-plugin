import { afterEach } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  statSync,
  truncateSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"


export const SCRIPT = path.join(__dirname, "../../../skills/ce-work/scripts/unit-workspace.py")
export const ADAPTER = path.join(__dirname, "../../../skills/ce-work/scripts/cross-model-work.sh")
const roots: string[] = []

export function tmp(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix))
  roots.push(root)
  return root
}

export function sh(cwd: string, argv: string[], check = true) {
  const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: "utf8" })
  if (check && r.status !== 0) throw new Error(`${argv.join(" ")}\n${r.stderr}`)
  return r
}

export function git(cwd: string, ...args: string[]): string {
  return sh(cwd, ["git", ...args]).stdout.trim()
}

export function makeRepo(objectFormat: "sha1" | "sha256" = "sha1"): { repo: string; plan: string; digest: string; base: string } {
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

export function packetFile(content: string): string {
  const packet = path.join(tmp("ce-work-packet-"), "unit.md")
  writeFileSync(packet, content, { mode: 0o600 })
  return packet
}

export function packetDigest(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}

export function ctl(runsRoot: string, ...args: string[]) {
  return ctlWithEnv(runsRoot, {}, ...args)
}

export function ctlWithEnv(runsRoot: string, extraEnv: Record<string, string>, ...args: string[]) {
  return ctlWithScriptAndEnv(SCRIPT, runsRoot, extraEnv, ...args)
}

export function ctlWithScript(script: string, runsRoot: string, ...args: string[]) {
  return ctlWithScriptAndEnv(script, runsRoot, {}, ...args)
}

export function ctlWithScriptAndEnv(script: string, runsRoot: string, extraEnv: Record<string, string>, ...args: string[]) {
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

export function ownerRootProbe(ownerRoot: string, runsRoot: string, foreignLike = false) {
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

export function init(runsRoot: string, runId: string, fixture: ReturnType<typeof makeRepo>) {
  return initWithBinding(runsRoot, runId, fixture, "prefer")
}

export function initWithBinding(
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

export function initWithPrompt(
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

export function authorizeDispatch(
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

export function fakeRunningJob(runsRoot: string, runId: string, unitId: string, packetContent: string, id = "job-live") {
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

export function terminalizeFakeJob(runsRoot: string, runId: string, id: string, state: "failed" | "timeout" | "died-without-result") {
  const dir = path.join(runsRoot, runId, "jobs", id)
  writeFileSync(path.join(dir, "status"), `${state}\n`, { mode: 0o600 })
  writeFileSync(path.join(dir, "reason"), `test ${state}\n`, { mode: 0o600 })
  chmodSync(path.join(dir, "status"), 0o600)
  chmodSync(path.join(dir, "reason"), 0o600)
}

export function fakeDoneJob(
  runsRoot: string,
  runId: string,
  unitId: string,
  packetContent: string,
  id = "job-1",
  terminalStatus: "completed" | "blocked" | "scope_expansion" = "completed",
  changedFiles: string[] = [],
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
    changed_files: changedFiles,
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

export function registerWorkspaceCleanup(): void {
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })
}

export function worktreePaths(repo: string): string[] {
  const out = git(repo, "worktree", "list", "--porcelain")
  return out.split("\n").filter((line) => line.startsWith("worktree ")).map((line) => path.resolve(line.slice(9)))
}

/**
 * Seeds a node_modules-shaped ignored inventory: >512 regular files (~1 MiB
 * total), a `.bin/` directory of shim symlinks, and one hardlink pair —
 * mirroring the warm-checkout shape describe in the cross-model plan (U5).
 */
export function seedWarmCheckoutFixture(repo: string, fileCount = 520, fileSizeBytes = 2000) {
  writeFileSync(path.join(repo, ".git", "info", "exclude"), "node_modules/\n")
  const nodeModules = path.join(repo, "node_modules")
  const bin = path.join(nodeModules, ".bin")
  mkdirSync(bin, { recursive: true })
  const content = "x".repeat(fileSizeBytes)
  const files: string[] = []
  for (let index = 0; index < fileCount; index += 1) {
    const name = `pkg-${index.toString().padStart(4, "0")}.js`
    const filePath = path.join(nodeModules, name)
    writeFileSync(filePath, content)
    files.push(filePath)
  }
  symlinkSync(path.join("..", "pkg-0000.js"), path.join(bin, "tool-a"))
  symlinkSync(path.join("..", "pkg-0001.js"), path.join(bin, "tool-b"))
  linkSync(files[2], path.join(nodeModules, "pkg-hardlink.js"))
  return { nodeModules, bin, files }
}
