import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { spawn, spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { ACPX_PIN } from "../helpers/acpx-pin"
import { alive } from "../helpers/process"

setDefaultTimeout(30_000)

const roots: string[] = []
function temp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  roots.push(dir)
  return dir
}
afterAll(() => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

const SCRIPT = path.join(__dirname, "../../skills/ce-pov/scripts/cross-model-pov.sh")
const STUB_NPX = path.join(__dirname, "../fixtures/acp-stub-npx.sh")
const STREAMS = path.join(__dirname, "../fixtures/acpx-streams")
const ROUTES = ["codex", "claude", "grok-cli", "grok-cursor", "cursor", "composer", "opencode"] as const
const ROUTE_BIN: Record<string, string> = {
  codex: "codex",
  claude: "claude",
  "grok-cli": "grok",
  "grok-cursor": "cursor-agent",
  cursor: "cursor-agent",
  composer: "cursor-agent",
  opencode: "opencode",
}
const PROVIDER_BINS = ["codex", "claude", "grok", "cursor-agent", "opencode"]
const NEVER_FLAGS = ["--yolo", "--force", "-f", "--always-approve", "--dangerously-skip-permissions", "--approve-all"]
const REAL_TOOLS = [
  "bash", "sh", "jq", "python3", "date", "sed", "tr", "cat", "wc", "dirname",
  "basename", "mktemp", "env", "perl", "timeout", "gtimeout", "sleep", "rm", "mv",
  "chmod", "cp", "printf", "kill", "mkdir", "grep", "tail", "ps", "sort",
]
let resolved: Array<[string, string]> | undefined
function realTools(): Array<[string, string]> {
  if (resolved) return resolved
  resolved = []
  for (const tool of REAL_TOOLS) {
    let actual = spawnSync("command", ["-v", tool], { encoding: "utf8", shell: "/bin/bash" }).stdout?.trim()
    // Version-manager shims re-resolve through PATH, which the sandbox replaces.
    const probe = tool === "python3"
      ? ["-c", "import sys; print(sys.executable)"]
      : tool === "perl"
        ? ["-MConfig", "-e", "print $Config{perlpath}"]
        : null
    if (probe && actual) {
      const standalone = spawnSync(actual, probe, { encoding: "utf8" }).stdout?.trim()
      if (standalone) actual = standalone
    }
    if (actual && existsSync(actual)) resolved.push([tool, actual])
  }
  return resolved
}

type Sandbox = ReturnType<typeof sandbox>
function sandbox(providers: string[], stream = acpStream({ text: pov() })) {
  const root = temp("pov-route-")
  const bin = path.join(root, "bin")
  const home = path.join(root, "home")
  mkdirSync(bin)
  mkdirSync(home)
  for (const [tool, actual] of realTools()) {
    try { symlinkSync(actual, path.join(bin, tool)) } catch { /* shell builtin */ }
  }
  symlinkSync(STUB_NPX, path.join(bin, "npx"))
  // The worker uses node only for its version check; a fixed compliant version
  // keeps these tests independent of the machine's Node.
  writeFileSync(path.join(bin, "node"), "#!/bin/sh\necho 24.0.0\n")
  chmodSync(path.join(bin, "node"), 0o755)
  for (const provider of providers) {
    const file = path.join(bin, provider)
    writeFileSync(file, "#!/bin/sh\nexit 0\n")
    chmodSync(file, 0o755)
  }
  const logs = {
    argv: path.join(root, "npx-argv.log"),
    env: path.join(root, "npx-env.log"),
    calls: path.join(root, "npx-calls"),
    prompt: path.join(root, "npx-prompt.log"),
    pids: path.join(root, "npx-pids"),
  }
  return {
    bin,
    home,
    logs,
    env: {
      ...process.env,
      PATH: bin,
      HOME: home,
      // Mask any real Codex.app bundle so discovery sees only what the test stages.
      CROSS_MODEL_CODEX_APP_DIRS: temp("pov-nobundle-"),
      ACP_STUB_NPX_STREAM: stream,
      ACP_STUB_NPX_ARGV_LOG: logs.argv,
      ACP_STUB_NPX_ENV_LOG: logs.env,
      ACP_STUB_NPX_CALLS: logs.calls,
      ACP_STUB_NPX_PROMPT_LOG: logs.prompt,
      ACP_STUB_NPX_PID_FILE: logs.pids,
    } as NodeJS.ProcessEnv,
  }
}
function replaceTool(bin: string, tool: string, body: string) {
  rmSync(path.join(bin, tool), { force: true })
  writeFileSync(path.join(bin, tool), body)
  chmodSync(path.join(bin, tool), 0o755)
}
function calls(sb: Sandbox) {
  return existsSync(sb.logs.calls) ? Number(readFileSync(sb.logs.calls, "utf8").trim()) : 0
}
function argv(sb: Sandbox) {
  return readFileSync(sb.logs.argv, "utf8").split("\n").slice(0, -1)
}
function envLog(sb: Sandbox) {
  return readFileSync(sb.logs.env, "utf8")
}

const POV = {
  voice: "peer",
  position: "Choose A",
  reasoning: "Lower correction cost",
  evidence: ["https://example.com"],
  external_check: "ran",
  mode: "independent",
  movement: "initial",
  final: true,
}
function pov(over: Record<string, unknown> = {}) {
  return JSON.stringify({ ...POV, ...over })
}

// Shaped like the captured acpx@0.19.4 streams in tests/fixtures/acpx-streams/, with
// the session/set_model request `--model` adds, so the prompt is not at a fixed id.
type StreamSpec = {
  text?: string | string[]
  stopReason?: string | null
  meta?: unknown
  error?: string
  prompt?: string
  exit?: number
  stderr?: string
  sleep?: number
}
function acpStream(spec: StreamSpec = {}, base = path.join(temp("pov-stream-"), "s")) {
  const rpc = (body: Record<string, unknown>) => JSON.stringify({ jsonrpc: "2.0", ...body })
  const sessionId = "stub-session-1"
  const lines = [
    rpc({ id: 0, method: "initialize", params: { protocolVersion: 1, clientInfo: { name: "acpx", version: ACPX_PIN } } }),
    rpc({ id: 0, result: { protocolVersion: 1, agentCapabilities: { loadSession: false }, authMethods: [] } }),
    rpc({ id: 1, method: "session/new", params: { cwd: "/tmp/cwd", mcpServers: [] } }),
    rpc({ id: 1, result: { sessionId } }),
    rpc({ id: 2, method: "session/set_model", params: { sessionId, modelId: "requested" } }),
    rpc({ id: 2, result: {} }),
    rpc({ id: 3, method: "session/prompt", params: { sessionId, prompt: [{ type: "text", text: spec.prompt ?? "Review the subject." }] } }),
  ]
  const texts = spec.text === undefined ? [] : Array.isArray(spec.text) ? spec.text : [spec.text]
  for (const text of texts) {
    lines.push(rpc({ method: "session/update", params: { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } } }))
  }
  if (spec.error !== undefined) {
    lines.push(rpc({ id: 3, error: { code: -32603, message: spec.error } }))
  } else if (spec.stopReason !== null) {
    lines.push(rpc({ id: 3, result: { stopReason: spec.stopReason ?? "end_turn", ...(spec.meta ? { _meta: spec.meta } : {}) } }))
  }
  writeFileSync(`${base}.stdout`, lines.join("\n") + "\n")
  writeFileSync(`${base}.exit`, `${spec.exit ?? 0}\n`)
  if (spec.stderr !== undefined) writeFileSync(`${base}.stderr`, spec.stderr)
  if (spec.sleep !== undefined) writeFileSync(`${base}.sleep`, `${spec.sleep}\n`)
  return base
}
function streamSequence(...specs: StreamSpec[]) {
  const base = path.join(temp("pov-stream-"), "s")
  specs.forEach((spec, i) => acpStream(spec, `${base}.${i + 1}`))
  return base
}

