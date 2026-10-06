// Runs the real acpx (fetched through npx) against the stub ACP agent, so it is
// opt-in: `bun run test:acpx-contract` sets ACPX_CONTRACT=1. ACPX_VERSION overrides the pin.
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { type ChildProcess, spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { ACPX_PIN } from "./helpers/acpx-pin"

setDefaultTimeout(60_000)

const VERSION = process.env.ACPX_VERSION || ACPX_PIN
const STUB = path.join(__dirname, "fixtures/acp-stub-agent.mjs")

const roots: string[] = []
afterAll(() => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

type Line = {
  id?: number | null
  method?: string
  params?: any
  result?: any
  error?: { code: number; message: string; data?: { acpxCode?: string } }
}
type Run = { code: number | null; stdout: string; stderr: string; ms: number }
type JsonRun = Run & { lines: Line[] }

function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), "acpx-contract-"))
  roots.push(root)
  const home = path.join(root, "home")
  const cwd = path.join(root, "cwd")
  mkdirSync(home)
  mkdirSync(cwd)
  const prompt = path.join(root, "prompt.md")
  writeFileSync(prompt, "Review the subject and reply.\n")
  return { home, cwd, prompt }
}

function acpx(
  args: string[],
  options: { cwd: string; home: string; env?: Record<string, string>; onStdout?: (stdout: string, child: ChildProcess) => void },
): Promise<Run> {
  const started = Date.now()
  const child = spawn("npx", ["-y", `acpx@${VERSION}`, ...args], {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      // A private HOME keeps ~/.acpx/config.json out; the npm cache stays shared.
      HOME: options.home,
      npm_config_cache: process.env.npm_config_cache || path.join(homedir(), ".npm"),
      npm_config_prefer_offline: "true",
      npm_config_fetch_retries: "0",
      ...options.env,
    },
  })
  let stdout = ""
  let stderr = ""
  child.stdout!.on("data", (chunk) => {
    stdout += chunk
    options.onStdout?.(stdout, child)
  })
  child.stderr!.on("data", (chunk) => (stderr += chunk))
  return new Promise((resolve) => {
    child.on("close", (code) => {
      resolve({ code, stdout, stderr, ms: Date.now() - started })
    })
  })
}

function withLines(run: Run): JsonRun {
  return { ...run, lines: run.stdout.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as Line) }
}

async function exec(mode: string, flags: string[] = [], onStdout?: (stdout: string, child: ChildProcess) => void) {
  const ws = workspace()
  const args = ["--format", "json", "--cwd", ws.cwd, ...flags, "--agent", `node ${STUB} ${mode}`, "exec", "--file", ws.prompt]
  return withLines(await acpx(args, { ...ws, onStdout }))
}

function promptRequest(run: JsonRun) {
  return run.lines.find((line) => line.method === "session/prompt")
}
function promptResponse(run: JsonRun) {
  const id = promptRequest(run)?.id
  return run.lines.find((line) => line.method === undefined && line.id === id)
}
function messageChunks(run: JsonRun) {
  return run.lines.filter((line) => line.method === "session/update" && line.params.update.sessionUpdate === "agent_message_chunk")
}

describe.skipIf(process.env.ACPX_CONTRACT !== "1" || process.platform === "win32")(`acpx@${VERSION} contract`, () => {
  test("--version reports the pinned version", async () => {
    const ws = workspace()
    const run = await acpx(["--version"], ws)
    expect(run.code).toBe(0)
    expect(run.stdout.trim()).toBe(VERSION)
  })

  test("a reply that ends the turn exits 0 with one message chunk and an end_turn result", async () => {
    const run = await exec("end_turn")
    expect(run.code).toBe(0)
    expect(messageChunks(run).map((line) => line.params.update.content.text)).toEqual(["stub reply"])
    expect(promptResponse(run)?.result?.stopReason).toBe("end_turn")
  })

  test("a denied permission request followed by end_turn exits 5 with the end_turn result", async () => {
    const run = await exec("permission", ["--non-interactive-permissions", "deny"])
    const ask = run.lines.find((line) => line.method === "session/request_permission")
    const answer = run.lines.find((line) => line.method === undefined && line.id === ask?.id)
    expect(answer?.result?.outcome).toEqual({ outcome: "selected", optionId: "reject" })
    expect(run.code).toBe(5)
    expect(promptResponse(run)?.result?.stopReason).toBe("end_turn")
  })

  test("a JSON-RPC error from the agent exits 1 and answers the prompt id with that error", async () => {
    const run = await exec("error")
    expect(run.code).toBe(1)
    const response = promptResponse(run)
    expect(response?.result).toBeUndefined()
    expect(response?.error?.message).toBe("stub agent failure")
  })

  test("a hang past --timeout 2 exits 3 with a TIMEOUT envelope well inside 12 s", async () => {
    const run = await exec("hang", ["--timeout", "2"])
    expect(run.code).toBe(3)
    expect(run.ms).toBeLessThan(12_000)
    expect(promptResponse(run)).toBeUndefined()
    expect(run.lines.at(-1)?.error?.data?.acpxCode).toBe("TIMEOUT")
  })

  test("SIGTERM to npx reaches a cancel-aware agent as session/cancel and the turn ends cancelled", async () => {
    let signalled = false
    const run = await exec("cancel", [], (stdout, child) => {
      if (!signalled && stdout.includes('"method":"session/prompt"')) {
        signalled = true
        child.kill("SIGTERM")
      }
    })
    expect(signalled).toBe(true)
    expect(run.lines.some((line) => line.method === "session/cancel")).toBe(true)
    expect(promptResponse(run)?.result?.stopReason).toBe("cancelled")
    expect(run.code).toBe(0)
  })

  test("an unknown --model exits 1 before any session/prompt and names the available models", async () => {
    const run = await exec("models", ["--model", "stub-model-z"])
    expect(run.code).toBe(1)
    expect(promptRequest(run)).toBeUndefined()
    expect(run.stdout).toContain("Available models: stub-model-a, stub-model-b")
    expect(run.lines.at(-1)?.error?.data?.acpxCode).toBe("RUNTIME")
  })

  test("--model shifts the session/prompt id, so the result is found by id, not position", async () => {
    const plain = await exec("models")
    const switched = await exec("models", ["--model", "stub-model-b"])
    expect(switched.code).toBe(0)
    expect(switched.lines.some((line) => line.method === "session/set_model")).toBe(true)
    expect(promptRequest(switched)?.id).not.toBe(promptRequest(plain)?.id)
    const atUnshiftedId = switched.lines.find((line) => line.method === undefined && line.id === promptRequest(plain)?.id)
    expect(atUnshiftedId?.result?.stopReason).toBeUndefined()
    expect(promptResponse(switched)?.result?.stopReason).toBe("end_turn")
  })

  test("a .acpxrc.json in --cwd replaces a built-in agent's argv", async () => {
    const ws = workspace()
    writeFileSync(path.join(ws.cwd, ".acpxrc.json"), JSON.stringify({ agents: { codex: { argv: ["node", STUB, "end_turn"] } } }))
    const run = withLines(
      await acpx(["--format", "json", "--cwd", ws.cwd, "codex", "exec", "--file", ws.prompt], {
        ...ws,
        env: { ACP_STUB_TEXT: "replaced by .acpxrc.json" },
      }),
    )
    expect(run.code).toBe(0)
    expect(messageChunks(run).map((line) => line.params.update.content.text)).toEqual(["replaced by .acpxrc.json"])
  })
})
