import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { ACPX_PIN } from "../helpers/acpx-pin"
import { acpNpxBin, acpStream as acpStreamAt, COMPLETED_RESULT as COMPLETED, type StreamSpec } from "./helpers/ce-work-acp-stub"

setDefaultTimeout(20_000)

// cross-model-work.sh honors CROSS_MODEL_EFFORT_OVERRIDE; make a clean
// environment the suite-wide default so an ambient export cannot leak into
// baseline assertions. Tests that exercise the override set it explicitly.
delete process.env.CROSS_MODEL_EFFORT_OVERRIDE

const SCRIPT = path.join(process.cwd(), "skills/ce-work/scripts/cross-model-work.sh")
const CONTROLLER = path.join(process.cwd(), "skills/ce-work/scripts/unit-workspace.py")
const SCHEMA = path.join(process.cwd(), "skills/ce-work/references/implementation-result-schema.json")
const STREAMS = path.join(process.cwd(), "tests/fixtures/acpx-streams")
type PreparedUnit = { authorization_path: string; workspace: string; packet_path: string; result_dir: string }
const ROUTES = ["codex", "claude", "grok-cli", "cursor", "composer", "grok-cursor", "opencode"] as const
type Route = typeof ROUTES[number]
const GROK_CURSOR_PRESET = "grok-4.7[context=256k,reasoning_effort=high,fast=true]"
const COMPOSER_PRESET = "composer-2.5[fast=true]"
const ROUTE_CONTRACTS = {
  codex: { target: "codex", intermediaries: [] },
  claude: { target: "claude", intermediaries: [] },
  "grok-cli": { target: "grok", intermediaries: [] },
  cursor: { target: "cursor", intermediaries: [] },
  composer: { target: "composer", intermediaries: ["cursor"] },
  "grok-cursor": { target: "grok", intermediaries: ["cursor"] },
  opencode: { target: "opencode", intermediaries: [] },
} as const
const roots: string[] = []
const templateRoots: string[] = []
let seedCanonical: string | null = null

function temp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  roots.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of [...roots, ...templateRoots]) rmSync(dir, { recursive: true, force: true })
})

function seedCanonicalRepo(): string {
  if (seedCanonical) return seedCanonical
  const root = mkdtempSync(path.join(tmpdir(), "ce-work-route-template-"))
  templateRoots.push(root)
  const canonical = path.join(root, "canonical")
  mkdirSync(canonical)
  mkdirSync(path.join(canonical, "docs", "plans"), { recursive: true })
  writeFileSync(path.join(canonical, "README.md"), "seed\n")
  writeFileSync(path.join(canonical, "docs", "plans", "plan.md"), "# Test plan\n")
  spawnSync("git", ["init", "-q", canonical])
  spawnSync("git", ["-C", canonical, "config", "user.email", "test@example.com"])
  spawnSync("git", ["-C", canonical, "config", "user.name", "Test"])
  spawnSync("git", ["-C", canonical, "add", "."])
  spawnSync("git", ["-C", canonical, "commit", "-qm", "seed"])
  seedCanonical = canonical
  return canonical
}

function fixture() {
  const root = temp("ce-work-route-")
  const canonical = path.join(root, "canonical")
  const packet = path.join(root, "packet.md")
  const capture = path.join(root, "capture")
  const runs = path.join(root, "runs")
  mkdirSync(root, { recursive: true })
  mkdirSync(capture)
  writeFileSync(packet, "Implement U3 only.\n")
  cpSync(seedCanonicalRepo(), canonical, { recursive: true })
  return {
    root,
    canonical,
    workspace: canonical,
    resultDir: path.join(root, "unprepared-result"),
    packet,
    packetSource: packet,
    capture,
    runs,
    prepared: null as null | PreparedUnit,
  }
}
type Fixture = ReturnType<typeof fixture>

function acpStream(spec: StreamSpec = {}) {
  return acpStreamAt(path.join(temp("ce-work-stream-"), "s"), spec)
}

function stubBin(f: Fixture, stream: string = acpStream(), hook = "") {
  return acpNpxBin(temp("ce-work-bin-"), f.capture, stream, hook)
}

function withBin(bin: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...cleanEnv(), PATH: `${bin}:${process.env.PATH}`, ...extra }
}

// A PATH of resolved real tools, for tests that hide a tool or replace HOME:
// version-manager shims re-resolve through PATH and HOME, which those tests change.
const REAL_TOOLS = [
  "bash", "sh", "env", "jq", "python3", "node", "git", "cat", "wc", "tr", "sort", "sed", "awk", "grep",
  "head", "tail", "mktemp", "chmod", "mkdir", "rm", "mv", "cp", "ln", "sleep", "kill", "ps", "dirname",
  "basename", "date", "printf", "id", "uname",
]
let realToolPaths: Array<[string, string]> | undefined
function resolvedRealTools(): Array<[string, string]> {
  if (realToolPaths) return realToolPaths
  realToolPaths = []
  for (const tool of REAL_TOOLS) {
    let actual = spawnSync("command", ["-v", tool], { encoding: "utf8", shell: "/bin/bash" }).stdout?.trim()
    const probe = tool === "python3" ? ["-c", "import sys; print(sys.executable)"] : tool === "node" ? ["-p", "process.execPath"] : null
    // A shim linked under another directory can resolve back to itself and spin.
    if (probe && actual) actual = spawnSync(actual, probe, { encoding: "utf8" }).stdout?.trim()
    if (probe && !actual) throw new Error(`cannot resolve the real ${tool} binary`)
    if (actual && existsSync(actual)) realToolPaths.push([tool, actual])
  }
  return realToolPaths
}
function isolatedPath(bin: string, excluded: string[] = []): string {
  const tools = temp("ce-work-tools-")
  for (const [tool, actual] of resolvedRealTools()) {
    if (excluded.includes(tool) || existsSync(path.join(bin, tool))) continue
    symlinkSync(actual, path.join(tools, tool))
  }
  return `${bin}:${tools}`
}