function payload(contents = "Subject: choose A or B\nProject floor: TypeScript CLI\n") {
  const file = path.join(temp("pov-payload-"), "subject.md")
  writeFileSync(file, contents)
  return file
}
function runDir() { return temp("pov-run-") }
function run(args: string[], dir: string, env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8", env })
  return {
    code: result.status ?? -1,
    stderr: result.stderr ?? "",
    files: existsSync(dir) ? readdirSync(dir) : [],
  }
}
function published(dir: string, target: string) {
  return JSON.parse(readFileSync(path.join(dir, `pov-${target}.json`), "utf8"))
}
function emit(route: string, env: NodeJS.ProcessEnv = sandbox(PROVIDER_BINS).env) {
  const result = spawnSync("bash", [SCRIPT, "--emit-adapter", route], { encoding: "utf8", env })
  expect(result.status).toBe(0)
  return result.stdout.trim()
}

describe("ce-pov cross-model route safety", () => {
  test("a provider-qualified codex model id is accepted; family is still checked", () => {
    const accepted = emit("codex", {
      ...process.env,
      CROSS_MODEL_MODEL_OVERRIDE_TARGET: "codex",
      CROSS_MODEL_MODEL_OVERRIDE: "openai.gpt-6.1-sol",
    })
    expect(accepted).toContain("openai.gpt-6.1-sol")
    const acceptedSlash = emit("codex", {
      ...process.env,
      CROSS_MODEL_MODEL_OVERRIDE_TARGET: "codex",
      CROSS_MODEL_MODEL_OVERRIDE: "openai/gpt-6.1-sol",
    })
    expect(acceptedSlash).toContain("openai/gpt-6.1-sol")
    expect(emit("grok-cursor", {
      ...process.env,
      CROSS_MODEL_MODEL_OVERRIDE_TARGET: "grok",
      CROSS_MODEL_MODEL_OVERRIDE: "cursor-grok-4.6-high",
    })).toContain("--model cursor-grok-4.6-high")

    const crossFamily = spawnSync("bash", [SCRIPT, "--emit-adapter", "codex"], {
      encoding: "utf8",
      env: {
        ...process.env,
        CROSS_MODEL_MODEL_OVERRIDE_TARGET: "codex",
        CROSS_MODEL_MODEL_OVERRIDE: "bedrock.claude-opus-5-5",
      },
    })
    expect(crossFamily.status).toBe(2)
    expect(crossFamily.stderr).toContain("not compatible with route")
  })

  test("all routes keep read-only permissions and avoid never-use flags", () => {
    const env = sandbox(PROVIDER_BINS).env
    for (const route of ROUTES) {
      const command = emit(route, env)
      const tokens = command.split(/\s+/)
      for (const denied of NEVER_FLAGS) expect(tokens).not.toContain(denied)
      expect(tokens).not.toContain("--deny-all")
      expect(command).toContain("--approve-reads --non-interactive-permissions deny")
      expect(command).not.toContain("bypassPermissions")
      expect(command).not.toContain("<run-dir>")
    }
    const source = readFileSync(SCRIPT, "utf8")
    // Zombies report as Z+ on macOS; exact "Z" alone leaves them "alive".
    expect(source).toContain('[ "${st#Z}" = "$st" ]')
    // Match peer-job-runner: empty ps state => not alive; kill -0 only if ps missing.
    expect(source).toContain("command -v ps")
    expect(source).toContain("[ -n \"$st\" ] || return 1")
    // Idle polls must use peer_alive (not bare kill -0) so zombies exit promptly.
    expect(source).toContain('while peer_alive "$pid"; do')
    expect(source).not.toMatch(/while kill -0 "\$pid"/)
    // After reap no longer waits, TERM/INT must wait the peer leader.
    expect(source).toMatch(/reap "\$_term_peer"[\s\S]*?wait "\$_term_peer"/)
  })

  test.each([
    ["codex", "--model gpt-6.1-sol codex exec", ["--config-option mode=read-only", "--config-option reasoning_effort=high"]],
    ["claude", "--model claude-opus-5-5 claude exec", ["--config-option mode=default", "--config-option effort=high", "--allowed-tools Read,Glob,Grep,WebSearch,WebFetch --max-turns 15"]],
    ["grok-cli", "--model grok-4.7 grok-build exec", ["--config-option reasoning_effort=xhigh"]],
    ["grok-cursor", "--model grok-4.7[context=256k,reasoning_effort=high,fast=true] cursor exec", ["--config-option mode=ask"]],
    ["cursor", "--non-interactive-permissions deny cursor exec", ["--config-option mode=ask"]],
    ["composer", "--model composer-2.5[fast=true] cursor exec", ["--config-option mode=ask"]],
    ["opencode", "--non-interactive-permissions deny --agent", ["opencode acp exec --config-option mode=plan"]],
  ])("--emit-adapter %s launches pinned acpx with the route's agent, model, and read-only options", (route, agent, options) => {
    const command = emit(route)
    expect(command).toContain(`npx -y acpx@${ACPX_PIN} --cwd <read-root> --format json --mcp-config <mcp-config> --timeout 600`)
    expect(command).toContain("env npm_config_prefer_offline=true npm_config_fetch_retries=0")
    expect(command).toContain("--approve-reads --non-interactive-permissions deny")
    expect(command).toContain(agent)
    for (const option of options) expect(command).toContain(option)
    expect(command).toEndWith("--file <prompt-file>")
    if (route === "cursor" || route === "opencode") expect(command).not.toContain("--model")
  })

  test("same-family model override changes only model-specific routes", () => {
    const composer = emit("composer", {
      ...process.env,
      CROSS_MODEL_MODEL_OVERRIDE: "composer-next-fast",
      CROSS_MODEL_MODEL_OVERRIDE_TARGET: "composer",
    })
    expect(composer).toContain("--model composer-next-fast cursor exec")
    expect(composer).toContain("--cwd <read-root>")

    const rejected = spawnSync("bash", [SCRIPT, "--emit-adapter", "grok-cursor"], {
      encoding: "utf8",
      env: {
        ...process.env,
        CROSS_MODEL_MODEL_OVERRIDE: "composer-next-fast",
        CROSS_MODEL_MODEL_OVERRIDE_TARGET: "composer",
      },
    })
    expect(rejected.status).toBe(2)
    expect(rejected.stderr).toContain("not compatible with route")

    const unbound = spawnSync("bash", [SCRIPT, "--emit-adapter", "composer"], {
      encoding: "utf8",
      env: { ...process.env, CROSS_MODEL_MODEL_OVERRIDE: "composer-next-fast" },
    })
    expect(unbound.status).toBe(2)
    expect(unbound.stderr).toContain("not compatible with route")
  })

  test("web is enabled only through bounded route-specific capabilities", () => {
    const env = sandbox(PROVIDER_BINS).env
    const claude = emit("claude", env).split(/\s+/)
    expect(claude[claude.indexOf("--allowed-tools") + 1]).toBe("Read,Glob,Grep,WebSearch,WebFetch")
    for (const route of ROUTES.filter((r) => r !== "claude")) expect(emit(route, env)).not.toContain("--allowed-tools")
    expect(emit("opencode", env)).toContain('"webfetch":"deny"')
  })
})

