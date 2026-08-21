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

setDefaultTimeout(20_000)

const roots: string[] = []
function temp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  roots.push(dir)
  return dir
}
afterAll(() => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

const SCRIPT = path.join(__dirname, "../../skills/ce-pov/scripts/cross-model-pov.sh")
const ROUTES = ["codex", "claude", "grok-cli", "grok-cursor", "cursor", "composer"] as const
const NEVER_FLAGS = ["--yolo", "--force", "-f", "--always-approve", "--dangerously-skip-permissions"]
const REAL_TOOLS = [
  "bash", "sh", "jq", "python3", "date", "sed", "tr", "cat", "wc", "dirname",
  "basename", "mktemp", "env", "perl", "timeout", "gtimeout", "sleep", "rm", "mv",
  "chmod", "cp", "printf", "kill", "mkdir", "grep", "tail", "ps",
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
  // Mask any real Codex.app bundle so discovery sees only what the test stages.
  return { bin, env: { ...process.env, PATH: bin, CROSS_MODEL_CODEX_APP_DIRS: temp("pov-nobundle-") } }
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
function emit(route: string, env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync("bash", [SCRIPT, "--emit-adapter", route], { encoding: "utf8", env })
  expect(result.status).toBe(0)
  return result.stdout.trim()
}

describe("ce-pov cross-model route safety", () => {
  test("a provider-qualified codex model id is accepted; family is still checked", () => {
    const accepted = emit("codex", {
      ...process.env,
      CROSS_MODEL_MODEL_OVERRIDE_TARGET: "codex",
      CROSS_MODEL_MODEL_OVERRIDE: "openai.gpt-5.6-sol",
    })
    expect(accepted).toContain("openai.gpt-5.6-sol")
    const acceptedSlash = emit("codex", {
      ...process.env,
      CROSS_MODEL_MODEL_OVERRIDE_TARGET: "codex",
      CROSS_MODEL_MODEL_OVERRIDE: "openai/gpt-5.6-sol",
    })
    expect(acceptedSlash).toContain("openai/gpt-5.6-sol")

    const crossFamily = spawnSync("bash", [SCRIPT, "--emit-adapter", "codex"], {
      encoding: "utf8",
      env: {
        ...process.env,
        CROSS_MODEL_MODEL_OVERRIDE_TARGET: "codex",
        CROSS_MODEL_MODEL_OVERRIDE: "bedrock.claude-opus-5",
      },
    })
    expect(crossFamily.status).toBe(2)
    expect(crossFamily.stderr).toContain("not compatible with route")
  })

  test("all routes preserve read/write/exec denial and avoid never-use flags", () => {
    for (const route of ROUTES) {
      const command = emit(route)
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
    expect(emit("claude")).toContain("--output-format stream-json")
    expect(emit("claude")).toContain("--verbose")
    expect(emit("grok-cli")).toContain("--cwd <read-root>")
    expect(emit("grok-cli")).toContain("--deny Edit")
    expect(emit("grok-cli")).toContain("--deny Write")
    expect(emit("grok-cli")).toContain("--deny Bash")
    // Without --verbatim grok offloads a large prompt to a session file and
    // sends only a preview, so the peer answers on context it never received.
    expect(emit("grok-cli")).toContain("--verbatim")
    expect(emit("grok-cli")).toContain("--output-format json")
    expect(emit("grok-cli")).not.toContain("stream-json")
    for (const route of ["grok-cursor", "cursor", "composer"]) {
      expect(emit(route)).toContain("--mode ask")
      expect(emit(route)).toContain("--sandbox enabled")
      expect(emit(route)).toContain("--workspace <read-root>")
      expect(emit(route)).toContain("--output-format stream-json")
    }
    expect(emit("cursor")).not.toContain("--model")
    expect(emit("composer")).toContain("--model")
    expect(emit("grok-cursor")).toContain("--model cursor-grok-4.6-high")
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

  test("same-family model override changes only model-specific routes", () => {
    const composer = emit("composer", {
      ...process.env,
      CROSS_MODEL_MODEL_OVERRIDE: "composer-next-fast",
      CROSS_MODEL_MODEL_OVERRIDE_TARGET: "composer",
    })
    expect(composer).toContain("--model composer-next-fast")
    expect(composer).toContain("--workspace <read-root>")

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
  const valid = '{"structured_output":{"voice":"peer","position":"Choose A","reasoning":"Lower correction cost","evidence":["https://example.com"],"external_check":"ran","mode":"independent","movement":"initial","final":true},"modelUsage":{"claude-opus-5-20260801":{"inputTokens":10}}}'

  test.each([
    ["missing position", '{"structured_output":{"reasoning":"why"}}'],
    ["empty position", '{"structured_output":{"position":"","reasoning":"why"}}'],
    ["missing reasoning", '{"structured_output":{"position":"Choose A"}}'],
    ["missing mode", '{"structured_output":{"voice":"peer","position":"Choose A","reasoning":"why","evidence":[],"external_check":"unavailable","movement":"initial","final":true}}'],
    ["missing evidence", '{"structured_output":{"voice":"peer","position":"Choose A","reasoning":"why","external_check":"unavailable","mode":"independent","movement":"initial","final":true}}'],
    ["non-string evidence item", '{"structured_output":{"voice":"peer","position":"Choose A","reasoning":"why","evidence":[42],"external_check":"unavailable","mode":"independent","movement":"initial","final":true}}'],
    ["empty evidence item", '{"structured_output":{"voice":"peer","position":"Choose A","reasoning":"why","evidence":[""],"external_check":"unavailable","mode":"independent","movement":"initial","final":true}}'],
    ["missing external check", '{"structured_output":{"voice":"peer","position":"Choose A","reasoning":"why","evidence":[],"mode":"independent","movement":"initial","final":true}}'],
    ["missing voice", '{"structured_output":{"position":"Choose A","reasoning":"why","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial","final":true}}'],
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

  test("accepts the fable alias as a claude override and verifies its receipt", () => {
    const fable = valid.replace("claude-opus-5-20260801", "claude-fable-5")
    const { env } = sandbox(["claude"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${fable}'\n`)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, {
      ...env,
      CROSS_MODEL_MODEL_OVERRIDE_TARGET: "claude",
      CROSS_MODEL_MODEL_OVERRIDE: "fable",
    })
    expect(result.files).toContain("pov-claude.json")
    const out = JSON.parse(readFileSync(path.join(dir, "pov-claude.json"), "utf8"))
    expect(out.model_requested).toBe("fable")
    expect(out.model_actual).toBe("claude-fable-5")
    expect(result.stderr).not.toContain("model mismatch")
  })

  test("reads grok's camelCase structuredOutput instead of a first-turn placeholder in text", () => {
    const envelope = '{"text":"{\\"position\\":\\"blocked: gathering subject evidence\\"}{\\"position\\":\\"Choose A\\"}","structuredOutput":{"voice":"peer","position":"Choose A","reasoning":"Lower correction cost","evidence":["src/a.ts:1"],"external_check":"unavailable","mode":"independent","movement":"initial","final":true},"modelUsage":{"grok-4.6":{"inputTokens":1}}}'
    const { env } = sandbox(["grok"], `#!/bin/sh\nprintf '%s' '${envelope}'\n`)
    const dir = runDir()
    const result = run(["codex", "grok-cli", payload(), dir], dir, env)
    expect(result.files).toContain("pov-grok.json")
    const out = JSON.parse(readFileSync(path.join(dir, "pov-grok.json"), "utf8"))
    expect(out.position).toBe("Choose A")
  })

  test("a settled final object in text beats a non-final structuredOutput", () => {
    const settled = '{\\"voice\\":\\"peer\\",\\"position\\":\\"Choose A\\",\\"reasoning\\":\\"why\\",\\"evidence\\":[\\"src/a.ts:1\\"],\\"external_check\\":\\"unavailable\\",\\"mode\\":\\"independent\\",\\"movement\\":\\"initial\\",\\"final\\":true}'
    const envelope = `{"text":"${settled}","structuredOutput":{"voice":"peer","position":"gathering evidence","reasoning":"why","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial","final":false},"modelUsage":{"grok-4.6":{"inputTokens":1}}}`
    const { env } = sandbox(["grok"], `#!/bin/sh\nprintf '%s' '${envelope}'\n`)
    const dir = runDir()
    const result = run(["codex", "grok-cli", payload(), dir], dir, env)
    expect(result.files).toContain("pov-grok.json")
    const out = JSON.parse(readFileSync(path.join(dir, "pov-grok.json"), "utf8"))
    expect(out.position).toBe("Choose A")
    expect(out.final).toBe(true)
    expect(result.stderr).not.toContain("non-final position")
  })

  test("a valid final POV in text is not outranked by a later fully keyed but invalid draft", () => {
    const settled = '{\\"voice\\":\\"peer\\",\\"position\\":\\"Choose A\\",\\"reasoning\\":\\"why\\",\\"evidence\\":[],\\"external_check\\":\\"unavailable\\",\\"mode\\":\\"independent\\",\\"movement\\":\\"initial\\",\\"final\\":true}'
    const invalid = '{\\"voice\\":\\"peer\\",\\"position\\":\\"Choose B\\",\\"reasoning\\":42,\\"evidence\\":\\"none\\",\\"external_check\\":\\"maybe\\",\\"mode\\":\\"independent\\",\\"movement\\":\\"initial\\",\\"final\\":true}'
    const badEvidence = '{\\"voice\\":\\"peer\\",\\"position\\":\\"Choose C\\",\\"reasoning\\":\\"why\\",\\"evidence\\":[42,\\"\\"],\\"external_check\\":\\"unavailable\\",\\"mode\\":\\"independent\\",\\"movement\\":\\"initial\\",\\"final\\":true}'
    const envelope = `{"text":"${settled}${invalid}${badEvidence}"}`
    const { env } = sandbox(["claude"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${envelope}'\n`)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)
    expect(result.files).toContain("pov-claude.json")
    expect(JSON.parse(readFileSync(path.join(dir, "pov-claude.json"), "utf8")).position).toBe("Choose A")
  })

  test("a bare {final:true} structured stub does not beat a complete final POV in text", () => {
    const settled = '{\\"voice\\":\\"peer\\",\\"position\\":\\"Choose A\\",\\"reasoning\\":\\"why\\",\\"evidence\\":[],\\"external_check\\":\\"unavailable\\",\\"mode\\":\\"independent\\",\\"movement\\":\\"initial\\",\\"final\\":true}'
    const envelope = `{"structured_output":{"final":true},"text":"${settled}"}`
    const { env } = sandbox(["claude"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${envelope}'\n`)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)
    expect(result.files).toContain("pov-claude.json")
    expect(JSON.parse(readFileSync(path.join(dir, "pov-claude.json"), "utf8")).position).toBe("Choose A")
  })

  test("a shaped non-final POV in text beside a bare structured stub still reaches the retry", () => {
    const placeholder = '{\\"voice\\":\\"peer\\",\\"position\\":\\"gathering evidence\\",\\"reasoning\\":\\"why\\",\\"evidence\\":[],\\"external_check\\":\\"unavailable\\",\\"mode\\":\\"independent\\",\\"movement\\":\\"initial\\",\\"final\\":false}'
    const stubEnvelope = `{"structured_output":{},"text":"${placeholder}"}`
    const counter = path.join(temp("pov-attempts-"), "n")
    const stub = `#!/bin/sh
cat >/dev/null
n=$(cat '${counter}' 2>/dev/null || echo 0); n=$((n+1)); echo $n > '${counter}'
if [ $n -eq 1 ]; then printf '%s' '${stubEnvelope}'; else printf '%s' '${valid}'; fi
`
    const { env } = sandbox(["claude"], stub)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)
    expect(readFileSync(counter, "utf8").trim()).toBe("2")
    expect(result.stderr).toContain("non-final position (\"gathering evidence\")")
    expect(result.files).toContain("pov-claude.json")
  })

  test("a shaped artifact that omits final is non-final, whatever its position says", () => {
    const nofinal = '{"structured_output":{"voice":"peer","position":"Choose A","reasoning":"why","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial"}}'
    const counter = path.join(temp("pov-attempts-"), "n")
    const stub = `#!/bin/sh
cat >/dev/null
n=$(cat '${counter}' 2>/dev/null || echo 0); echo $((n+1)) > '${counter}'
printf '%s' '${nofinal}'
`
    const { env } = sandbox(["claude"], stub)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)
    expect(readFileSync(counter, "utf8").trim()).toBe("2")
    expect(result.files).not.toContain("pov-claude.json")
    expect(result.stderr).toContain("peer skip evidence: non-final position: Choose A")
  })

  test("a non-final position is retried once on the same route with a final-answer requirement", () => {
    const placeholder = '{"structured_output":{"voice":"peer","position":"blocked: gathering subject evidence","reasoning":"Need to inspect the tree first.","evidence":["subject-payload: round 1"],"external_check":"unavailable","mode":"independent","movement":"initial","final":false}}'
    const counter = path.join(temp("pov-attempts-"), "n")
    const prompts = path.join(temp("pov-prompts-"), "p")
    const stub = `#!/bin/sh
prompt=""; while [ $# -gt 0 ]; do [ "$1" = "--prompt-file" ] && prompt="$2"; shift; done
n=$(cat '${counter}' 2>/dev/null || echo 0); n=$((n+1)); echo $n > '${counter}'
cp "$prompt" '${prompts}'.$n
if [ $n -eq 1 ]; then printf '%s' '${placeholder}'; else printf '%s' '${valid}'; fi
`
    const { env } = sandbox(["grok"], stub)
    const dir = runDir()
    const result = run(["codex", "grok-cli", payload(), dir], dir, env)
    expect(readFileSync(counter, "utf8").trim()).toBe("2")
    expect(result.stderr).toContain("non-final position")
    expect(readFileSync(`${prompts}.1`, "utf8")).not.toContain("This response is the final one")
    expect(readFileSync(`${prompts}.2`, "utf8")).toContain("This response is the final one")
    expect(result.files).toContain("pov-grok.json")
    const out = JSON.parse(readFileSync(path.join(dir, "pov-grok.json"), "utf8"))
    expect(out.position).toBe("Choose A")
  })

  test("a second non-final position drops the voice with skip evidence naming it", () => {
    const placeholder = '{"structured_output":{"voice":"peer","position":"Blocked: still gathering evidence","reasoning":"why","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial","final":false}}'
    const counter = path.join(temp("pov-attempts-"), "n")
    const stub = `#!/bin/sh
cat >/dev/null
n=$(cat '${counter}' 2>/dev/null || echo 0); echo $((n+1)) > '${counter}'
printf '%s' '${placeholder}'
`
    const { env } = sandbox(["claude"], stub)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)
    expect(result.code).toBe(0)
    expect(readFileSync(counter, "utf8").trim()).toBe("2")
    expect(result.files).not.toContain("pov-claude.json")
    expect(result.stderr).toContain("peer skip evidence: non-final position: Blocked: still gathering evidence")
  })

  test.each([
    ["settled Hold", "Hold: do not adopt"],
    ["settled Blocked grounding-floor verdict", "Blocked — insufficient project grounding"],
    ["settled Blocked approach-set verdict", "Blocked: the supplied approaches lack enough detail to choose"],
  ])("a %s position marked final is accepted, whatever its wording", (_name, position) => {
    const settled = `{"structured_output":{"voice":"peer","position":"${position}","reasoning":"Need evidence","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial","final":true}}`
    const { env } = sandbox(["claude"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${settled}'\n`)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)
    expect(result.files).toContain("pov-claude.json")
    expect(result.stderr).not.toContain("non-final position")
  })

  test("a non-final position with no hard window left is dropped without a retry", () => {
    const placeholder = '{"structured_output":{"voice":"peer","position":"pending: reading the tree","reasoning":"why","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial","final":false}}'
    const counter = path.join(temp("pov-attempts-"), "n")
    const stub = `#!/bin/sh
cat >/dev/null
sleep 2
n=$(cat '${counter}' 2>/dev/null || echo 0); echo $((n+1)) > '${counter}'
printf '%s' '${placeholder}'
`
    const { env } = sandbox(["claude"], stub)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, { ...env, CROSS_MODEL_HARD_SECS: "60", CROSS_MODEL_RETRY_MIN_SECS: "59" })
    expect(readFileSync(counter, "utf8").trim()).toBe("1")
    expect(result.files).not.toContain("pov-claude.json")
    expect(result.stderr).toContain("not retrying")
    expect(result.stderr).toContain("peer skip evidence: non-final position: pending: reading the tree")
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
    expect(out.model_requested).toBe("claude-opus-5")
    expect(out.model_actual).toBe("claude-opus-5-20260801")
    expect(out.movement).toBe("initial")
    expect(out.independence_verified).toBe(true)
  })

  test("recovers a raw schema-shaped POV without a structured-output envelope", () => {
    const raw = '{"voice":"peer","position":"Choose A","reasoning":"Lower correction cost","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial","final":true}'
    const { env } = sandbox(["claude"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${raw}'\n`)
    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)
    expect(result.files).toContain("pov-claude.json")
    const out = JSON.parse(readFileSync(path.join(dir, "pov-claude.json"), "utf8"))
    expect(out.position).toBe("Choose A")
    expect(out.reasoning).toBe("Lower correction cost")
  })

  test("recovers a fenced POV nested in a CLI result envelope", () => {
    const pov = '{"voice":"peer","position":"Choose B","reasoning":"The boundary is clearer","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial","final":true}'
    const envelope = JSON.stringify({ type: "result", result: `\`\`\`json\n${pov}\n\`\`\`` })
    const { env } = sandbox(["cursor-agent"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${envelope}'\n`)
    const dir = runDir()
    const result = run(["codex", "composer", payload(), dir], dir, env)
    expect(result.files).toContain("pov-composer.json")
    const out = JSON.parse(readFileSync(path.join(dir, "pov-composer.json"), "utf8"))
    expect(out.position).toBe("Choose B")
    expect(out.reasoning).toBe("The boundary is clearer")
    expect(out.model_actual).toBe("unverified")
    expect(out.serving_family).toBe("unknown")
    expect(out.independence_verified).toBe(false)
  })

  test("Cursor default records auto and unverified independence", () => {
    const response = '{"structured_output":{"voice":"peer","position":"Hold","reasoning":"Need evidence","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial","final":true}}'
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
    const response = '{"structured_output":{"voice":"peer","position":"Hold","reasoning":"Need evidence","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial","final":true}}'
    const { env } = sandbox(["claude"], `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${response}'\n`)
    const dir = runDir()
    const result = run(["unknown", "claude", payload(), dir], dir, {
      ...env,
      CROSS_MODEL_HOST_HARNESS: "cursor",
    })
    expect(result.files).toContain("pov-claude.json")
    const out = JSON.parse(readFileSync(path.join(dir, "pov-claude.json"), "utf8"))
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
    const response = '{"structured_output":{"voice":"peer","position":"Hold","reasoning":"Late evidence","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial","final":true}}'
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

  test("workspace creation failure skips the provider without publishing an artifact", () => {
    const { bin, env } = sandbox(["claude"])
    const invoked = path.join(temp("pov-invoked-"), "claude")
    const realMktemp = realTools().find(([tool]) => tool === "mktemp")?.[1]
    expect(realMktemp).toBeTruthy()
    writeFileSync(path.join(bin, "claude"), `#!/bin/sh\n: > '${invoked}'\nexit 0\n`)
    rmSync(path.join(bin, "mktemp"))
    writeFileSync(path.join(bin, "mktemp"), `#!/bin/sh\nif [ "\${1:-}" = "-d" ]; then exit 1; fi\nexec '${realMktemp}' "$@"\n`)
    chmodSync(path.join(bin, "claude"), 0o755)
    chmodSync(path.join(bin, "mktemp"), 0o755)

    const dir = runDir()
    const result = run(["codex", "claude", payload(), dir], dir, env)
    expect(result.code).toBe(0)
    expect(existsSync(invoked)).toBe(false)
    expect(result.files).not.toContain("pov-claude.json")
    expect(result.stderr).toContain("workspace isolation unavailable")
  })
})

describe("ce-pov fixed route and egress allowlist", () => {
  test("an app-bundled codex CLI off PATH satisfies the fixed codex route (issue #1272)", () => {
    const { env } = sandbox([])
    const bundle = path.join(temp("pov-bundle-"), "Codex.app", "Contents", "Resources")
    mkdirSync(bundle, { recursive: true })
    const invoked = path.join(temp("pov-invoked-"), "codex")
    writeFileSync(path.join(bundle, "codex"), `#!/bin/sh\n: > '${invoked}'\nexit 0\n`)
    chmodSync(path.join(bundle, "codex"), 0o755)
    const dir = runDir()
    const result = run(["claude", "codex", payload(), dir], dir, { ...env, CROSS_MODEL_CODEX_APP_DIRS: bundle })
    expect(result.stderr).not.toContain("is unavailable")
    expect(existsSync(invoked)).toBe(true)
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
    const response = '{"structured_output":{"voice":"peer","position":"Hold","reasoning":"Evidence","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial","final":true}}'
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
    const response = '{"structured_output":{"voice":"peer","position":"Hold","reasoning":"Evidence","evidence":[],"external_check":"unavailable","mode":"independent","movement":"initial","final":true}}'
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

  test.each(["SIGTERM", "SIGINT"] as const)("%s cleans private peer scratch and heartbeat", async (signal) => {
    const scratchParent = temp("pov-signal-scratch-")
    const started = path.join(temp("pov-signal-started-"), "marker")
    const { env } = sandbox(["cursor-agent"], `#!/bin/sh\n: > '${started}'\ncat >/dev/null\nsleep 30\n`)
    const dir = runDir()
    const child = spawn("bash", [SCRIPT, "codex", "cursor", payload(), dir], {
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
