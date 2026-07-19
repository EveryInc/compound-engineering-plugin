import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"

setDefaultTimeout(20_000)

const SCRIPT = path.join(process.cwd(), "skills/ce-work/scripts/cross-model-work.sh")
const CONTROLLER = path.join(process.cwd(), "skills/ce-work/scripts/unit-workspace.py")
const SCHEMA = path.join(process.cwd(), "skills/ce-work/references/implementation-result-schema.json")
const ROUTES = ["codex", "claude", "grok-cli", "cursor", "composer", "grok-cursor"] as const
const ROUTE_CONTRACTS = {
  codex: { target: "codex", harness: "codex", intermediaries: [], model: "auto", restriction: "adapter-enforced" },
  claude: { target: "claude", harness: "claude", intermediaries: [], model: "auto", restriction: "cooperative" },
  "grok-cli": { target: "grok", harness: "grok", intermediaries: [], model: "auto", restriction: "cooperative" },
  cursor: { target: "cursor", harness: "cursor-agent", intermediaries: [], model: "auto", restriction: "adapter-enforced" },
  composer: { target: "composer", harness: "cursor-agent", intermediaries: ["cursor"], model: "composer-2.5-fast", restriction: "adapter-enforced" },
  "grok-cursor": { target: "grok", harness: "cursor-agent", intermediaries: ["cursor"], model: "cursor-grok-4.5-high", restriction: "adapter-enforced" },
} as const
const roots: string[] = []

function temp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  roots.push(dir)
  return dir
}