describe("ce-pov output gate and receipts", () => {
  test.each([
    ["missing position", '{"reasoning":"why"}'],
    ["empty position", '{"position":"","reasoning":"why"}'],
    ["missing reasoning", '{"position":"Choose A"}'],
    ["missing mode", pov({ mode: undefined })],
    ["missing evidence", pov({ evidence: undefined })],
    ["non-string evidence item", pov({ evidence: [42] })],
    ["empty evidence item", pov({ evidence: [""] })],
    ["missing external check", pov({ external_check: undefined })],
    ["missing voice", pov({ voice: undefined })],
    ["missing movement", '{"position":"Choose A","reasoning":"why"}'],
    ["invalid movement", pov({ movement: "changed" })],
  ])("%s fails the fixed route without publishing an artifact", (_name, invalid) => {
    const { env } = sandbox(["claude"], acpStream({ text: invalid }))
    const dir = runDir()
    const scratchParent = temp("pov-invalid-scratch-")
    const result = run(["codex", "claude", payload(), dir], dir, {
      ...env,
      CROSS_MODEL_SCRATCH_PARENT: scratchParent,
    })
    expect(result.code).toBe(0)
    expect(result.files).not.toContain("pov-claude.json")
    expect(readdirSync(scratchParent)).toEqual([])
  })

  test.each([
    ["codex", "claude", { quota: { model_usage: [{ model: "gpt-6.1-sol", token_count: { totalTokens: 1200 } }] } }, "gpt-6.1-sol", false],
    ["grok-cli", "codex", { modelId: "grok-4.7" }, "grok-4.7", false],
    ["claude", "codex", { quota: { model_usage: [
      { model: "claude-haiku-4-5", token_count: { totalTokens: 5000 } },
      { model: "claude-opus-5-5-20260801", token_count: { totalTokens: 100 } },
    ] } }, "claude-opus-5-5-20260801", false],
    ["grok-cursor", "codex", { modelId: "grok-4.7[context=256k,reasoning_effort=high,fast=true]" }, "grok-4.7[context=256k,reasoning_effort=high,fast=true]", false],
    ["codex", "claude", { quota: { model_usage: [{ model: "gpt-5.5", token_count: { totalTokens: 10 } }] } }, "gpt-5.5", true],
  ])("an end_turn %s reply is published with model_actual from the adapter's _meta", (route, host, meta, actual, mismatch) => {
    const sb = sandbox([ROUTE_BIN[route]], acpStream({ text: pov(), meta }))
    const dir = runDir()
    const result = run([host, route, payload(), dir], dir, sb.env)
    const target = route.startsWith("grok") ? "grok" : route
    expect(result.files).toContain(`pov-${target}.json`)
    const out = published(dir, target)
    expect(out.model_actual).toBe(actual)
    expect(out.independence_verified).toBe(true)
    expect(result.stderr.includes("model mismatch")).toBe(mismatch)
  })

  test("accepts the fable alias as a claude override and verifies its receipt", () => {
    const meta = { quota: { model_usage: [{ model: "claude-fable-5", token_count: { totalTokens: 10 } }] } }
    const { env } = sandbox(["claude"], acpStream({ text: pov(), meta }))
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, {
      ...env,
      CROSS_MODEL_MODEL_OVERRIDE_TARGET: "claude",
      CROSS_MODEL_MODEL_OVERRIDE: "fable",
    })
    expect(result.files).toContain("pov-claude.json")
    const out = published(dir, "claude")
    expect(out.model_requested).toBe("fable")
    expect(out.model_actual).toBe("claude-fable-5")
    expect(result.stderr).not.toContain("model mismatch")
  })

  test("a settled final object in the reply beats a later non-final draft", () => {
    const text = `${pov()}\n${pov({ position: "gathering evidence", final: false })}`
    const sb = sandbox(["grok"], acpStream({ text }))
    const dir = runDir()
    const result = run(["codex", "grok-cli", payload(), dir], dir, sb.env)
    expect(result.files).toContain("pov-grok.json")
    expect(published(dir, "grok").position).toBe("Choose A")
    expect(result.stderr).not.toContain("non-final position")
    expect(calls(sb)).toBe(1)
  })

  test("a valid final POV in the reply is not outranked by a later fully keyed but invalid draft", () => {
    const invalid = pov({ position: "Choose B", reasoning: 42, evidence: "none", external_check: "maybe" })
    const badEvidence = pov({ position: "Choose C", evidence: [42, ""] })
    const { env } = sandbox(["claude"], acpStream({ text: [pov(), invalid, badEvidence] }))
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)
    expect(result.files).toContain("pov-claude.json")
    expect(published(dir, "claude").position).toBe("Choose A")
  })

  test("a shaped artifact that omits final is non-final, whatever its position says", () => {
    const sb = sandbox(["claude"], acpStream({ text: pov({ final: undefined }) }))
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, sb.env)
    expect(calls(sb)).toBe(2)
    expect(result.files).not.toContain("pov-claude.json")
    expect(result.stderr).toContain("peer skip evidence: non-final position: Choose A")
  })

  test("a non-final position is retried once on the same route and published after exactly two acpx calls", () => {
    const placeholder = pov({ position: "blocked: gathering subject evidence", final: false })
    const sb = sandbox(["grok"], streamSequence(
      { text: placeholder, meta: { modelId: "grok-4.7" } },
      { text: pov(), meta: { modelId: "grok-4.7" } },
    ))
    const dir = runDir()
    const result = run(["codex", "grok-cli", payload(), dir], dir, sb.env)
    expect(calls(sb)).toBe(2)
    expect(result.stderr).toContain('non-final position ("blocked: gathering subject evidence")')
    expect(readFileSync(`${sb.logs.prompt}.1`, "utf8")).not.toContain("This response is the final one")
    expect(readFileSync(`${sb.logs.prompt}.2`, "utf8")).toContain("This response is the final one")
    expect(argv(sb)).toContain("grok-build")
    expect(result.files).toContain("pov-grok.json")
    expect(published(dir, "grok").position).toBe("Choose A")
  })

  test("a second non-final position drops the voice with skip evidence naming it", () => {
    const sb = sandbox(["claude"], acpStream({ text: pov({ position: "Blocked: still gathering evidence", final: false }) }))
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, sb.env)
    expect(result.code).toBe(0)
    expect(calls(sb)).toBe(2)
    expect(result.files).not.toContain("pov-claude.json")
    expect(result.stderr).toContain("peer skip evidence: non-final position: Blocked: still gathering evidence")
  })

  test.each([
    ["settled Hold", "Hold: do not adopt"],
    ["settled Blocked grounding-floor verdict", "Blocked — insufficient project grounding"],
    ["settled Blocked approach-set verdict", "Blocked: the supplied approaches lack enough detail to choose"],
  ])("a %s position marked final is accepted, whatever its wording", (_name, position) => {
    const { env } = sandbox(["claude"], acpStream({ text: pov({ position, evidence: [], external_check: "unavailable" }) }))
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)
    expect(result.files).toContain("pov-claude.json")
    expect(result.stderr).not.toContain("non-final position")
  })

  test("a non-final position with no hard window left is dropped without a retry", () => {
    const sb = sandbox(["claude"], acpStream({ text: pov({ position: "pending: reading the tree", final: false }) }))
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, { ...sb.env, CROSS_MODEL_HARD_SECS: "60", CROSS_MODEL_RETRY_MIN_SECS: "61" })
    expect(calls(sb)).toBe(1)
    expect(result.files).not.toContain("pov-claude.json")
    expect(result.stderr).toContain("not retrying")
    expect(result.stderr).toContain("peer skip evidence: non-final position: pending: reading the tree")
  })

  test("normalizes a reply split across message chunks with route and served-model receipts", () => {
    const text = pov()
    const meta = { quota: { model_usage: [{ model: "claude-opus-5-5-20260801", token_count: { totalTokens: 10 } }] } }
    const { env } = sandbox(["claude"], acpStream({ text: [text.slice(0, 40), text.slice(40)], meta }))
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)
    expect(result.files).toContain("pov-claude.json")
    expect(published(dir, "claude")).toEqual({
      voice: "peer-claude",
      cross_model_route: "claude",
      cross_model_target: "claude",
      cross_model_harness: "claude",
      serving_family: "claude",
      model_requested: "claude-opus-5-5",
      model_actual: "claude-opus-5-5-20260801",
      independence_verified: true,
      position: "Choose A",
      reasoning: "Lower correction cost",
      evidence: ["https://example.com"],
      external_check: "ran",
      mode: "independent",
      movement: "initial",
      final: true,
    })
  })

  test("recovers a fenced POV surrounded by prose; no _meta leaves composer unverified", () => {
    const text = `Here is my answer:\n\`\`\`json\n${pov({ position: "Choose B", reasoning: "The boundary is clearer" })}\n\`\`\`\nDone.`
    const { env } = sandbox(["cursor-agent"], acpStream({ text }))
    const dir = runDir()
    const result = run(["codex", "composer", payload(), dir], dir, env)
    expect(result.files).toContain("pov-composer.json")
    const out = published(dir, "composer")
    expect(out.position).toBe("Choose B")
    expect(out.reasoning).toBe("The boundary is clearer")
    expect(out.model_actual).toBe("unverified")
    expect(out.serving_family).toBe("unknown")
    expect(out.independence_verified).toBe(false)
  })

  test("Cursor default records auto and unverified independence", () => {
    const { env } = sandbox(["cursor-agent"], acpStream({ text: pov({ position: "Hold" }) }))
    const dir = runDir()
    const result = run(["codex", "cursor", payload(), dir], dir, env)
    expect(result.files).toContain("pov-cursor.json")
    const out = published(dir, "cursor")
    expect(out.cross_model_route).toBe("cursor")
    expect(out.cross_model_target).toBe("cursor")
    expect(out.cross_model_harness).toBe("cursor-agent")
    expect(out.serving_family).toBe("unknown")
    expect(out.model_requested).toBe("auto")
    expect(out.model_actual).toBe("unverified")
    expect(out.independence_verified).toBe(false)
  })

  test("an auto route records an adapter-reported model without a mismatch warning", () => {
    const { env } = sandbox(["cursor-agent"], acpStream({ text: pov(), meta: { modelId: "composer-2.5" } }))
    const dir = runDir()
    const result = run(["codex", "cursor", payload(), dir], dir, env)
    expect(published(dir, "cursor").model_actual).toBe("composer-2.5")
    expect(result.stderr).not.toContain("model mismatch")
  })

  test("acpx starts from private scratch, never the reviewed repository", () => {
    const sb = sandbox(["codex"])
    const dir = runDir()
    run(["claude", "codex", payload(), dir], dir, sb.env)
    const pwd = envLog(sb).match(/^PWD=(.*)$/m)?.[1] ?? ""
    expect(path.basename(pwd)).toStartWith("xmodel-pov-peer-")
    expect(pwd.startsWith(realpathSync(process.cwd()))).toBe(false)
  })

  test("an explicitly named peer can run with unknown host family but is not independent", () => {
    const { env } = sandbox(["claude"], acpStream({ text: pov({ position: "Hold" }) }))
    const dir = runDir()
    const result = run(["unknown", "claude", payload(), dir], dir, {
      ...env,
      CROSS_MODEL_HOST_HARNESS: "cursor",
    })
    expect(result.files).toContain("pov-claude.json")
    expect(published(dir, "claude").independence_verified).toBe(false)
  })

  test("acpx exit 5 after an end_turn result (a denied permission request) still publishes", () => {
    const sb = sandbox(["codex"], acpStream({ text: pov(), exit: 5 }))
    const dir = runDir()
    const result = run(["claude", "codex", payload(), dir], dir, sb.env)
    expect(result.files).toContain("pov-codex.json")
  })

  test("a cancelled turn that exits 0 is not published even with a POV in its reply", () => {
    const sb = sandbox(["codex"], acpStream({ text: pov(), stopReason: "cancelled", exit: 0 }))
    const dir = runDir()
    const result = run(["claude", "codex", payload(), dir], dir, sb.env)
    expect(result.files).not.toContain("pov-codex.json")
    expect(result.stderr).toContain("peer skip evidence: stopReason=cancelled")
  })

  test.each([
    ["prompt-error", "stub agent failure"],
    ["timeout", "Timed out after 2000ms"],
    ["cancelled", "stopReason=cancelled"],
  ])("captured %s stream is not published and its ACP evidence is logged", (fixture, evidence) => {
    const sb = sandbox(["codex"], path.join(STREAMS, fixture))
    const dir = runDir()
    const result = run(["claude", "codex", payload(), dir], dir, sb.env)
    expect(result.code).toBe(0)
    expect(result.files).not.toContain("pov-codex.json")
    expect(result.stderr).toContain(`peer skip evidence: ${evidence}`)
    expect(result.stderr).not.toContain("pre-egress")
  })

  test.each([
    ["an ACP error message on stdout", { error: "quota exhausted", exit: 1 }, "peer skip evidence: quota exhausted"],
    ["adapter text on stderr", { stopReason: null, exit: 1, stderr: "quota exhausted" }, "peer skip evidence (stderr): quota exhausted"],
  ])("quota error as %s is surfaced as peer skip evidence", (_name, spec, evidence) => {
    const { env } = sandbox(["claude"], acpStream(spec as StreamSpec))
    const dir = runDir()
    const scratchParent = temp("pov-quota-scratch-")
    const result = run(["codex", "claude", payload(), dir], dir, {
      ...env,
      CROSS_MODEL_SCRATCH_PARENT: scratchParent,
    })
    expect(result.code).toBe(0)
    expect(result.files).not.toContain("pov-claude.json")
    expect(result.stderr).toContain(evidence)
    expect(readdirSync(scratchParent)).toEqual([])
  })

  test("failure evidence is bounded and never echoes the outbound prompt", () => {
    const marker = "PROMPT-MARKER-c0ffee"
    const prompt = `${marker} ${"lorem ipsum ".repeat(2100)} ${marker} ${"dolor sit ".repeat(2100)} ${marker}`
    expect(prompt.length).toBeGreaterThan(45_000)
    const sb = sandbox(["codex"], acpStream({ prompt, error: `quota exhausted: ${"retry later ".repeat(80)}`, exit: 1 }))
    const dir = runDir()
    const result = run(["claude", "codex", payload(`Subject: ${marker}\n`), dir], dir, sb.env)
    expect(result.files).not.toContain("pov-codex.json")
    const evidence = result.stderr.match(/peer skip evidence: (.*)/)?.[1] ?? ""
    expect(evidence).toStartWith("quota exhausted")
    expect(evidence.length).toBeLessThanOrEqual(300)
    expect(result.stderr).not.toContain(marker)
    expect(result.stderr).not.toContain("lorem ipsum")
  })

  test("schema-valid output from an idle peer is discarded and scratch is cleaned", () => {
    const sb = sandbox(["cursor-agent"], acpStream({ text: pov({ position: "Hold" }), stopReason: null, sleep: 30 }))
    const dir = runDir()
    const scratchParent = temp("pov-timeout-scratch-")
    const result = run(["codex", "cursor", payload(), dir], dir, {
      ...sb.env,
      CROSS_MODEL_IDLE_SECS: "1",
      CROSS_MODEL_SCRATCH_PARENT: scratchParent,
    })
    expect(result.files).not.toContain("pov-cursor.json")
    expect(result.stderr).toContain("peer output idle 1s")
    expect(result.stderr).toContain("peer run ended with incomplete")
    expect(readdirSync(scratchParent)).toEqual([])
  })

  test("a peer still running at the hard cap is reaped with its whole process group", () => {
    const sb = sandbox(["codex"], acpStream({ text: "working", stopReason: null, sleep: 30 }))
    const dir = runDir()
    const started = Date.now()
    const result = run(["claude", "codex", payload(), dir], dir, { ...sb.env, CROSS_MODEL_HARD_SECS: "2" })
    expect(Date.now() - started).toBeLessThan(15_000)
    expect(result.stderr).toContain("peer exceeded hard cap 2s")
    expect(result.files).not.toContain("pov-codex.json")
    const pids = readFileSync(sb.logs.pids, "utf8").trim().split("\n").map(Number)
    expect(pids).toHaveLength(2)
    for (const pid of pids) expect(alive(pid)).toBe(false)
  })

  test("without ps -o (Git Bash), the idle guard still reaps a silent peer", () => {
    const sb = sandbox(["codex"], acpStream({ text: "working", stopReason: null, sleep: 30 }))
    const realPs = realTools().find(([tool]) => tool === "ps")?.[1]
    expect(realPs).toBeTruthy()
    replaceTool(sb.bin, "ps", `#!/bin/sh\nfor a in "$@"; do [ "$a" = -o ] && { echo "ps: unknown option -- o" >&2; exit 1; }; done\nexec '${realPs}' "$@"\n`)
    const dir = runDir()
    const started = Date.now()
    const result = run(["claude", "codex", payload(), dir], dir, { ...sb.env, CROSS_MODEL_IDLE_SECS: "2" })
    expect(Date.now() - started).toBeLessThan(15_000)
    expect(result.stderr).toContain("peer output idle 2s")
    const pids = readFileSync(sb.logs.pids, "utf8").trim().split("\n").map(Number)
    for (const pid of pids) expect(alive(pid)).toBe(false)
  })

  test("opencode on native Windows is a route pre-egress failure and acpx is never called", () => {
    const sb = sandbox(["opencode"])
    replaceTool(sb.bin, "uname", "#!/bin/sh\necho MINGW64_NT-10.0-26100\n")
    const dir = runDir()
    const result = run(["claude", "opencode", payload(), dir], dir, sb.env)
    expect(result.code).toBe(0)
    expect(result.stderr).toContain("transport unavailable (pre-egress, route): opencode launches through acpx's raw --agent command")
    expect(calls(sb)).toBe(0)
  })

  test("workspace creation failure skips the provider without calling acpx", () => {
    const sb = sandbox(["claude"])
    const realMktemp = realTools().find(([tool]) => tool === "mktemp")?.[1]
    expect(realMktemp).toBeTruthy()
    replaceTool(sb.bin, "mktemp", `#!/bin/sh\nif [ "\${1:-}" = "-d" ]; then exit 1; fi\nexec '${realMktemp}' "$@"\n`)

    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, sb.env)
    expect(result.code).toBe(0)
    expect(calls(sb)).toBe(0)
    expect(result.files).not.toContain("pov-claude.json")
    expect(result.stderr).toContain("workspace isolation unavailable")
  })
})

