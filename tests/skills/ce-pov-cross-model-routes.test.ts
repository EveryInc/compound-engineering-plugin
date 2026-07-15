import { afterAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const roots: string[] = []
function temp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  roots.push(dir)
  return dir
}
afterAll(() => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

const SCRIPT = path.join(__dirname, "../../skills/ce-pov/scripts/cross-model-pov.sh")
const ROUTES = ["codex", "claude", "grok-cli", "grok-cursor", "composer"] as const
const NEVER_FLAGS = ["--yolo", "--force", "-f", "--always-approve", "--dangerously-skip-permissions"]
const REAL_TOOLS = [
  "bash", "sh", "jq", "python3", "date", "sed", "tr", "cat", "wc", "dirname",
  "basename", "mktemp", "env", "perl", "timeout", "gtimeout", "sleep", "rm", "mv",
  "chmod", "cp", "printf", "kill", "mkdir",
]
let resolved: Array<[string, string]> | undefined
function realTools(): Array<[string, string]> {
  if (resolved) return resolved
  resolved = []
  for (const tool of REAL_TOOLS) {
    let actual = spawnSync("command", ["-v", tool], { encoding: "utf8", shell: "/bin/bash" }).stdout?.trim()
    if (tool === "python3" && actual) {
      const standalone = spawnSync(actual, ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).stdout?.trim()
      if (standalone) actual = standalone
    }
    if (actual && existsSync(actual)) resolved.push([tool, actual])
  }
  return resolved
}

function sandbox(providers: string[], body = "#!/bin/sh\nexit 0\n") {
  const bin = path.join(temp("pov-route-"), "bin")
  mkdirSync(bin)
  for (const [tool, actual] of realTools()) {
    try { symlinkSync(actual, path.join(bin, tool)) } catch { /* shell builtin */ }
  }
  for (const provider of providers) {
    const file = path.join(bin, provider)
    writeFileSync(file, body)
    chmodSync(file, 0o755)
  }
  return { bin, env: { ...process.env, PATH: bin } }
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
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    files: existsSync(dir) ? readdirSync(dir) : [],
  }
}
function emit(route: string) {
  const result = spawnSync("bash", [SCRIPT, "--emit-adapter", route], { encoding: "utf8" })
  expect(result.status).toBe(0)
  return result.stdout.trim()
}

describe("ce-pov cross-model route safety", () => {
  test("all routes preserve read/write/exec denial and avoid never-use flags", () => {
    for (const route of ROUTES) {
      const command = emit(route)
      for (const denied of NEVER_FLAGS) expect(command.split(/\s+/)).not.toContain(denied)
      expect(command).not.toContain("bypassPermissions")
      expect(command).not.toContain("<run-dir>")
    }
    expect(emit("codex")).toContain("-s read-only")
    expect(emit("codex")).toContain("-C <peer-workdir>")
    expect(emit("claude")).toContain("--permission-mode dontAsk")
    expect(emit("claude")).toContain("--bare")
    expect(emit("grok-cli")).toContain("--deny Read")
    expect(emit("grok-cli")).toContain("--deny Edit")
    expect(emit("grok-cli")).toContain("--deny Write")
    expect(emit("grok-cli")).toContain("--deny Bash")
    for (const route of ["grok-cursor", "composer"]) {
      expect(emit(route)).toContain("--mode ask")
      expect(emit(route)).toContain("--sandbox enabled")
      expect(emit(route)).toContain("--workspace <peer-workdir>")
    }
  })

  test("web is enabled only through bounded route-specific capabilities", () => {
    const claude = emit("claude")
    expect(claude).toContain("WebSearch")
    expect(claude).toContain("WebFetch")
    expect(claude).not.toContain('--tools  ')
    expect(emit("grok-cli")).not.toContain("--disable-web-search")
    expect(emit("grok-cli")).toContain("--no-subagents")
    expect(emit("codex")).toContain("-s read-only")
  })
})

