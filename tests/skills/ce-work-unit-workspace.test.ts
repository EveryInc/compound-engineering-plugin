import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  statSync,
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

function makeRepo(): { repo: string; plan: string; digest: string; base: string } {
  const repo = path.join(tmp("ce-work-repo-"), "repo")
  mkdirSync(repo)
  git(repo, "init", "-b", "main")
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
  const r = spawnSync("python3", [SCRIPT, ...args], {
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
    ...overrides,
  }
  const jobId = `job-auth-${Math.random().toString(16).slice(2)}`
  const jobDir = path.join(runsRoot, runId, "jobs", jobId)
  mkdirSync(jobDir, { mode: 0o700 })
  chmodSync(jobDir, 0o700)
  writeFileSync(path.join(jobDir, "meta.json"), `${JSON.stringify({
    job_id: jobId,
    skill: "ce-work",
    run_id: values.runId,
    label: values.unitId,
    input_digest: values.packetDigest,
    worker_argv: [ADAPTER, values.authorization, values.workspace, values.packet, values.packetDigest, values.resultDir],
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

function fakeDoneJob(runsRoot: string, runId: string, unitId: string, packetContent: string, id = "job-1") {
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
    terminal_status: "completed",
    summary: "done",
    changed_files: [],
    evidence: ["fake"],
    scope_expansion: null,
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

  test("creates private durable state and rejects unsafe identity or mode", () => {
    const f = makeRepo()
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const good = init(runs, "run-1", f)
    expect(good.code).toBe(0)
    expect(good.word).toBe("READY")
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
    writeFileSync(resultPath, `${JSON.stringify(result)}\n`, { mode: 0o600 })
    chmodSync(resultPath, 0o600)
    const blocked = ctl(runs, "terminalize", "--run-id", "run-authority", "--unit-id", "U")
    expect(blocked.word).toBe("BLOCKED")
    expect(blocked.body.mismatches.actual_route).toEqual({ expected: "codex", actual: "claude" })
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
  }, 20000)

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
  }, 20000)

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
  }, 20000)

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
  }, 20000)

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
  }, 20000)

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
  }, 20000)

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
  }, 20000)

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
  }, 20000)

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
  }, 20000)

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
  }, 25000)

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
    expect(ctl(
      runs, "verify-run", "--run-id", "run-committed",
      "--verification-summary", "plan-wide gate passed",
      "--", "python3", "-c", "raise SystemExit(0)",
    ).word).toBe("RUN_VERIFIED")
    expect(ctl(runs, "resume", "--repo", f.repo, "--plan-digest", f.digest).word).toBe("NOT_FOUND")
    expect(ctl(runs, "resume", "--run-id", "run-committed").body.actions).toEqual([])
  }, 20000)

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
    const token = ctl(runs, "integration-acquire", "--run-id", "run-restore", "--unit-id", "U").body.lock_token
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
  }, 25000)
})

function worktreePaths(repo: string): string[] {
  const out = git(repo, "worktree", "list", "--porcelain")
  return out.split("\n").filter((line) => line.startsWith("worktree ")).map((line) => path.resolve(line.slice(9)))
}