describe("ce-pov acpx transport preflight and launch", () => {
  test("Node older than 22.13 is a shared pre-egress failure and acpx is never called", () => {
    const sb = sandbox(["codex"])
    replaceTool(sb.bin, "node", "#!/bin/sh\necho 20.11.0\n")
    const dir = runDir()
    const result = run(["claude", "codex", payload(), dir], dir, sb.env)
    expect(result.code).toBe(0)
    expect(result.stderr).toContain("transport unavailable (pre-egress, shared): Node 20.11.0 is too old")
    expect(calls(sb)).toBe(0)
    expect(result.files).toEqual([])
  })

  test.each(["read root .acpxrc.json", "HOME ~/.acpx/config.json"])("a codex agent override in the %s is a route pre-egress failure", (where) => {
    const sb = sandbox(["codex", "claude"])
    const repo = temp("pov-acpxrc-repo-")
    const override = JSON.stringify({ agents: { codex: { command: "/tmp/not-codex" } } })
    if (where.startsWith("read root")) {
      writeFileSync(path.join(repo, ".acpxrc.json"), override)
    } else {
      mkdirSync(path.join(sb.home, ".acpx"))
      writeFileSync(path.join(sb.home, ".acpx", "config.json"), override)
    }
    const env = { ...sb.env, CROSS_MODEL_REPO_ROOT: repo, CROSS_MODEL_READ_ROOT: repo }
    const dir = runDir()
    const result = run(["claude", "codex", payload(), dir], dir, env)
    expect(result.stderr).toContain("transport unavailable (pre-egress, route)")
    expect(result.stderr).toContain("'codex' agent launch")
    expect(calls(sb)).toBe(0)
    expect(result.files).toEqual([])

    const other = run(["codex", "claude", payload(), dir], dir, env)
    expect(other.stderr).not.toContain("pre-egress")
    expect(calls(sb)).toBe(1)
  })

  test("opencode launches with project config disabled and the deny policy in plan mode", () => {
    const sb = sandbox(["opencode"])
    const dir = runDir()
    const result = run(["codex", "opencode", payload(), dir], dir, sb.env)
    expect(result.files).toContain("pov-opencode.json")
    const log = envLog(sb)
    expect(log).toContain("OPENCODE_DISABLE_PROJECT_CONFIG=1\n")
    expect(log).toContain('OPENCODE_CONFIG_CONTENT={"permission":{"edit":"deny","webfetch":"deny","task":"deny"}}\n')
    const args = argv(sb)
    expect(args[args.indexOf("--agent") + 1]).toBe(`${path.join(sb.bin, "opencode")} acp`)
    expect(args[args.lastIndexOf("--config-option") + 1]).toBe("mode=plan")
  })

  test("the claude route launches through a private --safe-mode wrapper around the installed CLI", () => {
    const sb = sandbox(["claude"])
    const scratchParent = temp("pov-wrapper-scratch-")
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, { ...sb.env, CROSS_MODEL_SCRATCH_PARENT: scratchParent })
    expect(result.files).toContain("pov-claude.json")
    const log = envLog(sb)
    const wrapper = log.match(/^CLAUDE_CODE_EXECUTABLE=(.*)$/m)?.[1] ?? ""
    expect(wrapper.startsWith(realpathSync(scratchParent))).toBe(true)
    expect(log).toContain(`exec ${path.join(sb.bin, "claude")} --safe-mode "$@"`)
    expect(log).toContain("CODEX_PATH=<unset>")
  })

  test("the codex route points the adapter at the installed codex CLI", () => {
    const sb = sandbox(["codex"])
    const dir = runDir()
    run(["claude", "codex", payload(), dir], dir, sb.env)
    expect(envLog(sb)).toContain(`CODEX_PATH=${path.join(sb.bin, "codex")}\n`)
    expect(envLog(sb)).toContain("npm_config_prefer_offline=true\nnpm_config_fetch_retries=0\n")
  })

  test("an npm fetch failure is a shared pre-egress failure naming the npm error", () => {
    const sb = sandbox(["codex"], path.join(STREAMS, "npm-fetch-failure"))
    const dir = runDir()
    const result = run(["claude", "codex", payload(), dir], dir, sb.env)
    expect(result.code).toBe(0)
    expect(result.stderr).toContain("transport unavailable (pre-egress, shared): npm error code ECONNREFUSED")
    expect(result.files).toEqual([])
  })

  test("an unknown model is a route pre-egress failure naming the available models", () => {
    const sb = sandbox(["claude"], path.join(STREAMS, "unknown-model"))
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, sb.env)
    expect(result.code).toBe(0)
    expect(result.stderr).toMatch(/transport unavailable \(pre-egress, route\): Cannot apply --model .*Available models: stub-model-a, stub-model-b/)
    expect(calls(sb)).toBe(1)
    expect(result.files).toEqual([])
  })
})