afterAll(() => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

function fixture() {
  const root = temp("ce-work-route-")
  const canonical = path.join(root, "canonical")
  const packet = path.join(root, "packet.md")
  const capture = path.join(root, "capture")
  const runs = path.join(root, "runs")
  mkdirSync(canonical)
  mkdirSync(capture)
  writeFileSync(packet, "Implement U3 only.\n")
  spawnSync("git", ["init", "-q", canonical])
  spawnSync("git", ["-C", canonical, "config", "user.email", "test@example.com"])
  spawnSync("git", ["-C", canonical, "config", "user.name", "Test"])
  mkdirSync(path.join(canonical, "docs", "plans"), { recursive: true })
  writeFileSync(path.join(canonical, "README.md"), "seed\n")
  writeFileSync(path.join(canonical, "docs", "plans", "plan.md"), "# Test plan\n")
  spawnSync("git", ["-C", canonical, "add", "."])
  spawnSync("git", ["-C", canonical, "commit", "-qm", "seed"])
  return {
    root,
    canonical,
    workspace: canonical,
    resultDir: path.join(root, "unprepared-result"),
    packet,
    packetSource: packet,
    capture,
    runs,
    prepared: null as null | { authorization_path: string; workspace: string; packet_path: string; result_dir: string },
  }
}

function fakeBin(route: typeof ROUTES[number], capture: string, response?: string) {
  const bin = temp("ce-work-bin-")
  const binary = route === "grok-cli" ? "grok" : route === "grok-cursor" || route === "cursor" || route === "composer" ? "cursor-agent" : route
  const final = response ?? '{"terminal_status":"completed","summary":"implemented","changed_files":["result.txt"],"evidence":["focused test passed"],"scope_expansion":null}'
  const script = `#!/bin/sh
set -eu
if [ "\${1:-}" = "--list-models" ]; then
  cat <<'MODELS'
composer-2.5-fast - Composer 2.5 Fast
composer-next-fast - Composer Next Fast
cursor-grok-4.5-high - Cursor Grok 4.5 High
claude-sonnet-5-low - Sonnet 5 1M Low
MODELS
  exit 0
fi
printf '%s\\n' "$@" > '${capture}/argv'
printf '%s' "$PWD" > '${capture}/pwd'
env | sort > '${capture}/env'
cat > '${capture}/stdin'
printf 'READY\\n' > result.txt
case '${route}' in
  codex)
    out=''
    previous=''
    for arg in "$@"; do
      if [ "$previous" = '-o' ]; then out="$arg"; fi
      previous="$arg"
    done
    printf '%s\\n' '{"type":"item.completed"}'
    printf '%s\\n' '${final.replaceAll("'", "'\\''")}' > "$out"
    ;;
  claude)
    printf '%s\\n' '{"type":"system","subtype":"init","model":"claude-fable-5"}'
    printf '%s\\n' '${final.replaceAll("'", "'\\''")}'
    ;;
  cursor|composer|grok-cursor)
    model='Cursor Grok 4.5 High'
    [ '${route}' = composer ] && model='Composer 2.5 Fast'
    printf '%s\\n' "{\\"type\\":\\"system\\",\\"subtype\\":\\"init\\",\\"model\\":\\"$model\\"}"
    printf '%s\\n' '${final.replaceAll("'", "'\\''")}'
    ;;
  grok-cli)
    printf '%s\\n' '{"type":"activity","message":"editing"}'
    printf '%s\\n' '${final.replaceAll("'", "'\\''")}'
    ;;
esac
`
  writeFileSync(path.join(bin, binary), script)
  chmodSync(path.join(bin, binary), 0o755)
  return bin
}

function run(
  route: typeof ROUTES[number],
  f: ReturnType<typeof fixture>,
  env: NodeJS.ProcessEnv = process.env,
  expectedPacketDigest = createHash("sha256").update(readFileSync(f.packet)).digest("hex"),
  authorizationOverrides: Record<string, unknown> = {},
  forgedAuthorization = false,
  workerPrefix: string[] = [],
) {
  const contract = ROUTE_CONTRACTS[route]
  if (!f.prepared) {
    const runId = "route-run"
    const unitId = "U3"
    const attemptId = "attempt-1"
    const plan = path.join(f.canonical, "docs", "plans", "plan.md")
    const planDigest = createHash("sha256").update(readFileSync(plan)).digest("hex")
    const controllerEnv = { ...process.env, CE_WORK_RUNS_ROOT: f.runs }
    const invoke = (...args: string[]) => {
      const proc = spawnSync("python3", [CONTROLLER, ...args], { encoding: "utf8", env: controllerEnv })
      expect(proc.status).toBe(0)
      const lines = proc.stdout.trim().split("\n")
      return JSON.parse(lines[1])
    }
    invoke(
      "init", "--run-id", runId, "--repo", f.canonical, "--plan", plan, "--plan-digest", planDigest,
      "--binding-json", JSON.stringify({ mode: "prefer", target: contract.target, model: forgedAuthorization ? null : authorizationOverrides.model_requested ?? null, source: "test" }),
      "--egress-json", JSON.stringify({ sanction_source: "test", route, intermediaries: [...contract.intermediaries], exposed_material: [unitId], restrictions: [] }),
    )
    const base = spawnSync("git", ["-C", f.canonical, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim()
    f.prepared = invoke(
      "prepare", "--run-id", runId, "--unit-id", unitId, "--attempt-id", attemptId,
      "--base", base, "--packet", f.packetSource, "--activity-posture", "incremental",
    )
    f.workspace = f.prepared.workspace
    f.packet = f.prepared.packet_path
    f.resultDir = f.prepared.result_dir
  }
  let authorization = f.prepared.authorization_path
  if (forgedAuthorization) {
    const forged = { ...JSON.parse(readFileSync(authorization, "utf8")), ...authorizationOverrides }
    authorization = path.join(f.root, `authorization-forged-${Math.random().toString(16).slice(2)}.json`)
    writeFileSync(authorization, `${JSON.stringify(forged)}\n`, { mode: 0o600 })
    chmodSync(authorization, 0o600)
  }
  const jobId = `job-${Math.random().toString(16).slice(2)}`
  const jobDir = path.join(f.runs, "route-run", "jobs", jobId)
  mkdirSync(jobDir, { mode: 0o700 })
  chmodSync(jobDir, 0o700)
  const adapterArgv = [SCRIPT, authorization, f.workspace, f.packet, expectedPacketDigest, f.resultDir]
  writeFileSync(path.join(jobDir, "meta.json"), `${JSON.stringify({
    job_id: jobId,
    skill: "ce-work",
    run_id: "route-run",
    label: "U3",
    input_digest: expectedPacketDigest,
    worker_argv: [...workerPrefix, ...adapterArgv],
    result_path: path.join(f.resultDir, "implementation-result.json"),
  })}\n`, { mode: 0o600 })
  const proc = spawnSync(workerPrefix[0] ?? SCRIPT, workerPrefix.length ? [...workerPrefix.slice(1), ...adapterArgv] : adapterArgv.slice(1), {
    encoding: "utf8",
    env: { ...env, CE_WORK_RUNS_ROOT: f.runs, CE_PEER_JOB_ID: jobId },
  })
  const resultPath = path.join(f.resultDir, "implementation-result.json")
  return {
    code: proc.status ?? -1,
    stderr: proc.stderr ?? "",
    result: existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, "utf8")) : null,
  }
}

function emit(route: string, env: NodeJS.ProcessEnv = process.env) {
  return spawnSync("bash", [SCRIPT, "--emit-adapter", route], { encoding: "utf8", env })
}

describe("ce-work fixed write routes", () => {
  test("production argv uses the qualified noninteractive write posture", () => {
    for (const route of ROUTES) expect(emit(route).status).toBe(0)

    const codex = emit("codex").stdout
    expect(codex).toContain("exec")
    expect(codex).toContain("--ephemeral")
    expect(codex).toContain("-s workspace-write")
    expect(codex).toContain("-C <workspace>")

    const claude = emit("claude").stdout
    expect(claude).toContain("--safe-mode")
    expect(claude).toContain("--permission-mode bypassPermissions")
    expect(claude).toContain("--tools Read,Write,Edit,Bash")
    expect(claude).toContain("--allowed-tools Bash(*)")
    expect(claude).toContain("--no-session-persistence")
    expect(claude).not.toContain("--model")

    const grok = emit("grok-cli").stdout
    expect(grok).toContain("--cwd <workspace>")
    expect(grok).toContain("--permission-mode acceptEdits")
    expect(grok).toContain("--no-memory")
    expect(grok).toContain("--no-subagents")
    expect(grok).not.toContain("--model")

    for (const route of ["cursor", "composer", "grok-cursor"]) {
      const command = emit(route).stdout
      expect(command).toContain("--sandbox enabled")
      expect(command).toContain("--workspace <workspace>")
      expect(command).toContain("--output-format stream-json")
    }
    expect(emit("cursor").stdout).not.toContain("--model")
    expect(emit("composer").stdout).toContain("--model composer-2.5-fast")
    expect(emit("grok-cursor").stdout).toContain("--model cursor-grok-4.5-high")
  })

  test.each(ROUTES)("%s receives one workspace and bounded packet", (route) => {
    const f = fixture()
    const bin = fakeBin(route, f.capture)
    const result = run(
      route,
      f,
      {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        ...(route === "grok-cursor" ? { CE_WORK_CURSOR_INTERMEDIARY_SANCTIONED: "1" } : {}),
      },
    )
    expect(result.code).toBe(0)
    expect(readFileSync(path.join(f.capture, "pwd"), "utf8")).toBe(realpathSync(f.workspace))
    expect(readFileSync(path.join(f.capture, "stdin"), "utf8")).toContain("Implement U3 only.")
    expect(readFileSync(path.join(f.capture, "env"), "utf8")).toContain("PYTHONDONTWRITEBYTECODE=1")
    expect(readFileSync(path.join(f.workspace, "result.txt"), "utf8")).toBe("READY\n")
    expect(result.result.terminal_status).toBe("completed")
    expect(result.result.requested_route).toBe(route)
    expect(result.result.actual_route).toBe(route)
    expect(result.result.activity_posture).toBe("incremental")
    expect(result.result.packet_digest).toBe(createHash("sha256").update(readFileSync(f.packet)).digest("hex"))
    expect(realpathSync(result.result.raw_log)).toBe(path.join(realpathSync(f.resultDir), "adapter.log"))
    if (route === "codex" || route === "grok-cli") {
      expect(result.result.model_actual).toBe("unverified")
      expect(result.result.model_receipt_status).toBe("unverified")
    } else {
      expect(result.result.model_actual).not.toBe("unverified")
      expect(result.result.model_receipt_status).toBe("verified")
    }
  })

  test("Cursor accepts a controller-bounded explicit model while Composer stays family-locked", () => {
    const cursor = emit("cursor", {
      ...process.env,
      CE_WORK_MODEL_OVERRIDE_TARGET: "cursor",
      CE_WORK_MODEL_OVERRIDE: "claude-sonnet-5-low",
    })
    expect(cursor.status).toBe(0)
    expect(cursor.stdout).toContain("--model claude-sonnet-5-low")

    for (const reserved of ["composer", "composer-2.5-fast", "grok-4.5", "cursor-grok-4.5-high"]) {
      const rejected = emit("cursor", {
        ...process.env,
        CE_WORK_MODEL_OVERRIDE_TARGET: "cursor",
        CE_WORK_MODEL_OVERRIDE: reserved,
      })
      expect(rejected.status).toBe(2)
      expect(rejected.stderr).toContain("not compatible")
    }

    const composer = emit("composer", {
      ...process.env,
      CE_WORK_MODEL_OVERRIDE_TARGET: "composer",
      CE_WORK_MODEL_OVERRIDE: "gpt-5.6-sol",
    })
    expect(composer.status).toBe(2)
    expect(composer.stderr).toContain("not compatible")

    const compatible = emit("composer", {
      ...process.env,
      CE_WORK_MODEL_OVERRIDE_TARGET: "composer",
      CE_WORK_MODEL_OVERRIDE: "composer-next-fast",
    })
    expect(compatible.status).toBe(0)
    expect(compatible.stdout).toContain("--model composer-next-fast")
  })

  test("target-scoped model overrides do not make unrelated route probes unavailable", () => {
    const composerOverride = {
      ...process.env,
      CE_WORK_MODEL_OVERRIDE_TARGET: "composer",
      CE_WORK_MODEL_OVERRIDE: "composer-next-fast",
    }

    const codex = emit("codex", composerOverride)
    expect(codex.status).toBe(0)
    expect(codex.stdout).not.toContain("--model")
    expect(codex.stdout).not.toContain("composer-next-fast")
    expect(emit("composer", composerOverride).stdout).toContain("--model composer-next-fast")
  })

  test("malformed model override bindings remain unavailable", () => {
    for (const env of [
      { CE_WORK_MODEL_OVERRIDE: "composer-next-fast" },
      { CE_WORK_MODEL_OVERRIDE_TARGET: "composer" },
      { CE_WORK_MODEL_OVERRIDE_TARGET: "unknown", CE_WORK_MODEL_OVERRIDE: "composer-next-fast" },
    ]) {
      const rejected = emit("codex", { ...process.env, ...env })
      expect(rejected.status).toBe(2)
      expect(rejected.stderr).toContain("not compatible")
    }
  })

  test("production dispatch honors explicit models while defaults stay harness-configured", () => {
    for (const [route, model] of [
      ["cursor", "claude-sonnet-5-low"],
      ["claude", "sonnet"],
      ["grok-cli", "grok-4.5"],
    ] as const) {
      const f = fixture()
      const bin = fakeBin(route, f.capture)
      const result = run(
        route,
        f,
        { ...process.env, PATH: `${bin}:${process.env.PATH}` },
        undefined,
        { model_requested: model },
      )
      expect(result.code).toBe(0)
      expect(readFileSync(path.join(f.capture, "argv"), "utf8")).toContain(model)
      expect(result.result.model_requested).toBe(model)
    }
  })

  test("production dispatch derives the model from controller authorization, not ambient overrides", () => {
    const f = fixture()
    const bin = fakeBin("composer", f.capture)
    const digest = createHash("sha256").update(readFileSync(f.packet)).digest("hex")
    const result = run(
      "composer",
      f,
      {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        CE_WORK_MODEL_OVERRIDE_TARGET: "composer",
        CE_WORK_MODEL_OVERRIDE: "gpt-forged",
      },
      digest,
      { model_requested: "composer-next-fast" },
    )
    expect(result.code).toBe(0)
    const argv = readFileSync(path.join(f.capture, "argv"), "utf8")
    expect(argv).toContain("composer-next-fast")
    expect(argv).not.toContain("gpt-forged")
    expect(result.result.model_requested).toBe("composer-next-fast")
  })

  test("forged route or model authorization is rejected before CLI invocation", () => {
    for (const [route, overrides] of [
      ["codex", { route: "claude" }],
      ["composer", { model_requested: "gpt-5.6-sol" }],
      ["cursor", { model_requested: "composer-2.5-fast" }],
      ["cursor", { model_requested: "grok-4.5" }],
      ["cursor", { model_requested: "cursor-grok-4.5-high" }],
      ["cursor", { model_requested: "model@beta" }],
    ] as const) {
      const f = fixture()
      const bin = fakeBin(route, f.capture)
      const digest = createHash("sha256").update(readFileSync(f.packet)).digest("hex")
      const result = run(route, f, { ...process.env, PATH: `${bin}:${process.env.PATH}` }, digest, overrides, true)
      expect(result.code).toBe(2)
      expect(result.stderr).toContain("controller authorization rejected")
      expect(result.result).toBeNull()
      expect(existsSync(path.join(f.capture, "argv"))).toBe(false)
      expect(existsSync(path.join(f.capture, "stdin"))).toBe(false)
    }
  })

  test("controller handshake rejects hand-authored, cross-attempt, and cross-unit authorization", () => {
    for (const overrides of [
      {},
      { attempt_id: "attempt-2" },
      { unit_id: "U4" },
    ]) {
      const f = fixture()
      const bin = fakeBin("codex", f.capture)
      const digest = createHash("sha256").update(readFileSync(f.packet)).digest("hex")
      const result = run("codex", f, { ...process.env, PATH: `${bin}:${process.env.PATH}` }, digest, overrides, true)
      expect(result.code).toBe(2)
      expect(result.stderr).toContain("controller dispatch authorization failed")
      expect(result.result).toBeNull()
      expect(existsSync(path.join(f.capture, "argv"))).toBe(false)
      expect(existsSync(path.join(f.capture, "stdin"))).toBe(false)
    }
  })

  test("controller handshake rejects a shell-prefixed runner argv before CLI invocation", () => {
    const f = fixture()
    const bin = fakeBin("codex", f.capture)
    const digest = createHash("sha256").update(readFileSync(f.packet)).digest("hex")
    const result = run("codex", f, { ...process.env, PATH: `${bin}:${process.env.PATH}` }, digest, {}, false, ["bash"])

    expect(result.code).toBe(2)
    expect(result.stderr).toContain("controller dispatch authorization failed")
    expect(result.result).toBeNull()
    expect(existsSync(path.join(f.capture, "argv"))).toBe(false)
  })

  test("Grok through Cursor requires its controller-sanctioned intermediary", () => {
    const f = fixture()
    const bin = fakeBin("grok-cursor", f.capture)
    const blocked = run(
      "grok-cursor",
      f,
      { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      createHash("sha256").update(readFileSync(f.packet)).digest("hex"),
      { intermediaries: [] },
      true,
    )
    expect(blocked.code).toBe(2)
    expect(blocked.stderr).toContain("authorization")
    expect(blocked.result).toBeNull()
    expect(existsSync(path.join(f.capture, "argv"))).toBe(false)

    const allowed = run("grok-cursor", f, { ...process.env, PATH: `${bin}:${process.env.PATH}` })
    expect(allowed.code).toBe(0)
  })

  test("a quiet route reports no activity before byte growth and raw route output is capped", () => {
    const quiet = fixture()
    const quietBin = temp("ce-work-bin-")
    writeFileSync(path.join(quietBin, "claude"), `#!/bin/sh
cat > '${quiet.capture}/stdin'
sleep 2
exit 7
`)
    chmodSync(path.join(quietBin, "claude"), 0o755)
    const quietResult = run("claude", quiet, {
      ...process.env,
      PATH: `${quietBin}:${process.env.PATH}`,
      CE_WORK_ACTIVITY_POLL_SECS: "1",
    })
    expect(quietResult.code).toBe(1)
    expect(quietResult.stderr).not.toContain("output-updated")

    const noisy = fixture()
    const noisyBin = temp("ce-work-bin-")
    writeFileSync(path.join(noisyBin, "claude"), `#!/bin/sh
cat > '${noisy.capture}/stdin'
printf '%02048d' 0
`)
    chmodSync(path.join(noisyBin, "claude"), 0o755)
    const noisyResult = run("claude", noisy, {
      ...process.env,
      PATH: `${noisyBin}:${process.env.PATH}`,
      CE_WORK_MAX_RAW_BYTES: "256",
    })
    expect(noisyResult.code).toBe(1)
    expect(noisyResult.result.terminal_status).toBe("unavailable")
    expect(noisyResult.result.failure_reason).toContain("exceeded 256 bytes")
    expect(statSync(path.join(noisy.resultDir, "adapter.log")).size).toBeLessThanOrEqual(256)
  })

  test.each(["claude", "grok-cli"] as const)("%s is unavailable when enforceable confinement is required", (route) => {
    const f = fixture()
    const bin = fakeBin(route, f.capture)
    const result = run(route, f, {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      CE_WORK_REQUIRE_ENFORCED_CONFINEMENT: "1",
    })
    expect(result.code).toBe(2)
    expect(result.result.terminal_status).toBe("unavailable")
    expect(result.result.failure_reason).toContain("cooperative")
    expect(existsSync(path.join(f.capture, "argv"))).toBe(false)
  })
})

describe("ce-work adapter results, identity, and secret handling", () => {
  test("packet bytes must match the controller-provided digest before egress", () => {
    const f = fixture()
    const expected = createHash("sha256").update(readFileSync(f.packet)).digest("hex")
    writeFileSync(f.packet, "Implement a different and broader unit.\n")
    const bin = fakeBin("claude", f.capture)
    const result = run("claude", f, { ...process.env, PATH: `${bin}:${process.env.PATH}` }, expected)
    expect(result.code).toBe(2)
    expect(result.stderr).toContain("packet digest")
    expect(existsSync(path.join(f.capture, "argv"))).toBe(false)
    expect(result.result).toBeNull()
  })

  test("worker output cannot forge host-owned route and identity receipts", () => {
    const f = fixture()
    const response = JSON.stringify({
      terminal_status: "completed",
      summary: "implemented",
      changed_files: ["result.txt"],
      evidence: ["focused test passed"],
      scope_expansion: null,
      requested_route: "codex",
      actual_route: "codex",
      target: "codex",
      harness: "codex",
      intermediaries: [],
      model_requested: "gpt-forged",
      model_actual: "gpt-forged",
      model_receipt_status: "verified",
    })
    const bin = fakeBin("claude", f.capture, response)
    const result = run("claude", f, { ...process.env, PATH: `${bin}:${process.env.PATH}` })
    expect(result.code).toBe(1)
    expect(result.result.terminal_status).toBe("failed")
    expect(result.result.failure_reason).toContain("schema")
    expect(result.result.requested_route).toBe("claude")
    expect(result.result.actual_route).toBe("claude")
    expect(result.result.target).toBe("claude")
    expect(result.result.harness).toBe("claude")
    expect(result.result.model_requested).toBe("auto")
    expect(result.result.model_actual).toBe("claude-fable-5")
  })

  test("a route failure returns evidence without changing recipient", () => {
    const f = fixture()
    const bin = fakeBin("grok-cli", f.capture)
    writeFileSync(path.join(bin, "grok"), `#!/bin/sh\nprintf '%s\\n' "$@" > '${f.capture}/argv'\nprintf 'quota exhausted\\n' >&2\nexit 7\n`)
    chmodSync(path.join(bin, "grok"), 0o755)
    const cursorMarker = path.join(f.capture, "cursor-invoked")
    writeFileSync(path.join(bin, "cursor-agent"), `#!/bin/sh\n: > '${cursorMarker}'\n`)
    chmodSync(path.join(bin, "cursor-agent"), 0o755)
    const result = run("grok-cli", f, { ...process.env, PATH: `${bin}:${process.env.PATH}` })
    expect(result.code).toBe(1)
    expect(result.result.terminal_status).toBe("failed")
    expect(result.result.failure_reason).toContain("exit 7")
    expect(readFileSync(path.join(f.resultDir, "adapter.log"), "utf8")).toContain("quota exhausted")
    expect(existsSync(cursorMarker)).toBe(false)
  })

  test("scope expansion is terminalized for host handling", () => {
    const f = fixture()
    const response = '{"terminal_status":"scope_expansion","summary":"shared contract needed","changed_files":[],"evidence":[],"scope_expansion":{"requested_paths":["shared.ts"],"reason":"required by unit"}}'
    const bin = fakeBin("claude", f.capture, response)
    const result = run("claude", f, { ...process.env, PATH: `${bin}:${process.env.PATH}` })
    expect(result.code).toBe(0)
    expect(result.result.terminal_status).toBe("scope_expansion")
    expect(result.result.scope_expansion.requested_paths).toEqual(["shared.ts"])
  })

  test("blocked output is terminalized for host handling", () => {
    const f = fixture()
    const response = '{"terminal_status":"blocked","summary":"needs host input","changed_files":[],"evidence":["dependency unavailable"],"scope_expansion":null}'
    const bin = fakeBin("claude", f.capture, response)
    const result = run("claude", f, { ...process.env, PATH: `${bin}:${process.env.PATH}` })
    expect(result.code).toBe(0)
    expect(result.result).toMatchObject({
      terminal_status: "blocked",
      summary: "needs host input",
      evidence: ["dependency unavailable"],
    })
  })

  test.each([
    ["claude-fable-5", "verified"],
    ["claude-fable-5\\u001b[1m", "verified"],
    ["claude-opus-4-8", "mismatch"],
    ["", "unverified"],
  ] as const)("Claude served-model receipt %s normalizes as %s", (served, receipt) => {
    const f = fixture()
    const bin = fakeBin("claude", f.capture)
    const body = `#!/bin/sh
cat > '${f.capture}/stdin'
printf 'READY\\n' > result.txt
${served ? `printf '%s\\n' '{"type":"system","subtype":"init","model":"${served}"}'` : "printf '%s\\n' '{\"type\":\"activity\"}'"}
printf '%s\\n' '{"terminal_status":"completed","summary":"done","changed_files":["result.txt"],"evidence":[],"scope_expansion":null}'
`
    writeFileSync(path.join(bin, "claude"), body)
    chmodSync(path.join(bin, "claude"), 0o755)
    const result = run(
      "claude",
      f,
      { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      undefined,
      { model_requested: "fable" },
    )
    expect(result.result.model_actual).toBe(served ? served.replace("\\u001b[1m", "") : "unverified")
    expect(result.result.model_receipt_status).toBe(receipt)
  })

  test.each([
    ["Sonnet 5 300K Low No Thinking", "verified"],
    ["Sonnet 5 300K High No Thinking", "mismatch"],
  ] as const)("Cursor explicit-model display receipt %s normalizes as %s", (served, receipt) => {
    const f = fixture()
    const response = '{"terminal_status":"completed","summary":"done","changed_files":["result.txt"],"evidence":[],"scope_expansion":null}'
    const bin = fakeBin("cursor", f.capture, response)
    const script = path.join(bin, "cursor-agent")
    const body = readFileSync(script, "utf8").replace("model='Cursor Grok 4.5 High'", `model='${served}'`)
    writeFileSync(script, body)
    chmodSync(script, 0o755)
    const result = run(
      "cursor",
      f,
      { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      undefined,
      { model_requested: "claude-sonnet-5-low" },
    )
    expect(result.result.model_actual).toBe(served)
    expect(result.result.model_receipt_status).toBe(receipt)
  })

  test("sentinel values are removed from environment, prompt, result, log, and argv", () => {
    const sentinel = "SENTINEL-credential-123"
    const f = fixture()
    writeFileSync(f.packet, `Implement U3. Token: ${sentinel}\n`)
    const redactions = path.join(f.root, "redactions")
    writeFileSync(redactions, `${sentinel}\n`)
    const response = `{"terminal_status":"completed","summary":"saw ${sentinel}","changed_files":["result.txt"],"evidence":[],"scope_expansion":null}`
    const bin = fakeBin("codex", f.capture, response)
    const result = run("codex", f, {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      CE_WORK_REDACT_FILE: redactions,
      SENTINEL_ENV: sentinel,
    })
    expect(result.code).toBe(0)
    for (const file of ["argv", "stdin", "env"]) {
      expect(readFileSync(path.join(f.capture, file), "utf8")).not.toContain(sentinel)
    }
    for (const file of readdirSync(f.resultDir)) {
      expect(readFileSync(path.join(f.resultDir, file), "utf8")).not.toContain(sentinel)
      expect(statSync(path.join(f.resultDir, file)).mode & 0o777).toBe(0o600)
    }
    expect(statSync(f.resultDir).mode & 0o777).toBe(0o700)
    expect(JSON.stringify(result.result)).not.toContain(sentinel)
    expect(readFileSync(path.join(f.capture, "stdin"), "utf8")).toContain("[REDACTED]")
  })

  test("raw output is redacted before retained evidence is capped", () => {
    const maxRawBytes = 256
    const sentinel = "BOUNDARY-SECRET-credential-123"
    const sentinelPrefix = sentinel.slice(0, 8)
    const f = fixture()
    const redactions = path.join(f.root, "redactions")
    writeFileSync(redactions, `${sentinel}\n`)
    const bin = temp("ce-work-bin-")
    const prefix = "x".repeat(maxRawBytes - sentinelPrefix.length)
    writeFileSync(path.join(bin, "claude"), `#!/bin/sh
cat > '${f.capture}/stdin'
printf '%s' '${prefix}${sentinel}${"y".repeat(maxRawBytes)}'
`)
    chmodSync(path.join(bin, "claude"), 0o755)

    const result = run("claude", f, {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      CE_WORK_MAX_RAW_BYTES: String(maxRawBytes),
      CE_WORK_REDACT_FILE: redactions,
    })

    expect(result.code).toBe(1)
    expect(result.result.terminal_status).toBe("unavailable")
    expect(result.result.failure_reason).toContain(`exceeded ${maxRawBytes} bytes`)
    const log = readFileSync(path.join(f.resultDir, "adapter.log"), "utf8")
    expect(Buffer.byteLength(log)).toBe(maxRawBytes)
    expect(log).not.toContain(sentinel)
    expect(log).not.toContain(sentinelPrefix)
    expect(log).toContain("[REDAC")
  })

  test("malformed terminal output is a schema failure with a redacted log", () => {
    const f = fixture()
    const bin = fakeBin("cursor", f.capture, "not-json")
    const result = run("cursor", f, { ...process.env, PATH: `${bin}:${process.env.PATH}` })
    expect(result.code).toBe(1)
    expect(result.result.terminal_status).toBe("failed")
    expect(result.result.failure_reason).toContain("schema")
    expect(existsSync(path.join(f.resultDir, "adapter.log"))).toBe(true)
  })

  test("the worker result schema pins terminal and scope-expansion shapes", () => {
    const schema = JSON.parse(readFileSync(SCHEMA, "utf8"))
    expect(schema.$schema).toContain("json-schema")
    expect(schema.required).toContain("terminal_status")
    expect(schema.properties.terminal_status.enum).toEqual(["completed", "blocked", "scope_expansion"])
    expect(schema.additionalProperties).toBe(false)
  })
})