function run(
  route: Route,
  f: Fixture,
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
      "--egress-json", JSON.stringify({
        sanction_source: "test", route, intermediaries: [...contract.intermediaries], exposed_material: [unitId], restrictions: [],
        ...(!forgedAuthorization && authorizationOverrides.effort_requested ? { effort: authorizationOverrides.effort_requested } : {}),
      }),
    )
    const base = spawnSync("git", ["-C", f.canonical, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim()
    const prepared: PreparedUnit = invoke(
      "prepare", "--run-id", runId, "--unit-id", unitId, "--attempt-id", attemptId,
      "--base", base, "--packet", f.packetSource, "--activity-posture", "incremental",
    )
    f.prepared = prepared
    f.workspace = prepared.workspace
    f.packet = prepared.packet_path
    f.resultDir = prepared.result_dir
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

// The script honors CROSS_MODEL_EFFORT_OVERRIDE, so default-posture assertions
// must not inherit an ambient override from the suite's own environment.
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.CROSS_MODEL_EFFORT_OVERRIDE
  return env
}

function captured(f: Fixture, name: string) {
  return readFileSync(path.join(f.capture, name), "utf8")
}

function argv(f: Fixture) {
  return captured(f, "argv").split("\n").slice(0, -1)
}

function flagValue(args: string[], flag: string) {
  const at = args.indexOf(flag)
  return at < 0 ? undefined : args[at + 1]
}

describe("ce-work fixed write routes", () => {
  test("every route runs through the pinned acpx with every permission approved in the workspace", () => {
    for (const route of ROUTES) {
      const out = emit(route, cleanEnv())
      expect(out.status).toBe(0)
      expect(out.stdout).toContain(`npx -y acpx@${ACPX_PIN} --cwd <workspace> --format json --mcp-config <mcp-config>`)
      expect(out.stdout).toContain("--approve-all")
      expect(out.stdout).toContain("--file <prompt-file>")
    }
    expect(emit("codex", cleanEnv()).stdout).toContain("codex exec --config-option mode=agent --config-option reasoning_effort=high")
    expect(emit("claude", cleanEnv()).stdout).toContain("CLAUDE_CODE_EXECUTABLE=<claude-safe-mode-wrapper>")
    expect(emit("claude", cleanEnv()).stdout).toContain("claude exec --config-option mode=default --config-option effort=high")
    expect(emit("grok-cli", cleanEnv()).stdout).toContain("grok-build exec --config-option reasoning_effort=xhigh")
    for (const route of ["cursor", "composer", "grok-cursor"]) {
      expect(emit(route, cleanEnv()).stdout).toContain("cursor exec --config-option mode=agent")
    }
    expect(emit("opencode", cleanEnv()).stdout).toContain(" acp exec --config-option mode=build")
    for (const route of ["codex", "claude", "grok-cli", "cursor", "opencode"]) {
      expect(emit(route, cleanEnv()).stdout).not.toContain("--model")
    }
    expect(emit("composer", cleanEnv()).stdout).toContain(`--model ${COMPOSER_PRESET}`)
    expect(emit("grok-cursor", cleanEnv()).stdout).toContain(`--model ${GROK_CURSOR_PRESET}`)
  })

  test("CROSS_MODEL_EFFORT_OVERRIDE retunes the effort-taking routes and stays off by default", () => {
    const withOverride = (route: string, value: string) =>
      emit(route, { ...cleanEnv(), CROSS_MODEL_EFFORT_OVERRIDE: value })

    expect(withOverride("codex", "xhigh").stdout).toContain("reasoning_effort=xhigh")
    expect(withOverride("codex", "ultra").stdout).toContain("reasoning_effort=ultra")
    expect(withOverride("claude", "low").stdout).toContain("effort=low")
    expect(withOverride("claude", "max").stdout).toContain("effort=max")
    expect(withOverride("grok-cli", "medium").stdout).toContain("reasoning_effort=medium")
  })

  test("CROSS_MODEL_EFFORT_OVERRIDE rejects tiers the route cannot honor, failing closed before dispatch", () => {
    const rejected = (route: string, value: string) => {
      const proc = emit(route, { ...cleanEnv(), CROSS_MODEL_EFFORT_OVERRIDE: value })
      expect(proc.status).toBe(2)
      expect(proc.stderr).toContain(`effort override '${value}' not compatible with route '${route}'`)
    }

    rejected("codex", "minimal")
    rejected("codex", "none")
    rejected("claude", "minimal")
    rejected("grok-cli", "max")
    // Cursor fixes effort in its model preset and OpenCode has no effort option over ACP.
    rejected("cursor", "high")
    rejected("composer", "high")
    rejected("grok-cursor", "high")
    rejected("opencode", "max")
  })

  test.each([...ROUTES])("%s receives one workspace and bounded packet", (route) => {
    const f = fixture()
    const bin = stubBin(f)
    const result = run(route, f, withBin(bin))
    expect(result.code).toBe(0)
    expect(captured(f, "pwd")).toBe(realpathSync(f.workspace))
    expect(flagValue(argv(f), "--cwd")).toBe(realpathSync(f.workspace))
    const prompt = captured(f, "prompt")
    expect(prompt).toContain("Implement U3 only.")
    expect(prompt).toContain("Leave the completed working tree uncommitted")
    expect(prompt).toContain("`git add`")
    expect(prompt).toContain("`git commit`")
    // Codex keeps its shell sandbox under ACP, so its packet keeps the host-owned probe rule.
    if (route === "codex") {
      expect(prompt).toContain("host-owned")
      expect(prompt).toContain("EPERM")
    } else {
      expect(prompt).not.toContain("Socket binds")
    }
    expect(captured(f, "argv")).not.toContain("Implement U3 only.")
    expect(captured(f, "env")).toContain("PYTHONDONTWRITEBYTECODE=1")
    expect(result.result.terminal_status).toBe("completed")
    expect(result.result.requested_route).toBe(route)
    expect(result.result.actual_route).toBe(route)
    expect(result.result.activity_posture).toBe("incremental")
    expect(result.result.restriction_posture).toBe("cooperative")
    expect(result.result.packet_digest).toBe(createHash("sha256").update(readFileSync(f.packet)).digest("hex"))
    expect(realpathSync(result.result.raw_log)).toBe(path.join(realpathSync(f.resultDir), "adapter.log"))
    expect(result.result.model_actual).toBe("unverified")
    expect(result.result.model_receipt_status).toBe("unverified")
  })

  test("Cursor accepts a controller-bounded explicit model while Composer and Grok stay family-locked", () => {
    const override = (target: string, model: string, route = target) => emit(route, {
      ...cleanEnv(), CE_WORK_MODEL_OVERRIDE_TARGET: target, CE_WORK_MODEL_OVERRIDE: model,
    })
    const cursor = override("cursor", "claude-sonnet-5-low")
    expect(cursor.status).toBe(0)
    expect(cursor.stdout).toContain("--model claude-sonnet-5-low")

    for (const reserved of ["composer", COMPOSER_PRESET, "grok-4.6", "cursor-grok-4.6-high", GROK_CURSOR_PRESET]) {
      const rejected = override("cursor", reserved)
      expect(rejected.status).toBe(2)
      expect(rejected.stderr).toContain("not compatible")
    }
    expect(override("composer", "gpt-6.1-sol").status).toBe(2)
    expect(override("composer", "composer-next[fast=true]").stdout).toContain("--model composer-next[fast=true]")
    expect(override("grok", "grok-4.6[effort=high,fast=true]", "grok-cursor").stdout).toContain("--model grok-4.6[effort=high,fast=true]")
    expect(override("grok", "gpt-6[x=1]", "grok-cursor").status).toBe(2)
    expect(override("grok", "grok-4.7[x;y]", "grok-cursor").status).toBe(2)
  })

  test("the acpx child sees npm's locations but no npm or provider credential", () => {
    const f = fixture()
    const bin = stubBin(f)
    const cursorConfig = path.join(f.root, "cursor-config")
    const secrets = {
      NPM_TOKEN: "SENTINEL-npm-token",
      npm_config__authToken: "SENTINEL-npm-auth",
      OPENAI_API_KEY: "SENTINEL-openai",
    }
    const result = run("cursor", f, withBin(bin, {
      CURSOR_CONFIG_DIR: cursorConfig,
      npm_config_cache: path.join(f.root, "npm-cache"),
      npm_config_registry: "http://registry.invalid/",
      NPM_CONFIG_USERCONFIG: path.join(f.root, "npmrc"),
      ...secrets,
    }))

    expect(result.code).toBe(0)
    const childEnv = captured(f, "env")
    expect(childEnv).toContain(`npm_config_cache=${path.join(f.root, "npm-cache")}`)
    expect(childEnv).toContain("npm_config_registry=http://registry.invalid/")
    expect(childEnv).toContain(`NPM_CONFIG_USERCONFIG=${path.join(f.root, "npmrc")}`)
    expect(childEnv).toContain("npm_config_prefer_offline=true")
    expect(childEnv).toContain(`CURSOR_CONFIG_DIR=${cursorConfig}`)
    for (const [name, value] of Object.entries(secrets)) {
      expect(childEnv).not.toContain(`${name}=`)
      expect(childEnv).not.toContain(value)
    }
  })

  test("Claude launches through the --safe-mode wrapper with USER and without credential variables", () => {
    const f = fixture()
    const bin = stubBin(f)
    const user = "ce-work-keychain-user"
    const apiSecret = "SENTINEL-claude-api-secret"
    const oauthSecret = "SENTINEL-claude-oauth-secret"
    const result = run("claude", f, withBin(bin, {
      USER: user,
      ANTHROPIC_API_KEY: apiSecret,
      CLAUDE_CODE_OAUTH_TOKEN: oauthSecret,
    }))

    expect(result.code).toBe(0)
    const childEnv = captured(f, "env")
    expect(childEnv).toContain(`USER=${user}`)
    expect(childEnv).not.toContain(apiSecret)
    expect(childEnv).not.toContain(oauthSecret)
    const launch = captured(f, "launch-env")
    expect(launch).toContain("--safe-mode")
    expect(launch).toContain(path.join(bin, "claude"))
  })

  test("target-scoped model overrides do not make unrelated route probes unavailable", () => {
    const composerOverride = {
      ...cleanEnv(),
      CE_WORK_MODEL_OVERRIDE_TARGET: "composer",
      CE_WORK_MODEL_OVERRIDE: "composer-next[fast=true]",
    }

    const codex = emit("codex", composerOverride)
    expect(codex.status).toBe(0)
    expect(codex.stdout).not.toContain("--model")
    expect(emit("composer", composerOverride).stdout).toContain("--model composer-next[fast=true]")
  })

  test("malformed model override bindings remain unavailable", () => {
    for (const env of [
      { CE_WORK_MODEL_OVERRIDE: "composer-next-fast" },
      { CE_WORK_MODEL_OVERRIDE_TARGET: "composer" },
      { CE_WORK_MODEL_OVERRIDE_TARGET: "unknown", CE_WORK_MODEL_OVERRIDE: "composer-next-fast" },
    ]) {
      const rejected = emit("codex", { ...cleanEnv(), ...env })
      expect(rejected.status).toBe(2)
      expect(rejected.stderr).toContain("not compatible")
    }
  })

  test.each([
    ["cursor", "claude-sonnet-5-5[context=300k,reasoning_effort=high]"],
    ["claude", "sonnet"],
    ["grok-cli", "grok-4.6"],
    ["grok-cursor", GROK_CURSOR_PRESET],
  ] as const)("production %s dispatch requests the authorized model %s", (route, model) => {
    const f = fixture()
    const bin = stubBin(f)
    const result = run(route, f, withBin(bin), undefined, { model_requested: model })
    expect(result.code).toBe(0)
    expect(flagValue(argv(f), "--model")).toBe(model)
    expect(result.result.model_requested).toBe(model)
  })

  test("Composer and Grok through Cursor default to Cursor's fast and high presets", () => {
    for (const [route, preset] of [["composer", COMPOSER_PRESET], ["grok-cursor", GROK_CURSOR_PRESET]] as const) {
      const f = fixture()
      const result = run(route, f, withBin(stubBin(f)))
      expect(result.code).toBe(0)
      expect(JSON.parse(readFileSync(f.prepared!.authorization_path, "utf8")).model_requested).toBe(preset)
      expect(flagValue(argv(f), "--model")).toBe(preset)
      expect(result.result.model_requested).toBe(preset)
    }
  })

  // bun 1.4's spawnSync waits for every holder of the child's output pipe. The
  // activity poller's sleep must not outlive the route, or each caller waits it out.
  test("a finished route returns without waiting out the activity poll interval", () => {
    const f = fixture()
    const bin = stubBin(f, acpStream({ sleep: 1 }))
    const started = Date.now()
    const result = run("codex", f, withBin(bin, { CE_WORK_ACTIVITY_POLL_SECS: "120" }))
    expect(result.code).toBe(0)
    // Far under the 120s poll interval, with room for a loaded machine.
    expect(Date.now() - started).toBeLessThan(60_000)
  }, 180_000)

  test("production dispatch derives the model from controller authorization, not ambient overrides", () => {
    const f = fixture()
    const bin = stubBin(f)
    const digest = createHash("sha256").update(readFileSync(f.packet)).digest("hex")
    const result = run(
      "composer",
      f,
      withBin(bin, { CE_WORK_MODEL_OVERRIDE_TARGET: "composer", CE_WORK_MODEL_OVERRIDE: "gpt-forged" }),
      digest,
      { model_requested: "composer-next[fast=true]" },
    )
    expect(result.code).toBe(0)
    expect(flagValue(argv(f), "--model")).toBe("composer-next[fast=true]")
    expect(captured(f, "argv")).not.toContain("gpt-forged")
    expect(result.result.model_requested).toBe("composer-next[fast=true]")
  })

  // One route per test: each run spawns the controller and adapter, and seven in one body can outlast the per-test timeout.
  test.each([
    ["codex", "reasoning_effort=high"],
    ["claude", "effort=high"],
    ["grok-cli", "reasoning_effort=xhigh"],
    ["cursor", null],
    ["composer", null],
    ["grok-cursor", null],
    ["opencode", null],
  ] as const)("%s without an authorized effort keeps the 13-key schema and its default effort argv", (route, effort) => {
    const f = fixture()
    const result = run(route, f, withBin(stubBin(f)))
    expect(result.code).toBe(0)
    const authorization = JSON.parse(readFileSync(f.prepared!.authorization_path, "utf8"))
    expect(Object.keys(authorization).sort()).toEqual([
      "activity_posture", "attempt_id", "harness", "intermediaries", "model_requested", "packet_digest",
      "restriction_posture", "restrictions", "route", "run_id", "schema_version", "target", "unit_id",
    ])
    const args = argv(f)
    if (effort) expect(args).toContain(effort)
    else expect(args.filter((arg) => /^(reasoning_)?effort=/.test(arg))).toEqual([])
    expect(result.result.effort_requested).toBeNull()
  })

  test.each([
    ["codex", "xhigh", "reasoning_effort=xhigh"],
    ["claude", "max", "effort=max"],
    ["grok-cli", "low", "reasoning_effort=low"],
  ] as const)("%s builds its effort option from the authorized effort %s", (route, effort, expected) => {
    const f = fixture()
    const digest = createHash("sha256").update(readFileSync(f.packet)).digest("hex")
    const result = run(
      route, f, withBin(stubBin(f), { CROSS_MODEL_EFFORT_OVERRIDE: "medium" }), digest, { effort_requested: effort },
    )
    expect(result.code).toBe(0)
    expect(JSON.parse(readFileSync(f.prepared!.authorization_path, "utf8")).effort_requested).toBe(effort)
    expect(argv(f)).toContain(expected)
    expect(captured(f, "argv")).not.toContain("medium")
    expect(result.result.effort_requested).toBe(effort)
    expect(result.result).not.toHaveProperty("effort_actual")
  })

  test.each([
    ["codex", "reasoning_effort=high"],
    ["cursor", "mode=agent"],
  ] as const)("a %s production start ignores an ambient effort override when no effort is authorized", (route, fragment) => {
    const f = fixture()
    const result = run(route, f, withBin(stubBin(f), { CROSS_MODEL_EFFORT_OVERRIDE: "xhigh" }))
    expect(result.code).toBe(0)
    expect(argv(f)).toContain(fragment)
    expect(captured(f, "argv")).not.toContain("xhigh")
    expect(result.result.effort_requested).toBeNull()
  })

  test.each([
    ["cursor", "high"],
    ["grok-cli", "max"],
    ["opencode", "max"],
  ] as const)("an authorized effort the %s route cannot honor publishes an unavailable receipt", (route, effort) => {
    const f = fixture()
    const digest = createHash("sha256").update(readFileSync(f.packet)).digest("hex")
    const result = run(route, f, withBin(stubBin(f)), digest, { effort_requested: effort })
    expect(result.code).toBe(2)
    expect(result.result.terminal_status).toBe("unavailable")
    expect(result.result.failure_reason).toContain(`'${effort}' not compatible with route '${route}'`)
    expect(result.result.effort_requested).toBe(effort)
    expect(existsSync(path.join(f.capture, "argv"))).toBe(false)
  })

  test.each([
    ["route mismatch", "codex", { route: "claude" }],
    ["Composer family mismatch", "composer", { model_requested: "gpt-6.1-sol" }],
    ["Composer preset on another family", "composer", { model_requested: "gpt-6.1-sol[fast=true]" }],
    ["Cursor Composer model", "cursor", { model_requested: COMPOSER_PRESET }],
    ["Cursor unqualified Grok model", "cursor", { model_requested: "grok-4.6" }],
    ["Cursor Grok route model", "cursor", { model_requested: "cursor-grok-4.6-high" }],
    ["adapter-unsafe model token", "cursor", { model_requested: "model@beta" }],
    ["unsafe preset token", "grok-cursor", { model_requested: "grok-4.7[a b]" }],
    ["unknown extra key", "codex", { effort: "xhigh" }],
    ["extra key beside an effort", "codex", { effort_requested: "xhigh", effort_actual: "xhigh" }],
    ["non-token effort", "codex", { effort_requested: "x high" }],
    ["effort that starts with a dash", "codex", { effort_requested: "--model" }],
    ["empty effort", "codex", { effort_requested: "" }],
    ["enforced posture claim", "codex", { restriction_posture: "adapter-enforced" }],
  ] as const)("forged %s authorization is rejected before CLI invocation", (_name, route, overrides) => {
    const f = fixture()
    const bin = stubBin(f)
    const digest = createHash("sha256").update(readFileSync(f.packet)).digest("hex")
    const result = run(route, f, withBin(bin), digest, overrides, true)
    expect(result.code).toBe(2)
    expect(result.stderr).toContain("controller authorization rejected")
    expect(result.result).toBeNull()
    expect(existsSync(path.join(f.capture, "argv"))).toBe(false)
  })

  test("controller handshake rejects hand-authored, cross-attempt, and cross-unit authorization", () => {
    for (const overrides of [
      {},
      { attempt_id: "attempt-2" },
      { unit_id: "U4" },
    ]) {
      const f = fixture()
      const bin = stubBin(f)
      const digest = createHash("sha256").update(readFileSync(f.packet)).digest("hex")
      const result = run("codex", f, withBin(bin), digest, overrides, true)
      expect(result.code).toBe(2)
      expect(result.stderr).toContain("controller dispatch authorization failed")
      expect(result.result).toBeNull()
      expect(existsSync(path.join(f.capture, "argv"))).toBe(false)
    }
  })

  test("controller handshake rejects a shell-prefixed runner argv before CLI invocation", () => {
    const f = fixture()
    const bin = stubBin(f)
    const digest = createHash("sha256").update(readFileSync(f.packet)).digest("hex")
    const result = run("codex", f, withBin(bin), digest, {}, false, ["bash"])

    expect(result.code).toBe(2)
    expect(result.stderr).toContain("controller dispatch authorization failed")
    expect(result.result).toBeNull()
    expect(existsSync(path.join(f.capture, "argv"))).toBe(false)
  })

  test("Grok through Cursor requires its controller-sanctioned intermediary", () => {
    const f = fixture()
    const bin = stubBin(f)
    const blocked = run(
      "grok-cursor",
      f,
      withBin(bin),
      createHash("sha256").update(readFileSync(f.packet)).digest("hex"),
      { intermediaries: [] },
      true,
    )
    expect(blocked.code).toBe(2)
    expect(blocked.stderr).toContain("authorization")
    expect(blocked.result).toBeNull()
    expect(existsSync(path.join(f.capture, "argv"))).toBe(false)

    const allowed = run("grok-cursor", f, withBin(bin))
    expect(allowed.code).toBe(0)
  })

  test("a quiet route reports no activity before byte growth", () => {
    const f = fixture()
    const bin = stubBin(f, acpStream(), "sleep 1.1; exit 7")
    const result = run("claude", f, withBin(bin, { CE_WORK_ACTIVITY_POLL_SECS: "1" }))
    expect(result.code).toBe(2)
    expect(result.stderr).not.toContain("output-updated")
  })

  test("raw route output is capped", () => {
    const f = fixture()
    const bin = stubBin(f, acpStream(), "printf '%02048d' 0; exit 0")
    const result = run("claude", f, withBin(bin, { CE_WORK_MAX_RAW_BYTES: "256" }))
    expect(result.code).toBe(1)
    expect(result.result.terminal_status).toBe("unavailable")
    expect(result.result.failure_reason).toContain("exceeded 256 bytes")
    expect(statSync(path.join(f.resultDir, "adapter.log")).size).toBeLessThanOrEqual(256)
  })

  test("an app-bundled codex CLI off PATH satisfies the codex route (issue #1272)", () => {
    const f = fixture()
    const bin = stubBin(f)
    const bundle = path.join(temp("ce-work-bundle-"), "Codex.app", "Contents", "Resources")
    mkdirSync(bundle, { recursive: true })
    writeFileSync(path.join(bundle, "codex"), "#!/bin/sh\nexit 0\n")
    chmodSync(path.join(bundle, "codex"), 0o755)
    rmSync(path.join(bin, "codex"))
    const result = run("codex", f, { ...cleanEnv(), PATH: isolatedPath(bin), CROSS_MODEL_CODEX_APP_DIRS: bundle })
    expect(result.result.terminal_status).toBe("completed")
    expect(captured(f, "launch-env")).toContain(`CODEX_PATH=${path.join(bundle, "codex")}`)
  })

  test.each([...ROUTES])("%s is unavailable when enforceable confinement is required", (route) => {
    const f = fixture()
    const bin = stubBin(f)
    const result = run(route, f, withBin(bin, { CE_WORK_REQUIRE_ENFORCED_CONFINEMENT: "1" }))
    expect(result.code).toBe(2)
    expect(result.result.terminal_status).toBe("unavailable")
    expect(result.result.failure_reason).toContain("cooperative")
    expect(existsSync(path.join(f.capture, "argv"))).toBe(false)
  })
})

describe("ce-work acpx outcomes", () => {
  test("an end_turn after acpx exit 5 (a denied permission) is read as a finished turn", () => {
    const f = fixture()
    const result = run("codex", f, withBin(stubBin(f, path.join(STREAMS, "permission-denied-end-turn"))))
    expect(result.code).toBe(1)
    expect(result.result.terminal_status).toBe("failed")
    expect(result.result.failure_reason).toContain("schema")

    const g = fixture()
    const ok = run("codex", g, withBin(stubBin(g, acpStream({ exit: 5 }))))
    expect(ok.code).toBe(0)
    expect(ok.result.terminal_status).toBe("completed")
  })

  test.each([
    ["cancelled", acpStream({ stopReason: "cancelled" }), "ended with cancelled"],
    ["errored", acpStream({ error: "quota exhausted", exit: 1 }), "quota exhausted"],
    ["incomplete", acpStream({ stopReason: null, exit: 3 }), "ended with incomplete"],
  ] as const)("a %s prompt is a launched-route failure", (_name, stream, reason) => {
    const f = fixture()
    const result = run("grok-cli", f, withBin(stubBin(f, stream)))
    expect(result.code).toBe(1)
    expect(result.result.terminal_status).toBe("failed")
    expect(result.result.actual_route).toBe("grok-cli")
    expect(result.result.failure_reason).toContain(reason)
    expect(readFileSync(path.join(f.resultDir, "adapter.log"), "utf8")).toContain("session/prompt")
    expect(argv(f)).toContain("grok-build")
  })

  test.each([
    ["npm could not fetch acpx", path.join(STREAMS, "npm-fetch-failure"), "pre-egress, shared): npm error"],
    ["the adapter rejected the model", path.join(STREAMS, "unknown-model"), "pre-egress, route): Cannot apply --model"],
  ] as const)("a prompt never sent because %s is unavailable, not failed", (_name, stream, reason) => {
    const f = fixture()
    const result = run("claude", f, withBin(stubBin(f, stream)))
    expect(result.code).toBe(2)
    expect(result.result.terminal_status).toBe("unavailable")
    expect(result.result.actual_route).toBeNull()
    expect(result.result.failure_reason).toContain(`transport unavailable (${reason}`)
  })

  test.each([
    ["Node too old", "node", "#!/bin/sh\necho 20.9.0\n", "pre-egress, shared): Node 20.9.0 is too old"],
    ["jq missing", "jq", null, "pre-egress, shared): jq not found"],
  ] as const)("%s makes every route unavailable before acpx starts", (_name, tool, body, reason) => {
    const f = fixture()
    const bin = stubBin(f)
    if (body !== null) {
      writeFileSync(path.join(bin, tool), body)
      chmodSync(path.join(bin, tool), 0o755)
    }
    const result = run("codex", f, { ...cleanEnv(), PATH: isolatedPath(bin, [tool]) })
    expect(result.code).toBe(2)
    expect(result.result.failure_reason).toContain(`transport unavailable (${reason}`)
    expect(existsSync(path.join(f.capture, "argv"))).toBe(false)
  })

  test("an acpx config that replaces the route's agent launch makes the route unavailable", () => {
    const f = fixture()
    const bin = stubBin(f)
    const home = temp("ce-work-home-")
    mkdirSync(path.join(home, ".acpx"))
    writeFileSync(path.join(home, ".acpx", "config.json"), JSON.stringify({ agents: { codex: { command: "evil" } } }))
    const result = run("codex", f, { ...cleanEnv(), PATH: isolatedPath(bin), HOME: home })
    expect(result.code).toBe(2)
    expect(result.result.failure_reason).toContain("transport unavailable (pre-egress, route)")
    expect(result.result.failure_reason).toContain("'codex' agent launch")
    expect(existsSync(path.join(f.capture, "argv"))).toBe(false)
  })

  test("a missing agent CLI records an unavailable route before acpx starts", () => {
    const f = fixture()
    const bin = stubBin(f)
    rmSync(path.join(bin, "grok"))
    const result = run("grok-cli", f, { ...cleanEnv(), PATH: isolatedPath(bin) })
    expect(result.code).toBe(2)
    expect(result.result.failure_reason).toBe("transport unavailable (pre-egress, route): the agent CLI for route 'grok-cli' is not installed")
  })
})

describe("ce-work adapter results, identity, and secret handling", () => {
  test("packet bytes must match the controller-provided digest before egress", () => {
    const f = fixture()
    const expected = createHash("sha256").update(readFileSync(f.packet)).digest("hex")
    writeFileSync(f.packet, "Implement a different and broader unit.\n")
    const bin = stubBin(f)
    const result = run("claude", f, withBin(bin), expected)
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
      model_receipt_status: "asserted",
    })
    const meta = { quota: { model_usage: [{ model: "claude-fable-5", token_count: { totalTokens: 10 } }] } }
    const bin = stubBin(f, acpStream({ text: response, meta }))
    const result = run("claude", f, withBin(bin))
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

  test("the worker result in the agent's reply is published with the adapter-asserted served model", () => {
    const f = fixture()
    const meta = { quota: { model_usage: [{ model: "gpt-6.1-sol", token_count: { totalTokens: 900 } }] } }
    const bin = stubBin(f, acpStream({ text: ["Done. Result:\n```json\n", COMPLETED, "\n```"], meta }))
    const result = run("codex", f, withBin(bin), undefined, { model_requested: "gpt-6.1-sol" })
    expect(result.code).toBe(0)
    expect(result.result).toMatchObject({
      terminal_status: "completed",
      summary: "implemented",
      changed_files: ["result.txt"],
      model_requested: "gpt-6.1-sol",
      model_actual: "gpt-6.1-sol",
      model_receipt_status: "asserted",
    })
  })

  test.each([
    ["grok-cursor", GROK_CURSOR_PRESET, "grok-4.7", "asserted"],
    ["composer", COMPOSER_PRESET, "grok-4.7", "mismatch"],
    ["composer", COMPOSER_PRESET, "composer-2.5", "asserted"],
  ] as const)("%s requesting %s with served label %s records %s", (route, requested, served, receipt) => {
    const f = fixture()
    const bin = stubBin(f, acpStream({ meta: { modelId: served } }))
    const result = run(route, f, withBin(bin))
    expect(result.result.model_requested).toBe(requested)
    expect(result.result.model_actual).toBe(served)
    expect(result.result.model_receipt_status).toBe(receipt)
  })

  test.each([
    ["claude-fable-5", "claude-fable-5", "asserted"],
    ["claude-fable-5\u001b[1m", "claude-fable-5", "asserted"],
    ["claude-opus-4-8", "claude-opus-4-8", "mismatch"],
    [null, "unverified", "unverified"],
  ] as const)("Claude served-model report %s records %s as %s", (served, actual, receipt) => {
    const f = fixture()
    // Claude also reports its auxiliary Haiku; the requested family wins over it.
    const meta = served === null ? undefined : { quota: { model_usage: [
      { model: "claude-haiku-4-5", token_count: { totalTokens: 5000 } },
      { model: served, token_count: { totalTokens: 100 } },
    ] } }
    const result = run("claude", f, withBin(stubBin(f, acpStream({ meta }))), undefined, { model_requested: "fable" })
    expect(result.result.model_actual).toBe(receipt === "mismatch" ? "claude-haiku-4-5" : actual)
    expect(result.result.model_receipt_status).toBe(receipt)
  })

  test.each(["adapter-log", "result-dir"] as const)(
    "refuses a worker-substituted %s symlink without touching its outside target",
    (substitution) => {
      const f = fixture()
      const expectedResultDir = path.join(f.runs, "route-run", "units", "U3", "result")
      const outsideDir = path.join(f.root, "outside")
      const outsideLog = path.join(outsideDir, "adapter.log")
      mkdirSync(outsideDir)
      writeFileSync(outsideLog, "outside evidence\n", { mode: 0o644 })
      chmodSync(outsideLog, 0o644)
      const substitute = substitution === "adapter-log"
        ? `ln -s '${outsideLog}' '${expectedResultDir}/adapter.log'`
        : `mv '${expectedResultDir}' '${expectedResultDir}.original'\nln -s '${outsideDir}' '${expectedResultDir}'`
      const bin = stubBin(f, acpStream(), substitute)

      const result = run("claude", f, withBin(bin))

      expect(result.code).toBe(2)
      expect(result.stderr).toContain("adapter log retention refused")
      expect(readFileSync(outsideLog, "utf8")).toBe("outside evidence\n")
      expect(statSync(outsideLog).mode & 0o777).toBe(0o644)
    },
  )

  test.each([
    ["normal", 0],
    ["launched-route failure", 1],
  ] as const)(
    "the %s receipt path fails closed when an exited route swaps the result dir after log retention",
    (_receiptPath, routeExit) => {
      const f = fixture()
      const expectedResultDir = path.join(f.runs, "route-run", "units", "U3", "result")
      const originalResultDir = `${expectedResultDir}.original`
      const outsideDir = path.join(f.root, "outside")
      const outsideResult = path.join(outsideDir, "implementation-result.json")
      const publishStarted = path.join(f.capture, "receipt-publication-started")
      const swapDone = path.join(f.capture, "result-dir-swap-done")
      const python3 = spawnSync("which", ["python3"], { encoding: "utf8" }).stdout.trim()
      mkdirSync(outsideDir)
      writeFileSync(outsideResult, '{"sentinel":"outside"}\n', { mode: 0o644 })
      chmodSync(outsideResult, 0o644)

      const stream = routeExit === 0 ? acpStream() : acpStream({ error: "stub agent failure", exit: 1 })
      const bin = stubBin(f, stream, `(
  while [ ! -e '${publishStarted}' ]; do sleep 0.01; done
  mv '${expectedResultDir}' '${originalResultDir}'
  ln -s '${outsideDir}' '${expectedResultDir}'
  : > '${swapDone}'
) </dev/null >/dev/null 2>&1 &`)
      writeFileSync(path.join(bin, "python3"), `#!/bin/sh
set -eu
case "\${2:-}" in
  *"result receipt publication refused"*)
    : > '${publishStarted}'
    attempts=0
    while [ ! -e '${swapDone}' ]; do
      attempts=$((attempts + 1))
      [ "$attempts" -lt 500 ] || exit 97
      sleep 0.01
    done
    ;;
esac
exec '${python3}' "$@"
`)
      chmodSync(path.join(bin, "python3"), 0o755)

      const result = run("claude", f, withBin(bin))

      expect(result.code).toBe(2)
      expect(result.stderr).toContain("result receipt publication refused")
      expect(readFileSync(outsideResult, "utf8")).toBe('{"sentinel":"outside"}\n')
      expect(statSync(outsideResult).mode & 0o777).toBe(0o644)
      expect(existsSync(path.join(originalResultDir, "implementation-result.json"))).toBe(false)
      expect(readFileSync(path.join(originalResultDir, "adapter.log"), "utf8")).toContain("session/prompt")
    },
  )

  test("scope expansion is terminalized for host handling", () => {
    const f = fixture()
    const response = '{"terminal_status":"scope_expansion","summary":"shared contract needed","changed_files":[],"evidence":[],"scope_expansion":{"requested_paths":["shared.ts"],"reason":"required by unit"}}'
    const result = run("claude", f, withBin(stubBin(f, acpStream({ text: response }))))
    expect(result.code).toBe(0)
    expect(result.result.terminal_status).toBe("scope_expansion")
    expect(result.result.scope_expansion.requested_paths).toEqual(["shared.ts"])
  })

  test("blocked output is terminalized for host handling", () => {
    const f = fixture()
    const response = '{"terminal_status":"blocked","summary":"needs host input","changed_files":[],"evidence":["dependency unavailable"],"scope_expansion":null}'
    const result = run("claude", f, withBin(stubBin(f, acpStream({ text: response }))))
    expect(result.code).toBe(0)
    expect(result.result).toMatchObject({
      terminal_status: "blocked",
      summary: "needs host input",
      evidence: ["dependency unavailable"],
    })
  })

  test("sentinel values are removed from environment, prompt, result, log, and argv", () => {
    const sentinelPrefix = "SENTINEL-credential"
    const sentinel = "SENTINEL-credential-123"
    const sentinelSuffix = "-123"
    const f = fixture()
    writeFileSync(f.packet, `Implement U3. Token: ${sentinel}\n`)
    const redactions = path.join(f.root, "redactions")
    writeFileSync(redactions, `${sentinelPrefix}\n${sentinel}\n${sentinelPrefix}\n`)
    const response = `{"terminal_status":"completed","summary":"saw ${sentinel}","changed_files":["result.txt"],"evidence":[],"scope_expansion":null}`
    const bin = stubBin(f, acpStream({ text: response }))
    const result = run("codex", f, withBin(bin, { CE_WORK_REDACT_FILE: redactions, SENTINEL_ENV: sentinel }))
    expect(result.code).toBe(0)
    for (const file of ["argv", "prompt", "env"]) {
      expect(captured(f, file)).not.toContain(sentinel)
      expect(captured(f, file)).not.toContain(sentinelSuffix)
    }
    for (const file of readdirSync(f.resultDir)) {
      expect(readFileSync(path.join(f.resultDir, file), "utf8")).not.toContain(sentinel)
      expect(readFileSync(path.join(f.resultDir, file), "utf8")).not.toContain(sentinelSuffix)
      expect(statSync(path.join(f.resultDir, file)).mode & 0o777).toBe(0o600)
    }
    expect(statSync(f.resultDir).mode & 0o777).toBe(0o700)
    expect(JSON.stringify(result.result)).not.toContain(sentinel)
    expect(result.result.summary).toBe("saw [REDACTED]")
    expect(captured(f, "prompt")).toContain("[REDACTED]")
  })

  // acpx echoes the outbound prompt and the files the agent reads; both reach
  // the stream JSON-escaped, and failure evidence quotes the stream.
  test("a redacted value echoed by acpx is absent from adapter.log and failure evidence", () => {
    const secret = 'quote"secret-café'
    const f = fixture()
    writeFileSync(f.packet, `Implement U3. Token: ${secret}\n`)
    const redactions = path.join(f.root, "redactions")
    writeFileSync(redactions, `${secret}\n`)
    const stream = acpStream({
      prompt: `Implement U3. Token: ${secret}`,
      text: `I read config.env: ${secret}`,
      error: `provider rejected ${secret}`,
      exit: 1,
    })
    expect(readFileSync(`${stream}.stdout`, "utf8")).toContain(JSON.stringify(secret).slice(1, -1))
    const result = run("codex", f, withBin(stubBin(f, stream), { CE_WORK_REDACT_FILE: redactions }))

    expect(result.code).toBe(1)
    expect(result.result.terminal_status).toBe("failed")
    expect(result.result.failure_reason).toContain("provider rejected [REDACTED]")
    const log = readFileSync(path.join(f.resultDir, "adapter.log"), "utf8")
    expect(log).toContain("[REDACTED]")
    for (const observed of [log, JSON.stringify(result.result)]) {
      expect(observed).not.toContain(secret)
      expect(observed).not.toContain(JSON.stringify(secret).slice(1, -1))
      expect(observed).not.toContain("secret-caf")
    }
  })

  test("a redacted value in npm's pre-egress error is absent from the unavailable receipt", () => {
    const secret = "SENTINEL-registry-token"
    const f = fixture()
    const redactions = path.join(f.root, "redactions")
    writeFileSync(redactions, `${secret}\n`)
    const stream = path.join(temp("ce-work-stream-"), "s")
    writeFileSync(`${stream}.stderr`, `npm error 401 Unauthorized - GET https://registry.invalid/${secret}/acpx\n`)
    writeFileSync(`${stream}.exit`, "1\n")
    const result = run("codex", f, withBin(stubBin(f, stream), { CE_WORK_REDACT_FILE: redactions }))

    expect(result.code).toBe(2)
    expect(result.result.failure_reason).toContain("transport unavailable (pre-egress, shared): npm error 401")
    expect(result.result.failure_reason).toContain("[REDACTED]")
    expect(JSON.stringify(result.result)).not.toContain(secret)
    expect(readFileSync(path.join(f.resultDir, "adapter.log"), "utf8")).not.toContain(secret)
  })

  test("raw output is redacted before retained evidence is capped", () => {
    const maxRawBytes = 256
    const sentinel = "BOUNDARY-SECRET-credential-123"
    const sentinelPrefix = sentinel.slice(0, 8)
    const f = fixture()
    const redactions = path.join(f.root, "redactions")
    writeFileSync(redactions, `${sentinel}\n`)
    const prefix = "x".repeat(maxRawBytes - sentinelPrefix.length)
    const bin = stubBin(f, acpStream(), `printf '%s' '${prefix}${sentinel}${"y".repeat(maxRawBytes)}'; exit 0`)

    const result = run("claude", f, withBin(bin, {
      CE_WORK_MAX_RAW_BYTES: String(maxRawBytes),
      CE_WORK_REDACT_FILE: redactions,
    }))

    expect(result.code).toBe(1)
    expect(result.result.terminal_status).toBe("unavailable")
    expect(result.result.failure_reason).toContain(`exceeded ${maxRawBytes} bytes`)
    const log = readFileSync(path.join(f.resultDir, "adapter.log"), "utf8")
    expect(Buffer.byteLength(log)).toBe(maxRawBytes)
    expect(log).not.toContain(sentinel)
    expect(log).not.toContain(sentinelPrefix)
    expect(log).toContain("[REDAC")
  })

  test("oversized raw output still publishes the bounded limit receipt under pipefail", () => {
    const maxRawBytes = 256
    const f = fixture()
    const bin = stubBin(f, acpStream(), `python3 -c 'import sys; sys.stdout.buffer.write(b"x" * 65536)'; exit 0`)

    const result = run("claude", f, withBin(bin, {
      CE_WORK_MAX_RAW_BYTES: String(maxRawBytes),
      CE_WORK_ACTIVITY_POLL_SECS: "1",
    }))

    expect(result.code).toBe(1)
    expect(result.result.terminal_status).toBe("unavailable")
    expect(result.result.failure_reason).toBe(`fixed route raw output exceeded ${maxRawBytes} bytes`)
    expect(result.stderr).not.toContain("result dir or adapter log identity changed")
    expect(statSync(path.join(f.resultDir, "adapter.log")).size).toBe(maxRawBytes)
  })

  test("malformed terminal output is a schema failure with a redacted log", () => {
    const f = fixture()
    const result = run("cursor", f, withBin(stubBin(f, acpStream({ text: "not-json" }))))
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
