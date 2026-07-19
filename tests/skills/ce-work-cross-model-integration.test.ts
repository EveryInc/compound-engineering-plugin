import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const CONTROLLER = path.join(process.cwd(), "skills/ce-work/scripts/unit-workspace.py")
const RUNNER = path.join(process.cwd(), "skills/ce-work/scripts/peer-job-runner.py")
const ADAPTER = path.join(process.cwd(), "skills/ce-work/scripts/cross-model-work.sh")
const roots: string[] = []

setDefaultTimeout(30_000)

function temp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  roots.push(dir)
  return dir
}

function run(cwd: string, argv: string[], env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(argv[0], argv.slice(1), { cwd, env, encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(`${argv.join(" ")}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`)
  }
  return result.stdout.trim()
}

function git(repo: string, ...args: string[]): string {
  return run(repo, ["git", ...args])
}

function packetFile(content: string): string {
  const packet = path.join(temp("ce-work-packet-"), "unit.md")
  writeFileSync(packet, content, { mode: 0o600 })
  return packet
}

function control(runs: string, ...args: string[]) {
  const stdout = run(process.cwd(), ["python3", CONTROLLER, ...args], {
    ...process.env,
    CE_WORK_RUNS_ROOT: runs,
    CE_PEER_JOBS_ROOT: path.dirname(runs),
  })
  const [word, ...body] = stdout.split("\n")
  return { word, body: JSON.parse(body.join("\n")) }
}

function controlFailure(runs: string, ...args: string[]) {
  const result = spawnSync("python3", [CONTROLLER, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CE_WORK_RUNS_ROOT: runs,
      CE_PEER_JOBS_ROOT: path.dirname(runs),
    },
    encoding: "utf8",
  })
  const [word, ...body] = result.stdout.trim().split("\n")
  return { status: result.status, word, body: body.length ? JSON.parse(body.join("\n")) : null, stderr: result.stderr }
}

function controlFailureWithEnv(runs: string, extraEnv: NodeJS.ProcessEnv, ...args: string[]) {
  const result = spawnSync("python3", [CONTROLLER, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CE_WORK_RUNS_ROOT: runs,
      CE_PEER_JOBS_ROOT: path.dirname(runs),
      ...extraEnv,
    },
    encoding: "utf8",
  })
  const [word, ...body] = result.stdout.trim().split("\n")
  return { status: result.status, word, body: body.length ? JSON.parse(body.join("\n")) : null, stderr: result.stderr }
}

