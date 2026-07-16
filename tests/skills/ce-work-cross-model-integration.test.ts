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
      "python3", RUNNER, "wait", "--max-secs", "30", jobId,
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

  test("controller-owned integration surfaces an unproven restore and retains the lock", () => {
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
    expect(recovered.integration_lock).not.toBeNull()
    expect(recovered.units.U1.state).toBe("preserved")
    expect(control(
      runs, "integration-release", "--run-id", "transaction-restore-fail", "--unit-id", "U1",
      "--lock-token", recovered.integration_lock.nonce,
    ).word).toBe("RELEASED")
  })

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
      "python3", RUNNER, "wait", "--max-secs", "30", jobId,
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