describe("ce-pov fixed route and egress allowlist", () => {
  test("missing opencode CLI skips the fixed opencode route before egress", () => {
    const sb = sandbox([])
    const dir = runDir()
    const result = run(["codex", "opencode", payload(), dir], dir, sb.env)
    expect(result.stderr).toContain("transport unavailable (pre-egress, route): the agent CLI for route 'opencode' is not installed")
    expect(calls(sb)).toBe(0)
  })

  test("an app-bundled codex CLI off PATH satisfies the fixed codex route (issue #1272)", () => {
    const sb = sandbox([])
    const bundle = path.join(temp("pov-bundle-"), "Codex.app", "Contents", "Resources")
    mkdirSync(bundle, { recursive: true })
    writeFileSync(path.join(bundle, "codex"), "#!/bin/sh\nexit 0\n")
    chmodSync(path.join(bundle, "codex"), 0o755)
    const dir = runDir()
    const result = run(["claude", "codex", payload(), dir], dir, { ...sb.env, CROSS_MODEL_CODEX_APP_DIRS: bundle })
    expect(result.stderr).not.toContain("not installed")
    expect(calls(sb)).toBe(1)
    expect(envLog(sb)).toContain(`CODEX_PATH=${path.join(bundle, "codex")}\n`)
    expect(result.files).toContain("pov-codex.json")
  })

  test("a failed grok-cli route makes one acpx call on its own agent and never hops to Cursor", () => {
    const sb = sandbox(["grok", "cursor-agent"], path.join(STREAMS, "prompt-error"))
    const dir = runDir()
    const result = run(["codex", "grok-cli", payload(), dir], dir, sb.env)
    expect(result.files).not.toContain("pov-grok.json")
    expect(calls(sb)).toBe(1)
    expect(argv(sb)).toContain("grok-build")
    expect(argv(sb)).not.toContain("cursor")
  })

  test("grok-only egress allowlist does not sanction the grok-cursor route", () => {
    const sb = sandbox(["grok", "cursor-agent"])
    const dir = runDir()
    const result = run(["codex", "grok-cursor", payload(), dir], dir, {
      ...sb.env,
      CROSS_MODEL_PEERS: "grok",
    })
    expect(result.code).toBe(0)
    expect(calls(sb)).toBe(0)
    expect(result.files).not.toContain("pov-grok.json")
  })

  test.each([
    ["cursor", "cursor", true],
    ["cursor", "composer", false],
    ["composer", "composer", true],
    ["composer", "cursor", false],
    ["grok-cli", "grok", true],
    ["grok-cursor", "grok,cursor", true],
    ["grok-cursor", "grok,composer", true],
    ["grok-cursor", "grok", false],
  ])("route %s with allowlist %s allowed=%p", (route, allow, allowed) => {
    const sb = sandbox([ROUTE_BIN[route]])
    const dir = runDir()
    const result = run(["codex", route, payload(), dir], dir, { ...sb.env, CROSS_MODEL_PEERS: allow })
    const target = route.startsWith("grok") ? "grok" : route
    expect(result.files.includes(`pov-${target}.json`)).toBe(allowed)
    expect(calls(sb)).toBe(allowed ? 1 : 0)
  })

  test("caller-narrowed read root is used while private scratch is cleaned", () => {
    const repoRoot = temp("pov-repo-root-")
    const readRoot = path.join(repoRoot, "src")
    mkdirSync(readRoot)
    const scratchParent = temp("pov-scratch-parent-")
    const sb = sandbox(["cursor-agent"])
    const dir = runDir()
    const result = run(["codex", "cursor", payload(), dir], dir, {
      ...sb.env,
      CROSS_MODEL_REPO_ROOT: repoRoot,
      CROSS_MODEL_READ_ROOT: readRoot,
      CROSS_MODEL_INCLUDE_PATHS: "src/**,README.md",
      CROSS_MODEL_EXCLUDE_PATHS: ".env*,secrets/**",
      CROSS_MODEL_SCRATCH_PARENT: scratchParent,
    })
    expect(result.files).toContain("pov-cursor.json")
    const args = argv(sb)
    expect(args[args.indexOf("--cwd") + 1]).toBe(realpathSync(readRoot))
    const prompt = readFileSync(`${sb.logs.prompt}.1`, "utf8")
    expect(prompt).toContain(`root: ${realpathSync(readRoot)}\nincludes: src/**,README.md\nexcludes: .env*,secrets/**`)
    expect(readdirSync(scratchParent)).toEqual([])
  })

  test("read and run roots cannot escape or mutate the declared repository boundary", () => {
    const repoRoot = temp("pov-boundary-repo-")
    const outsideRead = temp("pov-boundary-read-")
    const outsideRun = runDir()
    const sb = sandbox(["cursor-agent"])
    const outside = run(["codex", "cursor", payload(), outsideRun], outsideRun, {
      ...sb.env,
      CROSS_MODEL_REPO_ROOT: repoRoot,
      CROSS_MODEL_READ_ROOT: outsideRead,
    })
    expect(outside.files).not.toContain("pov-cursor.json")
    expect(outside.stderr).toContain("outside repository root")

    const insideRun = path.join(repoRoot, "peer-results")
    const inside = run(["codex", "cursor", payload(), insideRun], insideRun, {
      ...sb.env,
      CROSS_MODEL_REPO_ROOT: repoRoot,
      CROSS_MODEL_READ_ROOT: repoRoot,
    })
    expect(existsSync(insideRun)).toBe(false)
    expect(inside.stderr).toContain("run-dir must be outside the repository")
    expect(calls(sb)).toBe(0)
  })

  test.each(["SIGTERM", "SIGINT"] as const)("%s cleans private peer scratch, heartbeat, and the acpx process group", async (signal) => {
    const scratchParent = temp("pov-signal-scratch-")
    const sb = sandbox(["cursor-agent"], acpStream({ text: "working", stopReason: null, sleep: 30 }))
    const dir = runDir()
    const child = spawn("bash", [SCRIPT, "codex", "cursor", payload(), dir], {
      env: { ...sb.env, CROSS_MODEL_SCRATCH_PARENT: scratchParent },
      stdio: "ignore",
    })
    const deadline = Date.now() + 5_000
    while ((!existsSync(sb.logs.pids) || readdirSync(scratchParent).length === 0) && Date.now() < deadline) {
      await Bun.sleep(25)
    }
    expect(existsSync(sb.logs.pids)).toBe(true)
    expect(readdirSync(scratchParent).length).toBe(1)
    const workerPid = child.pid
    expect(workerPid).toBeDefined()
    const childPids = spawnSync("pgrep", ["-P", String(workerPid)], { encoding: "utf8" })
      .stdout.split(/\s+/).filter(Boolean).map(Number)
    expect(childPids.length).toBeGreaterThanOrEqual(2)
    const stubPids = readFileSync(sb.logs.pids, "utf8").trim().split("\n").map(Number)
    child.kill(signal)
    await new Promise<void>((resolve) => child.once("exit", () => resolve()))
    expect(readdirSync(scratchParent)).toEqual([])
    for (const pid of [...childPids, ...stubPids]) expect(alive(pid)).toBe(false)
  })

  test("peer brief restricts external queries to public subject terms", () => {
    const persona = readFileSync(path.join(__dirname, "../../skills/ce-pov/references/agents/pov-peer.md"), "utf8")
    expect(persona).toContain("public subject-level terms")
    expect(persona).toContain("Never place repository-derived")
  })
})