function fakeDoneJob(runs: string, runId: string, unitId: string, packetContent: string, jobId: string) {
  const dir = path.join(runs, runId, "jobs", jobId)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(path.join(runs, runId, "jobs"), 0o700)
  chmodSync(dir, 0o700)
  const digest = createHash("sha256").update(packetContent).digest("hex")
  const unitRoot = path.join(runs, runId, "units", unitId)
  const resultDir = path.join(unitRoot, "result")
  const resultPath = path.join(resultDir, "implementation-result.json")
  const logPath = path.join(resultDir, "adapter.log")
  writeFileSync(path.join(dir, "meta.json"), `${JSON.stringify({
    job_id: jobId,
    skill: "ce-work",
    run_id: runId,
    label: unitId,
    input_digest: digest,
    result_path: resultPath,
    worker_argv: [ADAPTER, path.join(unitRoot, "authorization.json"), path.join(unitRoot, "workspace"), path.join(unitRoot, "packet.md"), digest, resultDir],
  })}\n`, { mode: 0o600 })
  writeFileSync(path.join(dir, "status"), "done\n", { mode: 0o600 })
  writeFileSync(path.join(dir, "reason"), "worker exited 0\n", { mode: 0o600 })
  writeFileSync(path.join(dir, "out.log"), "activity\n", { mode: 0o600 })
  writeFileSync(logPath, "activity\n", { mode: 0o600 })
  writeFileSync(resultPath, `${JSON.stringify({
    schema_version: 1, terminal_status: "completed", summary: "done", changed_files: [], evidence: ["fake"], scope_expansion: null,
    requested_route: "codex", actual_route: "codex", target: "codex", harness: "codex", intermediaries: [],
    model_requested: "auto", model_actual: "unverified", model_receipt_status: "unverified", activity_posture: "incremental",
    restriction_posture: "adapter-enforced", failure_reason: null, raw_log: logPath, packet_digest: digest,
  })}\n`, { mode: 0o600 })
  return jobId
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe("ce-work serial cross-model transaction", () => {
  test("scope expansion remains a successful detached result for host inspection", () => {
    const root = temp("ce-work-scope-expansion-")
    const repo = path.join(root, "repo")
    const peerRoot = path.join(root, "jobs")
    const runs = path.join(peerRoot, "ce-work")
    mkdirSync(repo)
    git(repo, "init", "-b", "main")
    git(repo, "config", "user.name", "CE Work Host")
    git(repo, "config", "user.email", "host@example.test")
    mkdirSync(path.join(repo, "docs", "plans"), { recursive: true })
    const plan = path.join(repo, "docs", "plans", "plan.md")
    writeFileSync(plan, "# Plan\n")
    writeFileSync(path.join(repo, "seed.txt"), "seed\n")
    git(repo, "add", ".")
    git(repo, "commit", "-m", "seed")
    const base = git(repo, "rev-parse", "HEAD")
    const planDigest = createHash("sha256").update(readFileSync(plan)).digest("hex")

    expect(control(
      runs,
      "init",
      "--run-id", "scope-run",
      "--repo", repo,
      "--plan", plan,
      "--plan-digest", planDigest,
      "--binding-json", '{"mode":"prefer","target":"codex","model":null,"source":"test"}',
      "--egress-json", '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["U-scope"],"restrictions":[]}',
    ).word).toBe("READY")

    const prepared = control(
      runs,
      "prepare",
      "--run-id", "scope-run",
      "--unit-id", "U-scope",
      "--base", base,
      "--packet", packetFile("U-scope packet"),
      "--attempt-id", "attempt-1",
      "--activity-posture", "incremental",
    ).body
    const resultPath = path.join(prepared.result_dir, "implementation-result.json")

    const fakeBin = path.join(root, "fake-bin")
    mkdirSync(fakeBin)
    writeFileSync(path.join(fakeBin, "codex"), `#!/bin/sh
set -eu
result=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then result="$2"; shift 2; continue; fi
  shift
done
printf '%s\n' '{"terminal_status":"scope_expansion","summary":"shared contract needed","changed_files":[],"evidence":[],"scope_expansion":{"requested_paths":["shared.ts"],"reason":"required by unit"}}' > "$result"
`)
    chmodSync(path.join(fakeBin, "codex"), 0o755)

    const jobId = run(repo, [
      "python3", RUNNER, "start",
      "--skill", "ce-work",
      "--run-id", "scope-run",
      "--label", "U-scope",
      "--input-digest", prepared.packet_digest,
      "--result-path", resultPath,
      "--no-sweep",
      "--", ADAPTER, prepared.authorization_path, prepared.workspace, prepared.packet_path,
      prepared.packet_digest, prepared.result_dir,
    ], {
      ...process.env,
      CE_PEER_JOBS_ROOT: peerRoot,
      CE_WORK_RUNS_ROOT: runs,
      PATH: `${fakeBin}:${process.env.PATH}`,
      CE_PEER_POLL_SECS: "0.1",
      CE_PEER_IDLE_SECS: "10",
      CE_PEER_HARD_SECS: "30",
    })
    expect(control(
      runs,
      "record-job",
      "--run-id", "scope-run",
      "--unit-id", "U-scope",
      "--attempt-id", "attempt-1",
      "--job-id", jobId,
    ).word).toBe("AUTHORING")

    expect(run(repo, [
      "python3", RUNNER, "wait", "--skill", "ce-work", "--max-secs", "30", jobId,
    ], { ...process.env, CE_PEER_JOBS_ROOT: peerRoot })).toBe("done")
    expect(control(runs, "sync-job", "--run-id", "scope-run", "--unit-id", "U-scope").body.process_state).toBe("done")
    expect(control(runs, "terminalize", "--run-id", "scope-run", "--unit-id", "U-scope").word).toBe("INTEGRATION_PENDING")

    const status = control(runs, "status", "--run-id", "scope-run", "--unit-id", "U-scope").body.unit
    expect(status.attempts[0].terminal_receipt).toMatchObject({
      requested_route: "codex",
      actual_route: "codex",
      packet_digest: prepared.packet_digest,
      terminal_status: "scope_expansion",
      scope_expansion_requested: true,
    })
    expect(JSON.parse(readFileSync(resultPath, "utf8")).scope_expansion).toEqual({
      requested_paths: ["shared.ts"],
      reason: "required by unit",
    })
  }, 30_000)

  test("structured receipts redact secrets before JSON encoding", () => {
    const root = temp("ce-work-structured-redaction-")
    const repo = path.join(root, "repo")
    const peerRoot = path.join(root, "jobs")
    const runs = path.join(peerRoot, "ce-work")
    mkdirSync(repo)
    git(repo, "init", "-b", "main")
    git(repo, "config", "user.name", "CE Work Host")
    git(repo, "config", "user.email", "host@example.test")
    mkdirSync(path.join(repo, "docs", "plans"), { recursive: true })
    const plan = path.join(repo, "docs", "plans", "plan.md")
    writeFileSync(plan, "# Plan\n")
    git(repo, "add", ".")
    git(repo, "commit", "-m", "seed")
    const base = git(repo, "rev-parse", "HEAD")
    const planDigest = createHash("sha256").update(readFileSync(plan)).digest("hex")

    expect(control(
      runs,
      "init",
      "--run-id", "redaction-run",
      "--repo", repo,
      "--plan", plan,
      "--plan-digest", planDigest,
      "--binding-json", '{"mode":"prefer","target":"codex","model":null,"source":"test"}',
      "--egress-json", '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["U-redact"],"restrictions":[]}',
    ).word).toBe("READY")

    const prepared = control(
      runs,
      "prepare",
      "--run-id", "redaction-run",
      "--unit-id", "U-redact",
      "--base", base,
      "--packet", packetFile("U-redact packet"),
      "--attempt-id", "attempt-1",
      "--activity-posture", "incremental",
    ).body
    const resultPath = path.join(prepared.result_dir, "implementation-result.json")
    const secrets = {
      summary: 'quote"secret',
      evidence: "slash\\secret",
      scope: "café-secret",
    }
    const redactionFile = path.join(root, "redactions.txt")
    writeFileSync(redactionFile, `${Object.values(secrets).join("\n")}\n`, { mode: 0o600 })

    const fakeBin = path.join(root, "fake-bin")
    mkdirSync(fakeBin)
    writeFileSync(path.join(fakeBin, "codex"), `#!/bin/sh
set -eu
result=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then result="$2"; shift 2; continue; fi
  shift
done
printf '%s\n' '${JSON.stringify({ type: "init", model: secrets.summary })}'
printf '%s\n' '${JSON.stringify({
  terminal_status: "scope_expansion",
  summary: `summary ${secrets.summary} end`,
  changed_files: [`src/${secrets.evidence}.ts`],
  evidence: [`evidence ${secrets.evidence} end`],
  scope_expansion: {
    requested_paths: [`src/${secrets.scope}.ts`],
    reason: `needs ${secrets.scope}`,
  },
})}' > "$result"
`)
    chmodSync(path.join(fakeBin, "codex"), 0o755)

    const jobId = run(repo, [
      "python3", RUNNER, "start",
      "--skill", "ce-work",
      "--run-id", "redaction-run",
      "--label", "U-redact",
      "--input-digest", prepared.packet_digest,
      "--result-path", resultPath,
      "--no-sweep",
      "--", ADAPTER, prepared.authorization_path, prepared.workspace, prepared.packet_path,
      prepared.packet_digest, prepared.result_dir,
    ], {
      ...process.env,
      CE_PEER_JOBS_ROOT: peerRoot,
      CE_WORK_RUNS_ROOT: runs,
      CE_WORK_REDACT_FILE: redactionFile,
      PATH: `${fakeBin}:${process.env.PATH}`,
      CE_PEER_POLL_SECS: "0.1",
      CE_PEER_IDLE_SECS: "10",
      CE_PEER_HARD_SECS: "30",
    })
    expect(control(
      runs,
      "record-job",
      "--run-id", "redaction-run",
      "--unit-id", "U-redact",
      "--attempt-id", "attempt-1",
      "--job-id", jobId,
    ).word).toBe("AUTHORING")
    expect(run(repo, [
      "python3", RUNNER, "wait", "--skill", "ce-work", "--max-secs", "30", jobId,
    ], { ...process.env, CE_PEER_JOBS_ROOT: peerRoot })).toBe("done")

    const serialized = readFileSync(resultPath, "utf8")
    const receipt = JSON.parse(serialized)
    expect(receipt).toMatchObject({
      summary: "summary [REDACTED] end",
      changed_files: ["src/[REDACTED].ts"],
      evidence: ["evidence [REDACTED] end"],
      scope_expansion: {
        requested_paths: ["src/[REDACTED].ts"],
        reason: "needs [REDACTED]",
      },
      model_actual: "[REDACTED]",
    })
    for (const secret of Object.values(secrets)) expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain(JSON.stringify(secrets.summary).slice(1, -1))
    expect(serialized).not.toContain(JSON.stringify(secrets.evidence).slice(1, -1))
    expect(serialized).not.toContain("caf\\u00e9-secret")
    expect(serialized.match(/\[REDACTED\]/g)).toHaveLength(6)
  }, 30_000)

  test("missing fixed-route CLI records an authoritative unavailable receipt for fallback disclosure", () => {
    const root = temp("ce-work-unavailable-")
    const repo = path.join(root, "repo")
    const peerRoot = path.join(root, "jobs")
    const runs = path.join(peerRoot, "ce-work")
    mkdirSync(repo)
    git(repo, "init", "-b", "main")
    git(repo, "config", "user.name", "CE Work Host")
    git(repo, "config", "user.email", "host@example.test")
    mkdirSync(path.join(repo, "docs", "plans"), { recursive: true })
    const plan = path.join(repo, "docs", "plans", "plan.md")
    writeFileSync(plan, "# Plan\n")
    git(repo, "add", ".")
    git(repo, "commit", "-m", "seed")
    const base = git(repo, "rev-parse", "HEAD")
    const planDigest = createHash("sha256").update(readFileSync(plan)).digest("hex")

    expect(control(
      runs,
      "init",
      "--run-id", "unavailable-run",
      "--repo", repo,
      "--plan", plan,
      "--plan-digest", planDigest,
      "--binding-json", '{"mode":"prefer","target":"codex","model":null,"source":"test"}',
      "--egress-json", '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["U"],"restrictions":[]}',
    ).word).toBe("READY")
    const prepared = control(
      runs, "prepare", "--run-id", "unavailable-run", "--unit-id", "U",
      "--base", base, "--packet", packetFile("unavailable packet"),
    ).body
    const limitedPath = "/usr/bin:/bin"
    const runnerEnv = {
      ...process.env,
      CE_PEER_JOBS_ROOT: peerRoot,
      CE_WORK_RUNS_ROOT: runs,
      PATH: limitedPath,
      CE_PEER_POLL_SECS: "0.1",
      CE_PEER_IDLE_SECS: "10",
      CE_PEER_HARD_SECS: "30",
    }
    const jobId = run(repo, [
      "python3", RUNNER, "start",
      "--skill", "ce-work",
      "--run-id", "unavailable-run",
      "--label", "U",
      "--input-digest", prepared.packet_digest,
      "--result-path", path.join(prepared.result_dir, "implementation-result.json"),
      "--no-sweep",
      "--", ADAPTER, prepared.authorization_path, prepared.workspace, prepared.packet_path,
      prepared.packet_digest, prepared.result_dir,
    ], runnerEnv)
    expect(control(
      runs, "record-job", "--run-id", "unavailable-run", "--unit-id", "U",
      "--attempt-id", "attempt-1", "--job-id", jobId,
    ).word).toBe("AUTHORING")
    expect(run(repo, [
      "python3", RUNNER, "wait", "--skill", "ce-work", "--max-secs", "30", jobId,
    ], runnerEnv)).toBe("failed")

    const synced = control(runs, "sync-job", "--run-id", "unavailable-run", "--unit-id", "U")
    expect(synced.body.process_state).toBe("failed")
    const status = control(runs, "status", "--run-id", "unavailable-run", "--unit-id", "U").body.unit
    expect(status.state).toBe("authoring")
    expect(status.transport.commit).toBeNull()
    expect(status.attempts[0].terminal_receipt).toMatchObject({
      terminal_status: "unavailable",
      requested_route: "codex",
      actual_route: null,
      failure_reason: "fixed route executable 'codex' is unavailable",
      packet_digest: prepared.packet_digest,
    })
    const terminal = controlFailure(runs, "terminalize", "--run-id", "unavailable-run", "--unit-id", "U")
    expect(terminal.word).toBe("BLOCKED")
    expect(terminal.body.failure_reason).toBe("fixed route executable 'codex' is unavailable")

    const fallback = control(
      runs, "claim-fallback", "--run-id", "unavailable-run", "--unit-id", "U", "--caller-mode", "headless",
    )
    expect(fallback.word).toBe("FALLBACK_AUTHORIZED")
    expect(fallback.body.reason).toBe("fixed route executable 'codex' is unavailable")

    const spoofed = control(
      runs, "prepare", "--run-id", "unavailable-run", "--unit-id", "U-spoofed",
      "--base", base, "--packet", packetFile("spoofed packet"),
    ).body
    const spoofedJob = fakeDoneJob(runs, "unavailable-run", "U-spoofed", "spoofed packet", "job-spoofed")
    const spoofedJobDir = path.join(runs, "unavailable-run", "jobs", spoofedJob)
    writeFileSync(path.join(spoofedJobDir, "status"), "failed\n", { mode: 0o600 })
    writeFileSync(path.join(spoofedJobDir, "reason"), "worker exited 2\n", { mode: 0o600 })
    const spoofedLog = path.join(spoofed.result_dir, "adapter.log")
    writeFileSync(path.join(spoofed.result_dir, "implementation-result.json"), `${JSON.stringify({
      schema_version: 1,
      terminal_status: "unavailable",
      summary: "External route unavailable",
      changed_files: [],
      evidence: [],
      scope_expansion: null,
      requested_route: "codex",
      actual_route: null,
      target: "codex",
      harness: "codex",
      intermediaries: [],
      model_requested: "auto",
      model_actual: "unverified",
      model_receipt_status: "unverified",
      activity_posture: "hard-only",
      restriction_posture: "adapter-enforced",
      failure_reason: "spoofed unavailable reason",
      raw_log: spoofedLog,
      packet_digest: spoofed.packet_digest,
    })}\n`, { mode: 0o600 })
    expect(control(
      runs, "record-job", "--run-id", "unavailable-run", "--unit-id", "U-spoofed",
      "--attempt-id", "attempt-1", "--job-id", spoofedJob,
    ).word).toBe("AUTHORING")
    expect(control(
      runs, "sync-job", "--run-id", "unavailable-run", "--unit-id", "U-spoofed",
    ).body.process_state).toBe("failed")
    const spoofedStatus = control(
      runs, "status", "--run-id", "unavailable-run", "--unit-id", "U-spoofed",
    ).body.unit
    expect(spoofedStatus.attempts[0].dispatch_authorization_receipt).toBeNull()
    expect(spoofedStatus.attempts[0].terminal_receipt).toBeNull()
    expect(control(
      runs, "claim-fallback", "--run-id", "unavailable-run", "--unit-id", "U-spoofed", "--caller-mode", "headless",
    ).body.reason).toBe("failed")
  }, 30_000)

  test("controller-owned integration fail-stops verification and canonical commit", () => {
    const root = temp("ce-work-transaction-")
    const repo = path.join(root, "repo")
    const runs = path.join(root, "jobs", "ce-work")
    mkdirSync(repo)
    git(repo, "init", "-b", "main")
    git(repo, "config", "user.name", "CE Work Host")
    git(repo, "config", "user.email", "host@example.test")
    mkdirSync(path.join(repo, "docs", "plans"), { recursive: true })
    mkdirSync(path.join(repo, "tests"), { recursive: true })
    const plan = path.join(repo, "docs", "plans", "plan.md")
    writeFileSync(plan, "# Plan\n")
    writeFileSync(path.join(repo, "tests", "__init__.py"), "")
    writeFileSync(path.join(repo, "tests", "test_feature.py"), `import unittest

class FeatureTest(unittest.TestCase):
    def test_value(self):
        from feature import value
        self.assertEqual(value(), 42)
`)
    git(repo, "add", ".")
    git(repo, "commit", "-m", "seed")
    const base = git(repo, "rev-parse", "HEAD")
    const planDigest = createHash("sha256").update(readFileSync(plan)).digest("hex")

    expect(control(
      runs, "init", "--run-id", "transaction-run", "--repo", repo, "--plan", plan,
      "--plan-digest", planDigest,
      "--binding-json", '{"mode":"prefer","target":"codex","model":null,"source":"test"}',
      "--egress-json", '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["U1"],"restrictions":[]}',
    ).word).toBe("READY")
    const packet = "transaction packet"
    const prepared = control(
      runs, "prepare", "--run-id", "transaction-run", "--unit-id", "U1",
      "--base", base, "--packet", packetFile(packet),
    ).body
    writeFileSync(path.join(prepared.workspace, "feature.py"), "def value():\n    return 42\n")
    fakeDoneJob(runs, "transaction-run", "U1", packet, "job-transaction")
    expect(control(
      runs, "record-job", "--run-id", "transaction-run", "--unit-id", "U1",
      "--attempt-id", "attempt-1", "--job-id", "job-transaction",
    ).word).toBe("AUTHORING")
    expect(control(runs, "terminalize", "--run-id", "transaction-run", "--unit-id", "U1").word).toBe("INTEGRATION_PENDING")

    const hooks = path.join(path.resolve(repo, git(repo, "rev-parse", "--git-dir")), "hooks")
    mkdirSync(hooks, { recursive: true })
    writeFileSync(
      path.join(hooks, "pre-commit"),
      "#!/bin/sh\nprintf 'hook mutation\\n' > hook-generated.txt\ngit add hook-generated.txt\n",
      { mode: 0o755 },
    )

    const integrated = control(
      runs, "integrate", "--run-id", "transaction-run", "--unit-id", "U1",
      "--commit-message", "feat(test): integrate U1",
      "--verification-summary", "feature unit test passed",
      "--", "python3", "-m", "unittest", "tests.test_feature", "-q",
    )
    expect(integrated.word).toBe("UNIT_COMMITTED")
    expect(integrated.body.canonical_commit).toBe(git(repo, "rev-parse", "HEAD"))
    expect(git(repo, "status", "--porcelain")).toBe("")
    expect(git(repo, "show", "--format=", "--name-only", "HEAD")).not.toContain("hook-generated.txt")
    expect(control(runs, "status", "--run-id", "transaction-run", "--unit-id", "U1").body.unit.state).toBe("cleaned")
    expect(control(runs, "status", "--run-id", "transaction-run").body.integration_lock).toBeNull()

    const verified = control(
      runs, "verify-run", "--run-id", "transaction-run",
      "--verification-summary", "full suite passed",
      "--", "python3", "-c", "open('verification-cache.tmp','w').write('temporary')",
    )
    expect(verified.word).toBe("RUN_VERIFIED")
    expect(verified.body.verification_exit).toBe(0)
    expect(verified.body.cleaned_paths).toEqual(["verification-cache.tmp"])
    expect(git(repo, "status", "--porcelain")).toBe("")
    expect(control(runs, "status", "--run-id", "transaction-run").body).toMatchObject({
      integration_lock: null,
      verifications: [{ verification_exit: 0, verification_log_retained: false }],
    })

    const failedRunVerification = controlFailure(
      runs, "verify-run", "--run-id", "transaction-run",
      "--verification-summary", "full suite failed",
      "--", "python3", "-c", "open('failure-cache.tmp','w').write('temporary'); raise SystemExit(7)",
    )
    expect(failedRunVerification.word).toBe("BLOCKED")
    expect(failedRunVerification.body.verification_exit).toBe(7)
    expect(failedRunVerification.body.verification_log).toContain("run-verification-")
    expect(git(repo, "status", "--porcelain")).toBe("")
    expect(control(runs, "status", "--run-id", "transaction-run").body.integration_lock).toBeNull()

    const secondBase = git(repo, "rev-parse", "HEAD")
    const secondPacket = "post-commit recovery packet"
    const second = control(
      runs, "prepare", "--run-id", "transaction-run", "--unit-id", "U2",
      "--base", secondBase, "--packet", packetFile(secondPacket),
    ).body
    writeFileSync(path.join(second.workspace, "second.py"), "value = 2\n")
    fakeDoneJob(runs, "transaction-run", "U2", secondPacket, "job-transaction-2")
    control(
      runs, "record-job", "--run-id", "transaction-run", "--unit-id", "U2",
      "--attempt-id", "attempt-1", "--job-id", "job-transaction-2",
    )
    control(runs, "terminalize", "--run-id", "transaction-run", "--unit-id", "U2")
    const interruptedFinalization = controlFailureWithEnv(
      runs, { CE_WORK_TEST_FAULT: "after-canonical-commit-confirmed" },
      "integrate", "--run-id", "transaction-run", "--unit-id", "U2",
      "--commit-message", "feat(test): integrate U2",
      "--verification-summary", "second unit passed",
      "--", "python3", "-c", "raise SystemExit(0)",
    )
    expect(interruptedFinalization.word).toBe("BLOCKED")
    expect(interruptedFinalization.body.reason).toBe("canonical commit accepted but post-commit finalization is incomplete")
    expect(interruptedFinalization.body.retain_integration_lock).toBe(true)
    const acceptedHead = git(repo, "rev-parse", "HEAD")
    expect(control(runs, "status", "--run-id", "transaction-run").body).toMatchObject({
      integration_lock: { unit_id: "U2" },
      units: { U2: { state: "committed" } },
    })
    const resumed = control(runs, "resume", "--run-id", "transaction-run")
    expect(resumed.body.actions.map((action: any) => action.action)).toContain("committed-unit-finalized")
    expect(git(repo, "rev-parse", "HEAD")).toBe(acceptedHead)
    expect(control(runs, "status", "--run-id", "transaction-run").body).toMatchObject({
      integration_lock: null,
      units: { U2: { state: "cleaned" } },
    })
    expect(control(runs, "status", "--run-id", "transaction-run").body.blockers.at(-1).resolved_by).toBe("resume")
  })

  test("resume preserves the lock retained by an unresolved plan-wide verification blocker", () => {
    const root = temp("ce-work-run-verify-lock-")
    const repo = path.join(root, "repo")
    const runs = path.join(root, "jobs", "ce-work")
    mkdirSync(repo)
    git(repo, "init", "-b", "main")
    git(repo, "config", "user.name", "CE Work Host")
    git(repo, "config", "user.email", "host@example.test")
    mkdirSync(path.join(repo, "docs", "plans"), { recursive: true })
    const plan = path.join(repo, "docs", "plans", "plan.md")
    writeFileSync(plan, "# Plan\n")
    git(repo, "add", ".")
    git(repo, "commit", "-m", "seed")
    const base = git(repo, "rev-parse", "HEAD")
    const planDigest = createHash("sha256").update(readFileSync(plan)).digest("hex")

    control(
      runs, "init", "--run-id", "run-verify-lock", "--repo", repo, "--plan", plan,
      "--plan-digest", planDigest,
      "--binding-json", '{"mode":"prefer","target":"codex","model":null,"source":"test"}',
      "--egress-json", '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["U1"],"restrictions":[]}',
    )
    const packet = "plan-wide verification lock packet"
    const prepared = control(
      runs, "prepare", "--run-id", "run-verify-lock", "--unit-id", "U1",
      "--base", base, "--packet", packetFile(packet),
    ).body
    writeFileSync(path.join(prepared.workspace, "delegated.txt"), "delegated\n")
    fakeDoneJob(runs, "run-verify-lock", "U1", packet, "job-verify-lock")
    control(
      runs, "record-job", "--run-id", "run-verify-lock", "--unit-id", "U1",
      "--attempt-id", "attempt-1", "--job-id", "job-verify-lock",
    )
    control(
      runs, "terminalize", "--run-id", "run-verify-lock", "--unit-id", "U1",
    )
    control(
      runs, "integrate", "--run-id", "run-verify-lock", "--unit-id", "U1",
      "--commit-message", "feat(test): integrate retained-lock unit",
      "--verification-summary", "unit passed",
      "--", "python3", "-c", "raise SystemExit(0)",
    )

    const failed = controlFailure(
      runs, "verify-run", "--run-id", "run-verify-lock",
      "--verification-summary", "verification must not move HEAD",
      "--", "git", "commit", "--allow-empty", "-m", "verification moved HEAD",
    )
    expect(failed.word).toBe("BLOCKED")
    expect(failed.body.retain_integration_lock).toBe(true)
    const blocked = control(runs, "status", "--run-id", "run-verify-lock").body
    const retainedNonce = blocked.integration_lock.nonce
    expect(blocked.blockers.at(-1)).toMatchObject({
      unit_id: null,
      reason: "plan-wide verification changed canonical branch or HEAD",
      retain_integration_lock: true,
      integration_lock_nonce: retainedNonce,
    })

    const resumed = controlFailure(runs, "resume", "--run-id", "run-verify-lock")
    expect(resumed.word).toBe("BLOCKED")
    expect(resumed.body.retain_integration_lock).toBe(true)
    const afterResume = control(runs, "status", "--run-id", "run-verify-lock").body
    expect(afterResume.integration_lock.nonce).toBe(retainedNonce)
    expect(afterResume.blockers.at(-1).resolved_at).toBeUndefined()
  })

  test("plan-wide verification refuses an explicitly abandoned unit and leaves the run unfinished", () => {
    const root = temp("ce-work-run-verify-abandoned-")
    const repo = path.join(root, "repo")
    const runs = path.join(root, "jobs", "ce-work")
    mkdirSync(repo)
    git(repo, "init", "-b", "main")
    git(repo, "config", "user.name", "CE Work Host")
    git(repo, "config", "user.email", "host@example.test")
    mkdirSync(path.join(repo, "docs", "plans"), { recursive: true })
    const plan = path.join(repo, "docs", "plans", "plan.md")
    writeFileSync(plan, "# Plan\n")
    git(repo, "add", ".")
    git(repo, "commit", "-m", "seed")
    const base = git(repo, "rev-parse", "HEAD")
    const planDigest = createHash("sha256").update(readFileSync(plan)).digest("hex")

    control(
      runs, "init", "--run-id", "run-verify-abandoned", "--repo", repo, "--plan", plan,
      "--plan-digest", planDigest,
      "--binding-json", '{"mode":"prefer","target":"codex","model":null,"source":"test"}',
      "--egress-json", '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["U1"],"restrictions":[]}',
    )
    const packet = "abandoned plan-wide verification packet"
    const prepared = control(
      runs, "prepare", "--run-id", "run-verify-abandoned", "--unit-id", "U1",
      "--base", base, "--packet", packetFile(packet),
    ).body
    writeFileSync(path.join(prepared.workspace, "abandoned.txt"), "not integrated\n")
    fakeDoneJob(runs, "run-verify-abandoned", "U1", packet, "job-verify-abandoned")
    control(
      runs, "record-job", "--run-id", "run-verify-abandoned", "--unit-id", "U1",
      "--attempt-id", "attempt-1", "--job-id", "job-verify-abandoned",
    )
    const transport = control(
      runs, "terminalize", "--run-id", "run-verify-abandoned", "--unit-id", "U1",
    ).body.transport
    expect(control(
      runs, "cleanup", "--run-id", "run-verify-abandoned", "--unit-id", "U1",
      "--abandon", "--expect-transport", transport.commit,
    ).word).toBe("CLEANED")

    const rejected = controlFailure(
      runs, "verify-run", "--run-id", "run-verify-abandoned",
      "--verification-summary", "unchanged checkout passes",
      "--", "python3", "-c", "raise SystemExit(0)",
    )
    expect(rejected.word).toBe("REFUSED")
    expect(rejected.stderr).toContain("accepted canonical commit")
    expect(control(runs, "status", "--run-id", "run-verify-abandoned").body).toMatchObject({
      integration_lock: null,
      units: { U1: { state: "cleaned", integration: { canonical_commit: null } } },
      verifications: [],
    })
    const resumed = control(
      runs, "resume", "--repo", repo, "--plan-digest", planDigest,
    )
    expect(resumed.body.run_id).toBe("run-verify-abandoned")
    expect(resumed.body.actions).toEqual([])
  })

  test("controller-owned integration restores exactly when verification fails", () => {
    const root = temp("ce-work-transaction-fail-")
    const repo = path.join(root, "repo")
    const runs = path.join(root, "jobs", "ce-work")
    mkdirSync(repo)
    git(repo, "init", "-b", "main")
    git(repo, "config", "user.name", "CE Work Host")
    git(repo, "config", "user.email", "host@example.test")
    mkdirSync(path.join(repo, "docs", "plans"), { recursive: true })
    const plan = path.join(repo, "docs", "plans", "plan.md")
    writeFileSync(plan, "# Plan\n")
    git(repo, "add", ".")
    git(repo, "commit", "-m", "seed")
    const base = git(repo, "rev-parse", "HEAD")
    const planDigest = createHash("sha256").update(readFileSync(plan)).digest("hex")

    control(
      runs, "init", "--run-id", "transaction-fail", "--repo", repo, "--plan", plan,
      "--plan-digest", planDigest,
      "--binding-json", '{"mode":"prefer","target":"codex","model":null,"source":"test"}',
      "--egress-json", '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["U1"],"restrictions":[]}',
    )
    const packet = "failing transaction packet"
    const prepared = control(
      runs, "prepare", "--run-id", "transaction-fail", "--unit-id", "U1",
      "--base", base, "--packet", packetFile(packet),
    ).body
    writeFileSync(path.join(prepared.workspace, "feature.py"), "value = 42\n")
    fakeDoneJob(runs, "transaction-fail", "U1", packet, "job-transaction-fail")
    control(
      runs, "record-job", "--run-id", "transaction-fail", "--unit-id", "U1",
      "--attempt-id", "attempt-1", "--job-id", "job-transaction-fail",
    )
    const transport = control(runs, "terminalize", "--run-id", "transaction-fail", "--unit-id", "U1").body.transport

    const preApplyFailure = controlFailure(
      runs, "integrate", "--run-id", "transaction-fail", "--unit-id", "U1",
      "--commit-message", "feat(test): must not land",
      "--verification-summary", "must not run",
      "--allowed-head", transport.commit,
      "--", "python3", "-c", "raise SystemExit(0)",
    )
    expect(preApplyFailure.word).toBe("BLOCKED")
    expect(control(runs, "status", "--run-id", "transaction-fail").body).toMatchObject({
      integration_lock: null,
      units: { U1: { state: "integration-pending", integration: { pre_fold: null } } },
    })
    expect(git(repo, "status", "--porcelain")).toBe("")

    const failed = controlFailure(
      runs, "integrate", "--run-id", "transaction-fail", "--unit-id", "U1",
      "--commit-message", "feat(test): must not land",
      "--verification-summary", "expected failure",
      "--", "python3", "-c", "open('verification-dirt.txt','w').write('dirt'); raise SystemExit(7)",
    )
    expect(failed.status).not.toBe(0)
    expect(failed.word).toBe("BLOCKED")
    expect(failed.body, failed.stderr).not.toBeNull()
    expect(failed.body.verification_exit).toBe(7)
    expect(git(repo, "rev-parse", "HEAD")).toBe(base)
    expect(git(repo, "status", "--porcelain")).toBe("")
    const status = control(runs, "status", "--run-id", "transaction-fail").body
    expect(status.units.U1.state).toBe("preserved")
    expect(status.integration_lock).toBeNull()
  })

  test("controller-owned integration releases the lock after resumed exact restoration", () => {
    const root = temp("ce-work-transaction-restore-fail-")
    const repo = path.join(root, "repo")
    const runs = path.join(root, "jobs", "ce-work")
    mkdirSync(repo)
    git(repo, "init", "-b", "main")
    git(repo, "config", "user.name", "CE Work Host")
    git(repo, "config", "user.email", "host@example.test")
    mkdirSync(path.join(repo, "docs", "plans"), { recursive: true })
    const plan = path.join(repo, "docs", "plans", "plan.md")
    writeFileSync(plan, "# Plan\n")
    git(repo, "add", ".")
    git(repo, "commit", "-m", "seed")
    const base = git(repo, "rev-parse", "HEAD")
    const planDigest = createHash("sha256").update(readFileSync(plan)).digest("hex")

    control(
      runs, "init", "--run-id", "transaction-restore-fail", "--repo", repo, "--plan", plan,
      "--plan-digest", planDigest,
      "--binding-json", '{"mode":"prefer","target":"codex","model":null,"source":"test"}',
      "--egress-json", '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["U1"],"restrictions":[]}',
    )
    const packet = "restore failure packet"
    const prepared = control(
      runs, "prepare", "--run-id", "transaction-restore-fail", "--unit-id", "U1",
      "--base", base, "--packet", packetFile(packet),
    ).body
    writeFileSync(path.join(prepared.workspace, "feature.py"), "value = 42\n")
    fakeDoneJob(runs, "transaction-restore-fail", "U1", packet, "job-restore-fail")
    control(
      runs, "record-job", "--run-id", "transaction-restore-fail", "--unit-id", "U1",
      "--attempt-id", "attempt-1", "--job-id", "job-restore-fail",
    )
    control(runs, "terminalize", "--run-id", "transaction-restore-fail", "--unit-id", "U1")
    const failed = controlFailureWithEnv(
      runs, { CE_WORK_TEST_FAULT: "before-canonical-commit,restore-after-reset" },
      "integrate", "--run-id", "transaction-restore-fail", "--unit-id", "U1",
      "--commit-message", "feat(test): must not land",
      "--verification-summary", "verification passed before commit hook failure",
      "--", "python3", "-c", "raise SystemExit(0)",
    )
    expect(failed.word).toBe("BLOCKED")
    expect(failed.body.reason).toBe("integration failed and exact restoration could not be proven")
    expect(failed.body.retain_integration_lock).toBe(true)
    expect(failed.body.original_failure).toContain("before-canonical-commit")
    expect(failed.body.restore_failure).toContain("restore-after-reset")
    const status = control(runs, "status", "--run-id", "transaction-restore-fail").body
    expect(status.integration_lock).not.toBeNull()
    expect(status.units.U1.state).toBe("restoring")
    const resumed = control(runs, "resume", "--run-id", "transaction-restore-fail")
    expect(resumed.body.actions.map((action: any) => action.action)).toContain("restored")
    const recovered = control(runs, "status", "--run-id", "transaction-restore-fail").body
    expect(recovered.integration_lock).toBeNull()
    expect(recovered.units.U1.state).toBe("preserved")
    expect(recovered.blockers).toContainEqual(expect.objectContaining({
      reason: "integration failed and exact restoration could not be proven",
      resolved_by: "resume",
    }))
    expect(control(
      runs, "claim-fallback", "--run-id", "transaction-restore-fail", "--unit-id", "U1",
      "--caller-mode", "headless",
    ).word).toBe("FALLBACK_AUTHORIZED")
  })

  for (const interruptedState of ["integrated", "verified"] as const) {
    test(`resume restores interrupted pre-commit integration from ${interruptedState}`, () => {
      const root = temp(`ce-work-resume-${interruptedState}-`)
      const repo = path.join(root, "repo")
      const runs = path.join(root, "jobs", "ce-work")
      mkdirSync(repo)
      git(repo, "init", "-b", "main")
      git(repo, "config", "user.name", "CE Work Host")
      git(repo, "config", "user.email", "host@example.test")
      mkdirSync(path.join(repo, "docs", "plans"), { recursive: true })
      const plan = path.join(repo, "docs", "plans", "plan.md")
      writeFileSync(plan, "# Plan\n")
      git(repo, "add", ".")
      git(repo, "commit", "-m", "seed")
      const base = git(repo, "rev-parse", "HEAD")
      const planDigest = createHash("sha256").update(readFileSync(plan)).digest("hex")
      const runId = `resume-${interruptedState}`
      const packet = `${interruptedState} resume packet`

      control(
        runs, "init", "--run-id", runId, "--repo", repo, "--plan", plan,
        "--plan-digest", planDigest,
        "--binding-json", '{"mode":"prefer","target":"codex","model":null,"source":"test"}',
        "--egress-json", '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["U1"],"restrictions":[]}',
      )
      const prepared = control(
        runs, "prepare", "--run-id", runId, "--unit-id", "U1",
        "--base", base, "--packet", packetFile(packet),
      ).body
      writeFileSync(path.join(prepared.workspace, "delegated.txt"), "delegated\n")
      fakeDoneJob(runs, runId, "U1", packet, `job-${interruptedState}`)
      control(
        runs, "record-job", "--run-id", runId, "--unit-id", "U1",
        "--attempt-id", "attempt-1", "--job-id", `job-${interruptedState}`,
      )
      const transport = control(runs, "terminalize", "--run-id", runId, "--unit-id", "U1").body.transport
      const token = control(runs, "integration-acquire", "--run-id", runId, "--unit-id", "U1").body.lock_token
      control(runs, "preflight", "--run-id", runId, "--unit-id", "U1", "--lock-token", token)
      git(repo, "cherry-pick", "--no-commit", transport.commit)
      control(runs, "mark-applied", "--run-id", runId, "--unit-id", "U1", "--lock-token", token)
      if (interruptedState === "verified") {
        control(
          runs, "mark-verified", "--run-id", runId, "--unit-id", "U1", "--lock-token", token,
          "--evidence-digest", "verification-passed",
        )
      }

      expect(git(repo, "status", "--porcelain")).not.toBe("")
      const resumed = control(runs, "resume", "--run-id", runId)
      expect(resumed.body.actions).toContainEqual(expect.objectContaining({
        unit_id: "U1",
        action: "pre-commit-integration-restored",
        interrupted_state: interruptedState,
        canonical_preserved: true,
        integration_lock_released: true,
      }))
      expect(git(repo, "rev-parse", "HEAD")).toBe(base)
      expect(git(repo, "status", "--porcelain")).toBe("")
      expect(control(runs, "status", "--run-id", runId).body).toMatchObject({
        integration_lock: null,
        units: { U1: { state: "preserved", integration: { canonical_commit: null } } },
      })
    })
  }

  test("detached fake author terminalizes a complete delta that the host verifies and commits", () => {
    const root = temp("ce-work-integration-")
    const repo = path.join(root, "repo")
    const peerRoot = path.join(root, "jobs")
    const runs = path.join(peerRoot, "ce-work")
    mkdirSync(repo)
    git(repo, "init", "-b", "main")
    git(repo, "config", "user.name", "CE Work Host")
    git(repo, "config", "user.email", "host@example.test")
    mkdirSync(path.join(repo, "docs", "plans"), { recursive: true })
    writeFileSync(path.join(repo, "docs", "plans", "plan.md"), "# Plan\n")
    writeFileSync(path.join(repo, "existing.txt"), "before\n")
    writeFileSync(path.join(repo, "delete.txt"), "delete\n")
    git(repo, "add", ".")
    git(repo, "commit", "-m", "seed")
    const base = git(repo, "rev-parse", "HEAD")
    const plan = path.join(repo, "docs", "plans", "plan.md")
    const planDigest = createHash("sha256").update(readFileSync(plan)).digest("hex")

    expect(control(
      runs,
      "init",
      "--run-id", "serial-run",
      "--repo", repo,
      "--plan", plan,
      "--plan-digest", planDigest,
      "--binding-json", '{"mode":"prefer","target":"codex","model":null,"source":"test"}',
      "--egress-json", '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["U4a"],"restrictions":[]}',
    ).word).toBe("READY")

    const packet = packetFile("U4a packet")
    const prepared = control(
      runs,
      "prepare",
      "--run-id", "serial-run",
      "--unit-id", "U4a",
      "--base", base,
      "--packet", packet,
      "--attempt-id", "attempt-1",
      "--activity-posture", "incremental",
    )
    expect(prepared.word).toBe("PREPARED")
    const workspace = prepared.body.workspace as string
    const resultDir = prepared.body.result_dir as string
    const resultPath = path.join(resultDir, "implementation-result.json")
    const packetDigest = prepared.body.packet_digest as string

    const fakeBin = path.join(root, "fake-bin")
    mkdirSync(fakeBin)
    const fakeCodex = path.join(fakeBin, "codex")
    writeFileSync(fakeCodex, `#!/bin/sh
set -eu
result=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then result="$2"; shift 2; continue; fi
  shift
done
printf 'committed\n' > existing.txt
git add existing.txt
git -c user.name=Worker -c user.email=worker@example.test commit -m 'worker intermediate' >/dev/null
printf 'residual\n' > existing.txt
python3 -c 'open("binary.bin", "wb").write(bytes([0,255,1]))'
git mv delete.txt renamed.txt
printf '%s\n' '{"terminal_status":"completed","summary":"done","changed_files":["existing.txt","binary.bin","renamed.txt"],"evidence":["fake"],"scope_expansion":null}' > "$result"
`)
    chmodSync(fakeCodex, 0o755)

    const jobId = run(repo, [
      "python3", RUNNER, "start",
      "--skill", "ce-work",
      "--run-id", "serial-run",
      "--label", "U4a",
      "--input-digest", packetDigest,
      "--result-path", resultPath,
      "--no-sweep",
      "--", ADAPTER, prepared.body.authorization_path, workspace, prepared.body.packet_path, packetDigest, resultDir,
    ], {
      ...process.env,
      CE_PEER_JOBS_ROOT: peerRoot,
      CE_WORK_RUNS_ROOT: runs,
      PATH: `${fakeBin}:${process.env.PATH}`,
      CE_PEER_POLL_SECS: "0.1",
      CE_PEER_IDLE_SECS: "10",
      CE_PEER_HARD_SECS: "30",
    })
    expect(jobId).not.toBe("")
    expect(control(
      runs,
      "record-job",
      "--run-id", "serial-run",
      "--unit-id", "U4a",
      "--attempt-id", "attempt-1",
      "--job-id", jobId,
    ).word).toBe("AUTHORING")

    const terminalState = run(repo, [
      "python3", RUNNER, "wait", "--skill", "ce-work", "--max-secs", "30", jobId,
    ], { ...process.env, CE_PEER_JOBS_ROOT: peerRoot })
    expect(terminalState).toBe("done")
    expect(control(runs, "sync-job", "--run-id", "serial-run", "--unit-id", "U4a").body.process_state).toBe("done")

    const terminal = control(runs, "terminalize", "--run-id", "serial-run", "--unit-id", "U4a")
    expect(terminal.word).toBe("INTEGRATION_PENDING")
    const transport = terminal.body.transport
    expect(git(repo, "rev-list", "--parents", "-n", "1", transport.commit).split(" ")).toEqual([transport.commit, base])
    expect(git(repo, "show", `${transport.commit}:existing.txt`)).toBe("residual")
    expect(git(repo, "show", `${transport.commit}:renamed.txt`)).toBe("delete")

    const acquired = control(runs, "integration-acquire", "--run-id", "serial-run", "--unit-id", "U4a")
    expect(acquired.word).toBe("ACQUIRED")
    const token = acquired.body.lock_token as string
    expect(control(
      runs,
      "preflight",
      "--run-id", "serial-run",
      "--unit-id", "U4a",
      "--lock-token", token,
    ).word).toBe("PREFLIGHT_OK")
    git(repo, "cherry-pick", "--no-commit", transport.commit)
    const applied = control(runs, "mark-applied", "--run-id", "serial-run", "--unit-id", "U4a", "--lock-token", token)
    expect(applied.word).toBe("APPLIED")
    expect(readFileSync(path.join(repo, "existing.txt"), "utf8")).toBe("residual\n")
    expect(readFileSync(path.join(repo, "binary.bin"))).toEqual(Buffer.from([0, 255, 1]))

    writeFileSync(path.join(repo, "verification-dirt.txt"), "created after verification ran\n")
    const changedAfterVerification = controlFailure(
      runs,
      "mark-verified",
      "--run-id", "serial-run",
      "--unit-id", "U4a",
      "--lock-token", token,
      "--evidence-digest", "stale-evidence",
    )
    expect(changedAfterVerification.status).not.toBe(0)
    expect(changedAfterVerification.word).toBe("BLOCKED")
    expect(changedAfterVerification.body.reason).toContain("expected transport application")
    rmSync(path.join(repo, "verification-dirt.txt"))

    const verificationDigest = createHash("sha256").update("fake canonical verification passed").digest("hex")
    expect(control(
      runs,
      "mark-verified",
      "--run-id", "serial-run",
      "--unit-id", "U4a",
      "--lock-token", token,
      "--evidence-digest", verificationDigest,
    ).word).toBe("VERIFIED")
    git(repo, "commit", "-m", "feat(test): integrate external unit")
    const canonical = git(repo, "rev-parse", "HEAD")
    expect(control(runs, "mark-committed", "--run-id", "serial-run", "--unit-id", "U4a", "--lock-token", token).word).toBe("COMMITTED")
    expect(git(repo, "diff", "--binary", base, canonical)).toBe(git(repo, "diff", "--binary", base, transport.commit))

    expect(control(runs, "cleanup", "--run-id", "serial-run", "--unit-id", "U4a").word).toBe("CLEANED")
    expect(control(runs, "integration-release", "--run-id", "serial-run", "--unit-id", "U4a", "--lock-token", token).word).toBe("RELEASED")
    expect(git(repo, "status", "--porcelain")).toBe("")
    expect(spawnSync("git", ["-C", repo, "show-ref", "--verify", transport.ref]).status).not.toBe(0)
  }, 30_000)

  test("same-base disjoint wave terminalizes together and lands as separate controlled host commits", () => {
    const root = temp("ce-work-wave-")
    const repo = path.join(root, "repo")
    const runs = path.join(root, "jobs", "ce-work")
    mkdirSync(repo)
    git(repo, "init", "-b", "main")
    git(repo, "config", "user.name", "CE Work Host")
    git(repo, "config", "user.email", "host@example.test")
    mkdirSync(path.join(repo, "docs", "plans"), { recursive: true })
    const plan = path.join(repo, "docs", "plans", "plan.md")
    writeFileSync(plan, "# Plan\n")
    writeFileSync(path.join(repo, "seed.txt"), "seed\n")
    git(repo, "add", ".")
    git(repo, "commit", "-m", "seed")
    const base = git(repo, "rev-parse", "HEAD")
    const planDigest = createHash("sha256").update(readFileSync(plan)).digest("hex")

    expect(control(
      runs, "init", "--run-id", "wave-run", "--repo", repo, "--plan", plan,
      "--plan-digest", planDigest,
      "--binding-json", '{"mode":"prefer","target":"codex","model":null,"source":"test"}',
      "--egress-json", '{"sanction_source":"test","route":"codex","intermediaries":[],"exposed_material":["wave"],"restrictions":[]}',
    ).word).toBe("READY")

    const units = [
      { id: "U-a", position: "0", file: "a.txt", packet: "packet-a" },
      { id: "U-b", position: "1", file: "b.txt", packet: "packet-b" },
    ]
    const transports: Record<string, any> = {}
    for (const unit of units) {
      const prepared = control(
        runs, "prepare", "--run-id", "wave-run", "--unit-id", unit.id,
        "--base", base, "--packet", packetFile(unit.packet),
        "--wave-id", "wave-1", "--wave-position", unit.position,
      )
      expect(prepared.word).toBe("PREPARED")
      expect(git(prepared.body.workspace, "rev-parse", "HEAD")).toBe(base)
      writeFileSync(path.join(prepared.body.workspace, unit.file), `${unit.id}\n`)
      const jobId = fakeDoneJob(runs, "wave-run", unit.id, unit.packet, `job-${unit.id}`)
      expect(control(
        runs, "record-job", "--run-id", "wave-run", "--unit-id", unit.id,
        "--attempt-id", "attempt-1", "--job-id", jobId,
      ).word).toBe("AUTHORING")
      transports[unit.id] = control(runs, "terminalize", "--run-id", "wave-run", "--unit-id", unit.id).body.transport
      expect(git(repo, "rev-list", "--parents", "-n", "1", transports[unit.id].commit).split(" ")).toEqual([
        transports[unit.id].commit,
        base,
      ])
    }

    const outOfOrder = controlFailure(
      runs, "integration-acquire", "--run-id", "wave-run", "--unit-id", "U-b",
    )
    expect(outOfOrder.status).not.toBe(0)
    expect(outOfOrder.word).toBe("BLOCKED")
    expect(outOfOrder.body.reason).toBe("earlier wave unit not resolved")
    expect(outOfOrder.body.units).toEqual(["U-a"])

    const firstLock = control(runs, "integration-acquire", "--run-id", "wave-run", "--unit-id", "U-a").body.lock_token
    expect(control(runs, "preflight", "--run-id", "wave-run", "--unit-id", "U-a", "--lock-token", firstLock).word).toBe("PREFLIGHT_OK")
    git(repo, "cherry-pick", "--no-commit", transports["U-a"].commit)
    expect(control(runs, "mark-applied", "--run-id", "wave-run", "--unit-id", "U-a", "--lock-token", firstLock).word).toBe("APPLIED")
    expect(control(
      runs, "mark-verified", "--run-id", "wave-run", "--unit-id", "U-a", "--lock-token", firstLock,
      "--evidence-digest", "verify-a",
    ).word).toBe("VERIFIED")
    git(repo, "commit", "-m", "feat(test): integrate U-a")
    const firstCanonical = git(repo, "rev-parse", "HEAD")
    expect(control(runs, "mark-committed", "--run-id", "wave-run", "--unit-id", "U-a", "--lock-token", firstLock).word).toBe("COMMITTED")
    const waveResume = control(runs, "resume", "--run-id", "wave-run")
    expect(waveResume.body.actions.map((action: any) => action.action)).toContain("wave-advance-reconciled")
    expect(waveResume.body.actions.map((action: any) => action.action)).toContain("committed-unit-finalized")

    const secondLock = control(runs, "integration-acquire", "--run-id", "wave-run", "--unit-id", "U-b").body.lock_token
    writeFileSync(path.join(repo, "unknown.txt"), "unknown movement\n")
    git(repo, "add", "unknown.txt")
    git(repo, "commit", "-m", "unknown movement")
    const unknownMovement = controlFailure(
      runs, "preflight", "--run-id", "wave-run", "--unit-id", "U-b", "--lock-token", secondLock,
      "--allowed-head", firstCanonical,
    )
    expect(unknownMovement.status).not.toBe(0)
    expect(unknownMovement.word).toBe("BLOCKED")
    git(repo, "reset", "--hard", firstCanonical)

    expect(control(
      runs, "preflight", "--run-id", "wave-run", "--unit-id", "U-b", "--lock-token", secondLock,
      "--allowed-head", firstCanonical,
    ).word).toBe("PREFLIGHT_OK")
    git(repo, "cherry-pick", "--no-commit", transports["U-b"].commit)
    expect(control(runs, "mark-applied", "--run-id", "wave-run", "--unit-id", "U-b", "--lock-token", secondLock).word).toBe("APPLIED")
    expect(control(
      runs, "mark-verified", "--run-id", "wave-run", "--unit-id", "U-b", "--lock-token", secondLock,
      "--evidence-digest", "verify-b",
    ).word).toBe("VERIFIED")
    git(repo, "commit", "-m", "feat(test): integrate U-b")
    const secondCanonical = git(repo, "rev-parse", "HEAD")
    expect(control(runs, "mark-committed", "--run-id", "wave-run", "--unit-id", "U-b", "--lock-token", secondLock).word).toBe("COMMITTED")
    expect(git(repo, "rev-list", "--parents", "-n", "1", secondCanonical).split(" ")).toEqual([secondCanonical, firstCanonical])
    expect(readFileSync(path.join(repo, "a.txt"), "utf8")).toBe("U-a\n")
    expect(readFileSync(path.join(repo, "b.txt"), "utf8")).toBe("U-b\n")
    expect(control(runs, "cleanup", "--run-id", "wave-run", "--unit-id", "U-b").word).toBe("CLEANED")
    expect(control(runs, "integration-release", "--run-id", "wave-run", "--unit-id", "U-b", "--lock-token", secondLock).word).toBe("RELEASED")
    expect(git(repo, "status", "--porcelain")).toBe("")
  }, 30_000)
})
