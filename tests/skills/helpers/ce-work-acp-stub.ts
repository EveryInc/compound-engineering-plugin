import { chmodSync, writeFileSync } from "node:fs"
import path from "node:path"
import { ACPX_PIN } from "../../helpers/acpx-pin"

const STUB_NPX = path.join(process.cwd(), "tests/fixtures/acp-stub-npx.sh")
const AGENT_BINARIES = ["codex", "claude", "grok", "cursor-agent", "opencode"]

export const COMPLETED_RESULT =
  '{"terminal_status":"completed","summary":"implemented","changed_files":["result.txt"],"evidence":["focused test passed"],"scope_expansion":null}'

// Shaped like the captured acpx@0.19.4 streams in tests/fixtures/acpx-streams/:
// acpx echoes the outbound prompt into the stream before the agent replies, and
// `--model` adds a session/set_model request, so the prompt is not at a fixed id.
export type StreamSpec = {
  text?: string | string[]
  stopReason?: string | null
  meta?: unknown
  error?: string
  prompt?: string
  exit?: number
  stderr?: string
  sleep?: number
}

/** Writes a canned acpx stream at `<base>.stdout` (plus exit/stderr/sleep) and returns `base`. */
export function acpStream(base: string, spec: StreamSpec = {}): string {
  const rpc = (body: Record<string, unknown>) => JSON.stringify({ jsonrpc: "2.0", ...body })
  const sessionId = "stub-session-1"
  const lines = [
    rpc({ id: 0, method: "initialize", params: { protocolVersion: 1, clientInfo: { name: "acpx", version: ACPX_PIN } } }),
    rpc({ id: 0, result: { protocolVersion: 1, agentCapabilities: { loadSession: false }, authMethods: [] } }),
    rpc({ id: 1, method: "session/new", params: { cwd: "/tmp/cwd", mcpServers: [] } }),
    rpc({ id: 1, result: { sessionId } }),
    rpc({ id: 2, method: "session/set_model", params: { sessionId, modelId: "requested" } }),
    rpc({ id: 2, result: {} }),
    rpc({ id: 3, method: "session/prompt", params: { sessionId, prompt: [{ type: "text", text: spec.prompt ?? "Implement the unit." }] } }),
  ]
  const texts = spec.text === undefined ? [COMPLETED_RESULT] : Array.isArray(spec.text) ? spec.text : [spec.text]
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

/**
 * Fills `bin` with stand-in agent CLIs and an `npx` that replays `stream`.
 *
 * The worker launches acpx under `env -i`, so the stub's settings cannot ride the
 * environment. The `npx` wrapper bakes them in, records what the acpx child sees
 * in `capture` (cwd, environment, argv, launch variables, prompt), runs `hook`
 * from the `--cwd` workspace the way the agent would, then replays the stream.
 */
export function acpNpxBin(bin: string, capture: string, stream: string, hook = ""): string {
  for (const binary of AGENT_BINARIES) {
    writeFileSync(path.join(bin, binary), "#!/bin/sh\nexit 0\n")
    chmodSync(path.join(bin, binary), 0o755)
  }
  // The worker uses node only for its version check; a fixed compliant version
  // keeps these tests independent of the machine's Node.
  writeFileSync(path.join(bin, "node"), "#!/bin/sh\necho 24.0.0\n")
  chmodSync(path.join(bin, "node"), 0o755)
  writeFileSync(path.join(bin, "npx"), `#!/bin/sh
printf '%s' "$PWD" > '${capture}/pwd'
env | sort > '${capture}/env'
agent_cwd=""; prev=""
for arg in "$@"; do [ "$prev" = --cwd ] && agent_cwd="$arg"; prev="$arg"; done
( cd "$agent_cwd" || exit 1
${hook}
) || exit 1
ACP_STUB_NPX_STREAM='${stream}' ACP_STUB_NPX_ARGV_LOG='${capture}/argv' ACP_STUB_NPX_ENV_LOG='${capture}/launch-env' ACP_STUB_NPX_PROMPT_LOG='${capture}/prompt' exec '${STUB_NPX}' "$@"
`)
  chmodSync(path.join(bin, "npx"), 0o755)
  return bin
}