describe("ce-pov output gate and receipts", () => {
  const valid = '{"structured_output":{"voice":"peer","position":"Choose A","reasoning":"Lower correction cost","evidence":["https://example.com"],"external_check":"ran","mode":"independent"},"modelUsage":{"claude-opus-4-8-20260115":{"inputTokens":10}}}'

  test.each([
    ["missing position", '{"structured_output":{"reasoning":"why"}}'],
    ["empty position", '{"structured_output":{"position":"","reasoning":"why"}}'],
    ["missing reasoning", '{"structured_output":{"position":"Choose A"}}'],
  ])("%s falls through to the next candidate", (_name, invalid) => {
    const { bin, env } = sandbox(["claude", "grok"])
    writeFileSync(path.join(bin, "claude"), `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${invalid}'\n`)
    writeFileSync(path.join(bin, "grok"), `#!/bin/sh\nprintf '%s' '${valid}'\n`)
    chmodSync(path.join(bin, "claude"), 0o755)
    chmodSync(path.join(bin, "grok"), 0o755)
    const dir = runDir()
    const result = run(["codex", "claude,grok", payload(), dir], dir, env)
    expect(result.code).toBe(0)
    expect(result.files).not.toContain("pov-claude.json")
    expect(result.files).toContain("pov-grok.json")
  })

  test("normalizes a valid POV with actual route and served-model receipt", () => {
    const { env } = sandbox(["claude"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${valid}'\n`)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)
    expect(result.files).toContain("pov-claude.json")
    const out = JSON.parse(readFileSync(path.join(dir, "pov-claude.json"), "utf8"))
    expect(out.voice).toBe("peer-claude")
    expect(out.position).toBe("Choose A")
    expect(out.cross_model_route).toBe("claude")
    expect(out.model_requested).toBe("opus")
    expect(out.model_actual).toBe("claude-opus-4-8-20260115")
  })

  test("recovers a raw schema-shaped POV without a structured-output envelope", () => {
    const raw = '{"voice":"peer","position":"Choose A","reasoning":"Lower correction cost","evidence":[],"external_check":"unavailable","mode":"independent"}'
    const { env } = sandbox(["claude"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${raw}'\n`)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)
    expect(result.files).toContain("pov-claude.json")
    const out = JSON.parse(readFileSync(path.join(dir, "pov-claude.json"), "utf8"))
    expect(out.position).toBe("Choose A")
    expect(out.reasoning).toBe("Lower correction cost")
  })

  test.each([
    ["stdout", "printf '%s' 'quota exhausted'", ""],
    ["stderr", "", "printf '%s' 'quota exhausted' >&2"],
  ])("quota error on %s is surfaced as peer skip evidence", (_stream, stdout, stderr) => {
    const body = `#!/bin/sh\ncat >/dev/null\n${stdout}\n${stderr}\nexit 1\n`
    const { env } = sandbox(["claude"], body)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)
    expect(result.code).toBe(0)
    expect(result.files).not.toContain("pov-claude.json")
    expect(result.stderr).toContain("peer skip evidence")
    expect(result.stderr).toContain("quota exhausted")
  })
})

describe("ce-pov egress fallback", () => {
  test("grok-cli failure falls back to grok-cursor and records the actual route", () => {
    const { bin, env } = sandbox(["grok", "cursor-agent"])
    writeFileSync(path.join(bin, "grok"), "#!/bin/sh\nexit 1\n")
    writeFileSync(path.join(bin, "cursor-agent"), "#!/bin/sh\ncat >/dev/null\nprintf '%s' '{\"structured_output\":{\"voice\":\"peer\",\"position\":\"Hold\",\"reasoning\":\"Evidence is incomplete\",\"evidence\":[],\"external_check\":\"unavailable\",\"mode\":\"independent\"}}'\n")
    chmodSync(path.join(bin, "grok"), 0o755)
    chmodSync(path.join(bin, "cursor-agent"), 0o755)
    const dir = runDir()
    const result = run(["codex", "grok", payload(), dir], dir, env)
    expect(result.files).toContain("pov-grok.json")
    const out = JSON.parse(readFileSync(path.join(dir, "pov-grok.json"), "utf8"))
    expect(out.cross_model_route).toBe("grok-cursor")
    expect(out.external_check).toBe("unavailable")
  })
})
