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
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

setDefaultTimeout(20_000)

const roots: string[] = []
function temp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  roots.push(dir)
  return dir
}
afterAll(() => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

const SCRIPT = path.join(__dirname, "../../skills/ce-pov/scripts/cross-model-pov.sh")
const LAUNCHER = path.join(__dirname, "../../skills/ce-pov/scripts/clean-launcher.py")
const PYTHON = "/usr/bin/python3"
const SKILL_BODY = readFileSync(path.join(__dirname, "../../skills/ce-pov/SKILL.md"), "utf8")
const PANEL_BODY = readFileSync(path.join(__dirname, "../../skills/ce-pov/references/cross-model-panel.md"), "utf8")
const ROUTES = ["codex", "claude", "grok-cli", "grok-cursor", "cursor", "composer"] as const
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
function run(args: string[], dir: string, env: NodeJS.ProcessEnv = process.env, cwd?: string) {
  const declaredRoot = env.CROSS_MODEL_REPO_ROOT ?? env.REPO_ROOT
  const result = spawnSync(PYTHON, ["-I", "-S", LAUNCHER, ...args], {
    encoding: "utf8",
    env,
    cwd: cwd ?? declaredRoot,
  })
  return {
    code: result.status ?? -1,
    stderr: result.stderr ?? "",
    files: existsSync(dir) ? readdirSync(dir) : [],
  }
}
function emit(route: string, env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(PYTHON, ["-I", "-S", LAUNCHER, "--emit-adapter", route], { encoding: "utf8", env })
  expect(result.status).toBe(0)
  return result.stdout.trim()
}

describe("ce-pov cross-model route safety", () => {
  test("refuses direct bash execution even for test-only adapter emission", () => {
    const result = spawnSync("/bin/bash", [SCRIPT, "--emit-adapter", "claude"], {
      encoding: "utf8",
    })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain("clean launcher provenance missing")
  })

  test("preferred retries never prompt for new egress authority", () => {
    expect(SKILL_BODY).toMatch(/unsanctioned recipient or intermediary is unavailable.*without asking/is)
    expect(PANEL_BODY).toMatch(/classify that candidate\s+unavailable without prompting/is)
    expect(PANEL_BODY).not.toMatch(/ask before dispatch/i)
  })

  test("all routes preserve read/write/exec denial and avoid never-use flags", () => {
    for (const route of ROUTES) {
      const command = emit(route)
      expect(command.split(/\s+/, 1)[0]).toBe(`<qualified-${route === "grok-cli" ? "grok" : ["grok-cursor", "cursor", "composer"].includes(route) ? "cursor-agent" : route}>`)
      for (const denied of NEVER_FLAGS) expect(command.split(/\s+/)).not.toContain(denied)
      expect(command).not.toContain("bypassPermissions")
      expect(command).not.toContain("<run-dir>")
    }
    expect(emit("codex")).toContain("-s read-only")
    expect(emit("codex")).toContain("-C <read-root>")
    expect(emit("claude")).toContain("--permission-mode dontAsk")
    expect(emit("claude")).toContain("--safe-mode")
    expect(emit("claude")).toContain("--disable-slash-commands")
    expect(emit("claude")).not.toContain("--bare")
    expect(emit("grok-cli")).toContain("--cwd <read-root>")
    expect(emit("grok-cli")).toContain("--deny Edit")
    expect(emit("grok-cli")).toContain("--deny Write")
    expect(emit("grok-cli")).toContain("--deny Bash")
    for (const route of ["grok-cursor", "cursor", "composer"]) {
      expect(emit(route)).toContain("--mode ask")
      expect(emit(route)).toContain("--sandbox enabled")
      expect(emit(route)).toContain("--workspace <read-root>")
    }
    expect(emit("cursor")).not.toContain("--model")
    expect(emit("composer")).toContain("--model")
    expect(emit("grok-cursor")).toContain("--model cursor-grok-4.5-high")
  })

  test("generalized candidate selectors are route-bound and token-safe", () => {
    const selected = emit("claude", {
      ...process.env,
      CE_ROUTING_CANDIDATE_HARNESS: "claude",
      CE_ROUTING_CANDIDATE_ROUTE: "claude",
      CE_ROUTING_CANDIDATE_MODEL: "sonnet",
      CE_ROUTING_CANDIDATE_EFFORT: "medium",
    })
    expect(selected).toContain("--model sonnet")
    expect(selected).toContain("--effort medium")

    for (const [route, env] of [
      ["grok-cli", {
        CE_ROUTING_CANDIDATE_HARNESS: "grok",
        CE_ROUTING_CANDIDATE_ROUTE: "grok-cursor",
        CE_ROUTING_CANDIDATE_MODEL: "grok-4.5",
      }],
      ["cursor", {
        CE_ROUTING_CANDIDATE_HARNESS: "cursor",
        CE_ROUTING_CANDIDATE_ROUTE: "cursor",
        CE_ROUTING_CANDIDATE_MODEL: "composer-2.5-fast",
      }],
    ] as const) {
      const rejected = spawnSync(PYTHON, ["-I", "-S", LAUNCHER, "--emit-adapter", route], {
        encoding: "utf8",
        env: { ...process.env, ...env },
      })
      expect(rejected.status).toBe(2)
    }
  })

  test("same-family model override changes only model-specific routes", () => {
    const composer = emit("composer", {
      ...process.env,
      CROSS_MODEL_MODEL_OVERRIDE: "composer-next-fast",
      CROSS_MODEL_MODEL_OVERRIDE_TARGET: "composer",
    })
    expect(composer).toContain("--model composer-next-fast")
    expect(composer).toContain("--workspace <read-root>")

    const rejected = spawnSync(PYTHON, ["-I", "-S", LAUNCHER, "--emit-adapter", "grok-cursor"], {
      encoding: "utf8",
      env: {
        ...process.env,
        CROSS_MODEL_MODEL_OVERRIDE: "composer-next-fast",
        CROSS_MODEL_MODEL_OVERRIDE_TARGET: "composer",
      },
    })
    expect(rejected.status).toBe(2)
    expect(rejected.stderr).toContain("not compatible with route")

    const unbound = spawnSync(PYTHON, ["-I", "-S", LAUNCHER, "--emit-adapter", "composer"], {
      encoding: "utf8",
      env: { ...process.env, CROSS_MODEL_MODEL_OVERRIDE: "composer-next-fast" },
    })
    expect(unbound.status).toBe(2)
    expect(unbound.stderr).toContain("not compatible with route")
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
  const valid = '{"structured_output":{"voice":"peer","position":"Choose A","reasoning":"Lower correction cost","evidence":["https://example.com"],"external_check":"ran","mode":"independent","movement":"initial"},"modelUsage":{"claude-opus-4-8-20260115":{"inputTokens":10}}}'

  test.each([
    ["missing position", '{"structured_output":{"reasoning":"why"}}'],
    ["empty position", '{"structured_output":{"position":"","reasoning":"why"}}'],
    ["missing reasoning", '{"structured_output":{"position":"Choose A"}}'],
    ["missing mode", '{"structured_output":{"voice":"peer","position":"Choose A","reasoning":"why","evidence":[],"external_check":"unavailable","movement":"initial"}}'],
    ["missing evidence", '{"structured_output":{"voice":"peer","position":"Choose A","reasoning":"why","external_check":"unavailable","mode":"independent","movement":"initial"}}'],
    ["missing external check", '{"structured_output":{"voice":"peer","position":"Choose A","reasoning":"why","evidence":[],"mode":"independent","movement":"initial"}}'],
    ["missing voice", '{"structured_output":{"position":"Choose A","reasoning":"why","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial"}}'],
  ])("%s fails the fixed route without publishing an artifact", (_name, invalid) => {
    const { bin, env } = sandbox(["claude"])
    writeFileSync(path.join(bin, "claude"), `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${invalid}'\n`)
    chmodSync(path.join(bin, "claude"), 0o755)
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
    ["missing movement", '{"structured_output":{"position":"Choose A","reasoning":"why"}}'],
    ["invalid movement", '{"structured_output":{"position":"Choose A","reasoning":"why","movement":"changed"}}'],
  ])("%s is not usable output", (_name, invalid) => {
    const { env } = sandbox(["claude"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${invalid}'\n`)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)
    expect(result.code).toBe(0)
    expect(result.files).not.toContain("pov-claude.json")
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
    expect(out.cross_model_target).toBe("claude")
    expect(out.cross_model_harness).toBe("claude")
    expect(out.serving_family).toBe("claude")
    expect(out.model_requested).toBe("opus")
    expect(out.model_actual).toBe("claude-opus-4-8-20260115")
    expect(out.model_identity_status).toBe("matched")
    expect(out.effort_requested).toBe("high")
    expect(out.effort_actual).toBe("unverified")
    expect(out.movement).toBe("initial")
    expect(out.independence_verified).toBe(true)
  })

  test("a generalized candidate drives the live fake adapter and receipt", () => {
    const captureRoot = temp("pov-routed-capture-")
    const capture = path.join(captureRoot, "argv")
    const envCapture = path.join(captureRoot, "env")
    const claudeConfig = path.join(captureRoot, "claude-config")
    const apiSecret = "SENTINEL-pov-api-secret"
    const response = '{"structured_output":{"voice":"peer","position":"Choose A","reasoning":"Evidence","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial"},"modelUsage":{"claude-sonnet-4-7-20260701":{"inputTokens":3}}}'
    const { env } = sandbox(["claude"], `#!/bin/sh
printf '%s' "$*" > '${capture}'
env > '${envCapture}'
cat >/dev/null
printf '%s' '${response}'
`)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, {
      ...env,
      CE_ROUTING_CANDIDATE_HARNESS: "claude",
      CE_ROUTING_CANDIDATE_ROUTE: "claude",
      CE_ROUTING_CANDIDATE_MODEL: "sonnet",
      CE_ROUTING_CANDIDATE_EFFORT: "medium",
      USER: "pov-keychain-user",
      CLAUDE_CONFIG_DIR: claudeConfig,
      ANTHROPIC_API_KEY: apiSecret,
    })
    expect(result.files).toContain("pov-claude.json")
    expect(readFileSync(capture, "utf8")).toContain("--model sonnet --effort medium")
    const childEnv = readFileSync(envCapture, "utf8")
    expect(childEnv).toContain("USER=pov-keychain-user")
    expect(childEnv).toContain(`CLAUDE_CONFIG_DIR=${claudeConfig}`)
    expect(childEnv.split("\n").find((line) => line.startsWith("PATH="))).toBe(
      "PATH=/usr/bin:/bin",
    )
    expect(childEnv).not.toContain("ANTHROPIC_API_KEY=")
    expect(childEnv).not.toContain(apiSecret)
    const out = JSON.parse(readFileSync(path.join(dir, "pov-claude.json"), "utf8"))
    expect(out.model_requested).toBe("sonnet")
    expect(out.model_actual).toBe("claude-sonnet-4-7-20260701")
    expect(out.model_identity_status).toBe("matched")
    expect(out.effort_requested).toBe("medium")
  })

  test("recovers a raw schema-shaped POV without a structured-output envelope", () => {
    const raw = '{"voice":"peer","position":"Choose A","reasoning":"Lower correction cost","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial"}'
    const { env } = sandbox(["claude"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${raw}'\n`)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)
    expect(result.files).toContain("pov-claude.json")
    const out = JSON.parse(readFileSync(path.join(dir, "pov-claude.json"), "utf8"))
    expect(out.position).toBe("Choose A")
    expect(out.reasoning).toBe("Lower correction cost")
  })

  test("recovers a fenced POV nested in a CLI result envelope", () => {
    const pov = '{"voice":"peer","position":"Choose B","reasoning":"The boundary is clearer","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial"}'
    const envelope = JSON.stringify({ type: "result", result: `\`\`\`json\n${pov}\n\`\`\`` })
    const { env } = sandbox(["cursor-agent"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${envelope}'\n`)
    const dir = runDir()
    const result = run(["codex", "composer", payload(), dir], dir, env)
    expect(result.files).toContain("pov-composer.json")
    const out = JSON.parse(readFileSync(path.join(dir, "pov-composer.json"), "utf8"))
    expect(out.position).toBe("Choose B")
    expect(out.reasoning).toBe("The boundary is clearer")
    expect(out.model_actual).toBe("unverified")
    expect(out.model_identity_status).toBe("unverified")
    expect(out.serving_family).toBe("unknown")
    expect(out.independence_verified).toBe(false)
  })

  test("Cursor default records auto and unverified independence", () => {
    const response = '{"structured_output":{"voice":"peer","position":"Hold","reasoning":"Need evidence","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial"}}'
    const { env } = sandbox(["cursor-agent"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${response}'\n`)
    const dir = runDir()
    const result = run(["codex", "cursor", payload(), dir], dir, env)
    expect(result.files).toContain("pov-cursor.json")
    const out = JSON.parse(readFileSync(path.join(dir, "pov-cursor.json"), "utf8"))
    expect(out.cross_model_route).toBe("cursor")
    expect(out.cross_model_target).toBe("cursor")
    expect(out.cross_model_harness).toBe("cursor-agent")
    expect(out.serving_family).toBe("unknown")
    expect(out.model_requested).toBe("auto")
    expect(out.model_actual).toBe("unverified")
    expect(out.independence_verified).toBe(false)
  })

  test("an explicitly named peer can run with unknown host family but is not independent", () => {
    const response = '{"structured_output":{"voice":"peer","position":"Hold","reasoning":"Need evidence","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial"},"modelUsage":{"claude-opus-4-8-20260115":{"inputTokens":3}}}'
    const { env } = sandbox(["claude"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${response}'\n`)
    const dir = runDir()
    const result = run(["unknown", "claude", payload(), dir], dir, {
      ...env,
      CROSS_MODEL_HOST_HARNESS: "cursor",
    })
    expect(result.files).toContain("pov-claude.json")
    const out = JSON.parse(readFileSync(path.join(dir, "pov-claude.json"), "utf8"))
    expect(out.model_identity_status).toBe("matched")
    expect(out.model_actual).toBe("claude-opus-4-8-20260115")
    expect(out.independence_verified).toBe(false)
  })

  test.each([
    ["stdout", "printf '%s' 'quota exhausted'", ""],
    ["stderr", "", "printf '%s' 'quota exhausted' >&2"],
  ])("quota error on %s is surfaced as peer skip evidence", (_stream, stdout, stderr) => {
    const body = `#!/bin/sh\ncat >/dev/null\n${stdout}\n${stderr}\nexit 1\n`
    const { env } = sandbox(["claude"], body)
    const dir = runDir()
    const scratchParent = temp("pov-quota-scratch-")
    const result = run(["codex", "claude", payload(), dir], dir, {
      ...env,
      CROSS_MODEL_SCRATCH_PARENT: scratchParent,
    })
    expect(result.code).toBe(0)
    expect(result.files).not.toContain("pov-claude.json")
    expect(result.stderr).toContain("peer skip evidence")
    expect(result.stderr).toContain("quota exhausted")
    expect(readdirSync(scratchParent)).toEqual([])
  })

  test("structured Claude errors preserve the actionable result before the envelope tail", () => {
    const envelope = JSON.stringify({
      type: "result",
      is_error: true,
      api_error_status: null,
      result: "Not logged in - Please run /login",
      padding: "x".repeat(1000),
      terminal_reason: "api_error",
    })
    const { env } = sandbox(["claude"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${envelope}'\nexit 1\n`)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)

    expect(result.files).not.toContain("pov-claude.json")
    expect(result.stderr).toContain("Not logged in - Please run /login")
    expect(result.stderr).toContain("terminal_reason=api_error")
  })

  test("ancillary structured fields do not hide an unrecognized human-readable diagnostic", () => {
    const envelope = JSON.stringify({
      type: "result",
      diagnostic: "Provider rejected the request for this account",
      terminal_reason: "api_error",
    })
    const { env } = sandbox(["claude"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${envelope}'\nexit 1\n`)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)

    expect(result.files).not.toContain("pov-claude.json")
    expect(result.stderr).toContain("Provider rejected the request for this account")
    expect(result.stderr).toContain("terminal_reason=api_error")
  })

  test("schema-valid output from a timed-out peer is discarded and scratch is cleaned", () => {
    const response = '{"structured_output":{"voice":"peer","position":"Hold","reasoning":"Late evidence","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial"}}'
    const { env } = sandbox(["cursor-agent"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${response}'\nsleep 5\n`)
    const dir = runDir()
    const scratchParent = temp("pov-timeout-scratch-")
    const result = run(["codex", "cursor", payload(), dir], dir, {
      ...env,
      CROSS_MODEL_HARD_SECS: "1",
      CROSS_MODEL_SCRATCH_PARENT: scratchParent,
    })
    expect(result.files).not.toContain("pov-cursor.json")
    expect(result.stderr).toContain("peer exited non-zero or timed out")
    expect(readdirSync(scratchParent)).toEqual([])
  })

  test("project-local helper shims never run when a safe provider is later on PATH", () => {
    const project = temp("pov-helper-project-")
    mkdirSync(path.join(project, ".git"))
    const hostileBin = path.join(project, "bin")
    mkdirSync(hostileBin)
    const marker = path.join(project, "helper-invoked")
    for (const helper of ["mktemp", "wc", "tr", "cat", "jq"]) {
      const shim = path.join(hostileBin, helper)
      writeFileSync(shim, `#!/bin/sh\n: > '${marker}'\nexit 99\n`)
      chmodSync(shim, 0o755)
    }
    const response = '{"structured_output":{"voice":"peer","position":"Hold","reasoning":"Evidence","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial"},"modelUsage":{"claude-opus-4-8-20260115":{}}}'
    const safe = sandbox(["claude"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${response}'\n`)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, {
      ...safe.env,
      PATH: `${hostileBin}:${safe.bin}`,
    }, project)
    expect(result.code).toBe(0)
    expect(result.files).toContain("pov-claude.json")
    expect(existsSync(marker)).toBe(false)
  })

  test("BASH_ENV and exported functions never execute before the adapter starts", () => {
    const root = temp("pov-shell-startup-")
    const marker = path.join(root, "startup-ran")
    const bashEnv = path.join(root, "bash-env")
    writeFileSync(bashEnv, `: > '${marker}'\n`)
    const response = '{"structured_output":{"voice":"peer","position":"Hold","reasoning":"Evidence","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial"},"modelUsage":{"claude-opus-4-8-20260115":{}}}'
    const { env } = sandbox(["claude"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${response}'\n`)
    const dir = runDir()

    const result = run(["codex", "claude", payload(), dir], dir, {
      ...env,
      BASH_ENV: bashEnv,
      "BASH_FUNC_date%%": `() { : > '${marker}'; /bin/date "$@"; }`,
      SHELLOPTS: "xtrace",
    })

    expect(result.files).toContain("pov-claude.json")
    expect(existsSync(marker)).toBe(false)
  })

  test("an unavailable private scratch parent skips before provider invocation", () => {
    const invoked = path.join(temp("pov-scratch-failure-"), "provider-invoked")
    const { env } = sandbox(["claude"], `#!/bin/sh\n: > '${invoked}'\nexit 0\n`)
    const scratchParent = path.join(temp("pov-scratch-file-"), "not-a-directory")
    writeFileSync(scratchParent, "occupied")
    const dir = runDir()

    const result = run(["codex", "claude", payload(), dir], dir, {
      ...env,
      CROSS_MODEL_SCRATCH_PARENT: scratchParent,
    })

    expect(result.files).not.toContain("pov-claude.json")
    expect(result.stderr).toContain("private scratch parent")
    expect(existsSync(invoked)).toBe(false)
  })
})

describe("ce-pov fixed route and egress allowlist", () => {
  test("rejects a non-Git project-local provider shadow without trying the safe PATH entry", () => {
    const project = temp("pov-hostile-project-")
    const projectBin = path.join(project, "bin")
    mkdirSync(projectBin)
    const invoked = path.join(project, "shadow-invoked")
    writeFileSync(path.join(projectBin, "claude"), `#!/bin/sh\n: > '${invoked}'\nexit 0\n`)
    chmodSync(path.join(projectBin, "claude"), 0o755)
    const safe = sandbox(["claude"], "#!/bin/sh\nexit 99\n")
    const dir = runDir()

    const result = run(["codex", "claude", payload(), dir], dir, {
      ...safe.env,
      PATH: `${projectBin}:${safe.bin}`,
    }, project)

    expect(result.files).not.toContain("pov-claude.json")
    expect(result.stderr).toContain("fixed route 'claude' is unavailable")
    expect(existsSync(invoked)).toBe(false)
  })

  test("rejects a non-Git project-local shebang interpreter", () => {
    const project = temp("pov-hostile-interpreter-project-")
    const projectBin = path.join(project, "bin")
    const providerBin = path.join(temp("pov-external-provider-"), "bin")
    mkdirSync(projectBin)
    mkdirSync(providerBin)
    const invoked = path.join(project, "interpreter-invoked")
    writeFileSync(path.join(projectBin, "ce-local-node"), `#!/bin/sh\n: > '${invoked}'\nexit 0\n`)
    chmodSync(path.join(projectBin, "ce-local-node"), 0o755)
    writeFileSync(path.join(providerBin, "claude"), "#!/usr/bin/env ce-local-node\n")
    chmodSync(path.join(providerBin, "claude"), 0o755)
    const dir = runDir()

    const result = run(["codex", "claude", payload(), dir], dir, {
      ...process.env,
      PATH: `${projectBin}:${providerBin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
      CROSS_MODEL_REPO_ROOT: project,
    }, project)

    expect(result.files).not.toContain("pov-claude.json")
    expect(result.stderr).toContain("beneath the declared project root")
    expect(existsSync(invoked)).toBe(false)
  })

  test("rejects a project-module shebang without running code or publishing an artifact", () => {
    const project = temp("pov-module-project-")
    const { bin, env } = sandbox(["claude"], "#!/bin/sh\nexit 99\n")
    const marker = path.join(path.dirname(bin), "module-ran")
    writeFileSync(path.join(project, "hostile_project_module.py"), `open('${marker}', 'w').close()\n`)
    writeFileSync(path.join(bin, "claude"), "#!/usr/bin/env -S python3 -m hostile_project_module\n")
    chmodSync(path.join(bin, "claude"), 0o755)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, {
      ...env,
      CROSS_MODEL_REPO_ROOT: project,
    }, project)

    expect(result.files).not.toContain("pov-claude.json")
    expect(existsSync(marker)).toBe(false)
  })

  test("rejects a preload shebang argument before its interpreter runs", () => {
    const root = temp("pov-preload-")
    const providerBin = path.join(root, "providers")
    const interpreterBin = path.join(root, "interpreters")
    mkdirSync(providerBin)
    mkdirSync(interpreterBin)
    const marker = path.join(root, "preload-ran")
    const interpreter = path.join(interpreterBin, "node")
    writeFileSync(interpreter, `#!/bin/sh\n: > '${marker}'\nexit 0\n`)
    chmodSync(interpreter, 0o755)
    writeFileSync(path.join(providerBin, "claude"), `#!${interpreter} --require=${root}/preload.js\n`)
    chmodSync(path.join(providerBin, "claude"), 0o755)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, {
      ...process.env,
      PATH: `${providerBin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
    })

    expect(result.files).not.toContain("pov-claude.json")
    expect(existsSync(marker)).toBe(false)
  })

  test("detects interpreter substitution after provider-chain qualification", async () => {
    const root = temp("pov-interpreter-substitution-")
    const interpreterBin = path.join(root, "interpreters")
    const providerBin = path.join(root, "providers")
    mkdirSync(interpreterBin)
    mkdirSync(providerBin)
    const invoked = path.join(root, "replacement-invoked")
    const response = '{"structured_output":{"voice":"peer","position":"Hold","reasoning":"Evidence","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial"}}'
    const interpreter = path.join(interpreterBin, "ce-safe-node")
    writeFileSync(interpreter, '#!/bin/sh\nexec /bin/sh "$@"\n')
    chmodSync(interpreter, 0o755)
    const provider = path.join(providerBin, "claude")
    writeFileSync(provider, `#!/usr/bin/env ce-safe-node\ncat >/dev/null\nprintf '%s' '${response}'\n`)
    chmodSync(provider, 0o755)
    const dir = runDir()
    const scratchParent = temp("pov-substitution-scratch-")
    const largePayload = payload("x".repeat(32 * 1024 * 1024))
    const child = spawn(PYTHON, ["-I", "-S", LAUNCHER, "codex", "claude", largePayload, dir], {
      env: {
        ...process.env,
        PATH: `${interpreterBin}:${providerBin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
        CROSS_MODEL_MAX_PAYLOAD_CHARS: String(40 * 1024 * 1024),
        CROSS_MODEL_SCRATCH_PARENT: scratchParent,
      },
      stdio: ["ignore", "ignore", "pipe"],
    })
    let stderr = ""
    child.stderr?.setEncoding("utf8")
    child.stderr?.on("data", (chunk) => { stderr += chunk })
    const deadline = Date.now() + 10_000
    while (readdirSync(scratchParent).length === 0 && Date.now() < deadline) await Bun.sleep(1)
    expect(readdirSync(scratchParent).length).toBe(1)
    const replacement = `${interpreter}.replacement`
    writeFileSync(replacement, `#!/bin/sh\n: > '${invoked}'\nexit 0\n`)
    chmodSync(replacement, 0o755)
    renameSync(replacement, interpreter)
    await new Promise<void>((resolve) => child.once("exit", () => resolve()))

    expect(readdirSync(dir)).not.toContain("pov-claude.json")
    expect(stderr).toContain("provider executable identity changed")
    expect(existsSync(invoked)).toBe(false)
  })

  test("runs a safe private external provider through a canonical symlink target", () => {
    const response = '{"structured_output":{"voice":"peer","position":"Hold","reasoning":"Evidence","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial"},"modelUsage":{"claude-opus-4-8-20260115":{}}}'
    const { bin, env } = sandbox(["claude"], "#!/bin/sh\nexit 99\n")
    const targetDir = path.join(path.dirname(bin), "package", "bin")
    mkdirSync(targetDir, { recursive: true })
    const target = path.join(targetDir, "claude.js")
    writeFileSync(target, `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${response}'\n`)
    chmodSync(target, 0o755)
    rmSync(path.join(bin, "claude"))
    symlinkSync(target, path.join(bin, "claude"))
    const dir = runDir()

    const result = run(["codex", "claude", payload(), dir], dir, env)

    expect(result.files).toContain("pov-claude.json")
    expect(JSON.parse(readFileSync(path.join(dir, "pov-claude.json"), "utf8"))).toMatchObject({
      model_identity_status: "matched",
      position: "Hold",
    })
  })

  test("failed Grok CLI returns control without invoking Cursor", () => {
    const { bin, env } = sandbox(["grok", "cursor-agent"])
    const cursorInvoked = path.join(temp("pov-invoked-"), "cursor")
    writeFileSync(path.join(bin, "grok"), "#!/bin/sh\nexit 1\n")
    writeFileSync(path.join(bin, "cursor-agent"), `#!/bin/sh\n: > '${cursorInvoked}'\nexit 0\n`)
    chmodSync(path.join(bin, "grok"), 0o755)
    chmodSync(path.join(bin, "cursor-agent"), 0o755)
    const dir = runDir()
    const result = run(["codex", "grok-cli", payload(), dir], dir, env)
    expect(result.files).not.toContain("pov-grok.json")
    expect(existsSync(cursorInvoked)).toBe(false)
  })

  test("grok-only egress allowlist does not sanction the grok-cursor route", () => {
    const { bin, env } = sandbox(["grok", "cursor-agent"])
    const cursorInvoked = path.join(temp("pov-invoked-"), "cursor")
    writeFileSync(path.join(bin, "grok"), "#!/bin/sh\nexit 1\n")
    writeFileSync(path.join(bin, "cursor-agent"), `#!/bin/sh\n: > '${cursorInvoked}'\nexit 0\n`)
    chmodSync(path.join(bin, "grok"), 0o755)
    chmodSync(path.join(bin, "cursor-agent"), 0o755)

    const dir = runDir()
    const result = run(["codex", "grok-cursor", payload(), dir], dir, {
      ...env,
      CROSS_MODEL_PEERS: "grok",
    })
    expect(result.code).toBe(0)
    expect(existsSync(cursorInvoked)).toBe(false)
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
  ])("route %s with allowlist %s allowed=%s", (route, allow, allowed) => {
    const response = '{"structured_output":{"voice":"peer","position":"Hold","reasoning":"Evidence","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial"}}'
    const binary = route === "grok-cli" ? "grok" : "cursor-agent"
    const { env } = sandbox([binary], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${response}'\n`)
    const dir = runDir()
    const result = run(["codex", route, payload(), dir], dir, { ...env, CROSS_MODEL_PEERS: allow })
    const target = route.startsWith("grok") ? "grok" : route
    expect(result.files.includes(`pov-${target}.json`)).toBe(allowed)
  })

  test("caller-narrowed read root is used while private scratch is cleaned", () => {
    const repoRoot = temp("pov-repo-root-")
    const readRoot = path.join(repoRoot, "src")
    mkdirSync(readRoot)
    const scratchParent = temp("pov-scratch-parent-")
    const observed = path.join(temp("pov-observed-"), "pwd")
    const response = '{"structured_output":{"voice":"peer","position":"Hold","reasoning":"Evidence","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial"}}'
    const { env } = sandbox(["cursor-agent"], `#!/bin/sh\nprintf '%s' "$PWD" > '${observed}'\ncat >/dev/null\nprintf '%s' '${response}'\n`)
    const dir = runDir()
    const result = run(["codex", "cursor", payload(), dir], dir, {
      ...env,
      CROSS_MODEL_REPO_ROOT: repoRoot,
      CROSS_MODEL_READ_ROOT: readRoot,
      CROSS_MODEL_INCLUDE_PATHS: "src/**,README.md",
      CROSS_MODEL_EXCLUDE_PATHS: ".env*,secrets/**",
      CROSS_MODEL_SCRATCH_PARENT: scratchParent,
    })
    expect(result.files).toContain("pov-cursor.json")
    expect(readFileSync(observed, "utf8")).toBe(realpathSync(readRoot))
    expect(readdirSync(scratchParent)).toEqual([])
  })

  test("read and run roots cannot escape or mutate the declared repository boundary", () => {
    const repoRoot = temp("pov-boundary-repo-")
    const outsideRead = temp("pov-boundary-read-")
    const outsideRun = runDir()
    const { env } = sandbox(["cursor-agent"], "#!/bin/sh\nexit 99\n")
    const outside = run(["codex", "cursor", payload(), outsideRun], outsideRun, {
      ...env,
      CROSS_MODEL_REPO_ROOT: repoRoot,
      CROSS_MODEL_READ_ROOT: outsideRead,
    })
    expect(outside.files).not.toContain("pov-cursor.json")
    expect(outside.stderr).toContain("outside repository root")

    const insideRun = path.join(repoRoot, "peer-results")
    const inside = run(["codex", "cursor", payload(), insideRun], insideRun, {
      ...env,
      CROSS_MODEL_REPO_ROOT: repoRoot,
      CROSS_MODEL_READ_ROOT: repoRoot,
    })
    expect(existsSync(insideRun)).toBe(false)
    expect(inside.stderr).toContain("run-dir must be outside the repository")
  })

  test("the launcher requires execution from the canonical declared repository root", () => {
    const repoRoot = temp("pov-launch-root-")
    const wrongRoot = temp("pov-wrong-launch-root-")
    const invoked = path.join(temp("pov-root-provider-"), "invoked")
    const { env } = sandbox(["claude"], `#!/bin/sh\n: > '${invoked}'\nexit 0\n`)
    const dir = runDir()
    const result = spawnSync(PYTHON, ["-I", "-S", LAUNCHER, "codex", "claude", payload(), dir], {
      encoding: "utf8",
      cwd: wrongRoot,
      env: { ...env, CROSS_MODEL_REPO_ROOT: repoRoot },
    })

    expect(result.status).toBe(2)
    expect(result.stderr).toContain("must be launched from the declared project root")
    expect(existsSync(invoked)).toBe(false)
    expect(readdirSync(dir)).toEqual([])
  })

  test.each(["SIGTERM", "SIGINT"] as const)("%s cleans private peer scratch and heartbeat", async (signal) => {
    const scratchParent = temp("pov-signal-scratch-")
    const started = path.join(temp("pov-signal-started-"), "marker")
    const { env } = sandbox(["cursor-agent"], `#!/bin/sh\n: > '${started}'\ncat >/dev/null\nsleep 30\n`)
    const dir = runDir()
    const child = spawn(PYTHON, ["-I", "-S", LAUNCHER, "codex", "cursor", payload(), dir], {
      env: { ...env, CROSS_MODEL_SCRATCH_PARENT: scratchParent },
      stdio: "ignore",
    })
    const deadline = Date.now() + 5_000
    while ((!existsSync(started) || readdirSync(scratchParent).length === 0) && Date.now() < deadline) {
      await Bun.sleep(25)
    }
    expect(existsSync(started)).toBe(true)
    expect(readdirSync(scratchParent).length).toBe(1)
    const workerPid = child.pid
    expect(workerPid).toBeDefined()
    const childPids = spawnSync("pgrep", ["-P", String(workerPid)], { encoding: "utf8" })
      .stdout.split(/\s+/).filter(Boolean).map(Number)
    expect(childPids.length).toBeGreaterThanOrEqual(2)
    child.kill(signal)
    await new Promise<void>((resolve) => child.once("exit", () => resolve()))
    expect(readdirSync(scratchParent)).toEqual([])
    for (const pid of childPids) {
      expect(() => process.kill(pid, 0)).toThrow()
    }
  })

  test("peer brief restricts external queries to public subject terms", () => {
    const persona = readFileSync(path.join(__dirname, "../../skills/ce-pov/references/agents/pov-peer.md"), "utf8")
    expect(persona).toContain("public subject-level terms")
    expect(persona).toContain("Never place repository-derived")
  })
})
