import { afterAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  chmodSync,
  existsSync,
  realpathSync,
  rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const tempRoots: string[] = []
function mkTempRoot(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  tempRoots.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true })
})

const REAL_TOOLS = [
  "bash", "sh", "jq", "python3", "date", "sed", "tr", "cat", "wc", "mktemp", "env",
  "sleep", "rm", "mv", "chmod", "printf", "kill", "tail", "grep",
]
function resolveRealToolPaths(): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const tool of REAL_TOOLS) {
    const real = spawnSync("command", ["-v", tool], {
      encoding: "utf8",
      shell: "/bin/bash",
    }).stdout?.trim()
    if (real && existsSync(real)) out.push([tool, real])
  }
  return out
}
// Resolved once — PATH entries are static within a run, so re-forking
// `command -v` per sandbox() call would waste ~17 subprocesses each time.
const REAL_TOOL_PATHS = resolveRealToolPaths()

const WORKER = path.join(
  __dirname,
  "../../skills/ce-plan/scripts/elevation-dispatch.sh",
)
const BRAINSTORM_WORKER = path.join(
  __dirname,
  "../../skills/ce-brainstorm/scripts/elevation-dispatch.sh",
)
const LAUNCHER = path.join(__dirname, "../../skills/ce-plan/scripts/clean-launcher.py")
const BRAINSTORM_LAUNCHER = path.join(__dirname, "../../skills/ce-brainstorm/scripts/clean-launcher.py")
const PYTHON = "/usr/bin/python3"

// Approval/bypass flags the read-only elevation call must never emit.
const NEVER_FLAGS = [
  "--dangerously-skip-permissions",
  "--yolo",
  "--force",
]

/** Sandbox PATH: real coreutils plus a stub `claude` with the given body.
 *  `omit` drops named tools from the PATH to exercise missing-capability paths. */
function sandbox(
  claudeStub: string,
  omit: string[] = [],
): { bin: string; env: NodeJS.ProcessEnv } {
  const bin = path.join(mkTempRoot("elevation-sandbox-"), "bin")
  mkdirSync(bin, { recursive: true })
  for (const [tool, real] of REAL_TOOL_PATHS) {
    if (omit.includes(tool)) continue
    if (existsSync(path.join(bin, tool))) continue
    try {
      symlinkSync(real, path.join(bin, tool))
    } catch {
      /* builtin — harmless */
    }
  }
  const f = path.join(bin, "claude")
  writeFileSync(f, claudeStub)
  chmodSync(f, 0o755)
  return { bin, env: { ...process.env, PATH: bin } }
}

/** Run the worker with a stub claude; returns the parsed result envelope + stderr. */
function runWorker(
  model: string,
  claudeStub: string,
  extraEnv: Record<string, string> = {},
  omit: string[] = [],
  cwd?: string,
): { result: any; stderr: string; status: number | null } {
  const { bin, env } = sandbox(claudeStub, omit)
  const scratch = mkTempRoot("elevation-run-")
  const promptFile = path.join(scratch, "brief.md")
  const resultPath = path.join(scratch, "result.json")
  writeFileSync(promptFile, "author the plan from these findings")
  const r = spawnSync(PYTHON, ["-I", "-S", LAUNCHER, model, promptFile, resultPath], {
    encoding: "utf8",
    env: { CE_ELEVATION_POLL_SECS: "0.2", ...env, ...extraEnv },
    cwd,
  })
  const result = existsSync(resultPath)
    ? JSON.parse(readFileSync(resultPath, "utf8"))
    : null
  return { result, stderr: r.stderr ?? "", status: r.status }
}

const RESULT_LINE = (result: string, usage: Record<string, unknown> | null) =>
  JSON.stringify({
    type: "result",
    subtype: "success",
    result,
    ...(usage ? { modelUsage: usage } : {}),
  })

describe("elevation-dispatch worker", () => {
  test("both skill copies are byte-identical", () => {
    expect(readFileSync(WORKER, "utf8")).toBe(
      readFileSync(BRAINSTORM_WORKER, "utf8"),
    )
    expect(readFileSync(LAUNCHER, "utf8")).toBe(
      readFileSync(BRAINSTORM_LAUNCHER, "utf8"),
    )
  })

  test("emits a streaming, read-only claude argv", () => {
    const r = spawnSync(PYTHON, ["-I", "-S", LAUNCHER, "--emit-adapter", "fable", "/fake/handoff/xyz"], {
      encoding: "utf8",
    })
    expect(r.status).toBe(0)
    const argv = (r.stdout ?? "").split("\0").filter(Boolean)
    expect(argv.slice(0, 4)).toEqual(["<qualified-claude>", "-p", "--model", "fable"])
    expect(argv).toContain("--effort")
    expect(argv).toContain("high")
    expect(argv).toContain("stream-json")
    expect(argv).toContain("--verbose")
    // one-shot background call — no resumable session left on disk
    expect(argv).toContain("--no-session-persistence")
    // read-only posture: --tools RESTRICTS the available built-in set to these
    // five (Write/Edit/Bash are not present at all — verified: --allowedTools
    // alone only pre-approves and leaves every other tool available), and
    // --allowedTools pre-approves the same five so --permission-mode dontAsk runs
    // them without a prompt. --tools is the real boundary; --allowedTools keeps
    // them functional. No denylist.
    expect(argv).toContain("--tools")
    expect(argv).toContain("Read,Glob,Grep,WebSearch,WebFetch")
    // handoff read access is scoped to the single per-run handoff dir passed to
    // build_cmd — exactly one --add-dir, and never the whole OS temp root.
    const di = argv.indexOf("--add-dir")
    expect(di).toBeGreaterThan(-1)
    expect(argv[di + 1]).toBe("/fake/handoff/xyz")
    expect(argv.filter((a) => a === "--add-dir").length).toBe(1)
    expect(argv).not.toContain("/tmp")
    const ai = argv.indexOf("--allowedTools")
    expect(ai).toBeGreaterThan(-1)
    for (const tool of ["Read", "Glob", "Grep", "WebSearch", "WebFetch"]) {
      expect(argv).toContain(tool)
    }
    expect(argv).not.toContain("--disallowedTools")
    for (const tool of ["Edit", "Write", "Bash", "Task"]) expect(argv).not.toContain(tool)
    for (const flag of NEVER_FLAGS) expect(argv).not.toContain(flag)
  })

  test("refuses direct bash execution even for test-only adapter emission", () => {
    const result = spawnSync("/bin/bash", [WORKER, "--emit-adapter", "fable"], {
      encoding: "utf8",
    })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain("clean launcher provenance missing")
  })

  test("applies only token-safe generalized Claude model and effort selectors", () => {
    const selected = spawnSync(
      PYTHON,
      ["-I", "-S", LAUNCHER, "--emit-adapter", "sonnet", "/fake/handoff/xyz"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          CE_ROUTING_CANDIDATE_HARNESS: "claude",
          CE_ROUTING_CANDIDATE_ROUTE: "claude",
          CE_ROUTING_CANDIDATE_MODEL: "sonnet",
          CE_ROUTING_CANDIDATE_EFFORT: "medium",
        },
      },
    )
    expect(selected.status).toBe(0)
    const argv = (selected.stdout ?? "").split("\0").filter(Boolean)
    expect(argv.slice(0, 4)).toEqual(["<qualified-claude>", "-p", "--model", "sonnet"])
    expect(argv.slice(argv.indexOf("--effort"), argv.indexOf("--effort") + 2)).toEqual([
      "--effort",
      "medium",
    ])

    for (const env of [
      { CE_ROUTING_CANDIDATE_HARNESS: "codex", CE_ROUTING_CANDIDATE_MODEL: "sonnet" },
      { CE_ROUTING_CANDIDATE_HARNESS: "claude", CE_ROUTING_CANDIDATE_MODEL: "sonnet;touch-x" },
      { CE_ROUTING_CANDIDATE_HARNESS: "claude", CE_ROUTING_CANDIDATE_MODEL: "sonnet", CE_ROUTING_CANDIDATE_EFFORT: "ultra high" },
    ]) {
      const rejected = spawnSync(
        PYTHON,
        ["-I", "-S", LAUNCHER, "--emit-adapter", "sonnet", "/fake/handoff/xyz"],
        { encoding: "utf8", env: { ...process.env, ...env } },
      )
      expect(rejected.status).toBe(2)
    }
  })

  test("a matching receipt yields a matched envelope with the output", () => {
    const stub =
      "#!/bin/sh\n" +
      `printf '%s\\n' '${RESULT_LINE("PLAN BODY", { "claude-fable-5": { outputTokens: 5 } })}'\n`
    const { result } = runWorker("fable", stub)
    expect(result.status).toBe("ok")
    expect(result.output).toBe("PLAN BODY")
    expect(result.served_model).toBe("claude-fable-5")
    expect(result.receipt).toBe("matched")
    expect(result.model_identity_status).toBe("matched")
    expect(result.effort_requested).toBe("high")
    expect(result.effort_actual).toBe("unverified")
  })

  test("rejects a project-local shadow without falling through to a safe provider", () => {
    const project = mkTempRoot("elevation-hostile-project-")
    mkdirSync(path.join(project, ".git"))
    const projectBin = path.join(project, "bin")
    mkdirSync(projectBin)
    const invoked = path.join(project, "shadow-invoked")
    writeFileSync(path.join(projectBin, "claude"), `#!/bin/sh\n: > '${invoked}'\nexit 0\n`)
    chmodSync(path.join(projectBin, "claude"), 0o755)

    const safe = sandbox(
      "#!/bin/sh\nprintf '%s\\n' '" + RESULT_LINE("SAFE", { "claude-fable-5": {} }) + "'\n",
    )
    const { result, stderr } = runWorker(
      "fable",
      "#!/bin/sh\nexit 99\n",
      { PATH: `${projectBin}:${safe.bin}` },
      [],
      project,
    )

    expect(result.status).toBe("failed")
    expect(stderr).toContain("provider executable unavailable")
    expect(existsSync(invoked)).toBe(false)
  })

  test("rejects a provider beneath a declared non-Git project root", () => {
    const project = mkTempRoot("elevation-nongit-project-")
    const projectBin = path.join(project, "bin")
    mkdirSync(projectBin)
    const invoked = path.join(project, "provider-invoked")
    writeFileSync(path.join(projectBin, "claude"), `#!/bin/sh\n: > '${invoked}'\nexit 0\n`)
    chmodSync(path.join(projectBin, "claude"), 0o755)
    const safe = sandbox("#!/bin/sh\nexit 99\n")

    const { result, stderr } = runWorker(
      "fable",
      "#!/bin/sh\nexit 99\n",
      { PATH: `${projectBin}:${safe.bin}` },
      [],
      project,
    )

    expect(result).toMatchObject({ status: "failed", model_identity_status: "unverified" })
    expect(stderr).toContain("beneath the declared project root")
    expect(existsSync(invoked)).toBe(false)
  })

  test("rejects a non-Git project-local shebang interpreter", () => {
    const project = mkTempRoot("elevation-nongit-interpreter-")
    const projectBin = path.join(project, "bin")
    const providerRoot = mkTempRoot("elevation-external-provider-")
    mkdirSync(projectBin)
    const invoked = path.join(project, "interpreter-invoked")
    writeFileSync(path.join(projectBin, "ce-local-python"), `#!/bin/sh\n: > '${invoked}'\nexit 0\n`)
    chmodSync(path.join(projectBin, "ce-local-python"), 0o755)
    writeFileSync(path.join(providerRoot, "claude"), "#!/usr/bin/env ce-local-python\n")
    chmodSync(path.join(providerRoot, "claude"), 0o755)

    const { result, stderr } = runWorker(
      "fable",
      "#!/bin/sh\nexit 99\n",
      { PATH: `${projectBin}:${providerRoot}:${process.env.PATH ?? "/usr/bin:/bin"}` },
      [],
      project,
    )

    expect(result).toMatchObject({ status: "failed", model_identity_status: "unverified" })
    expect(stderr).toContain("beneath the declared project root")
    expect(existsSync(invoked)).toBe(false)
  })

  test("project-local helper shims never run when a safe provider is later on PATH", () => {
    const project = mkTempRoot("elevation-helper-project-")
    mkdirSync(path.join(project, ".git"))
    const hostileBin = path.join(project, "bin")
    mkdirSync(hostileBin)
    const marker = path.join(project, "helper-invoked")
    for (const helper of ["mktemp", "wc", "tr", "cat", "jq"]) {
      const shim = path.join(hostileBin, helper)
      writeFileSync(shim, `#!/bin/sh\n: > '${marker}'\nexit 99\n`)
      chmodSync(shim, 0o755)
    }
    const safeResponse = RESULT_LINE("SAFE", { "claude-fable-5": {} })
    const safe = sandbox(`#!/bin/sh\nprintf '%s\\n' '${safeResponse}'\n`)

    const { result } = runWorker(
      "fable",
      "#!/bin/sh\nexit 99\n",
      { PATH: `${hostileBin}:${safe.bin}` },
      [],
      project,
    )

    expect(result).toMatchObject({ status: "ok", output: "SAFE" })
    expect(existsSync(marker)).toBe(false)
  })

  test("accepts a safe external symlink launcher after validating its final target", () => {
    const { bin, env } = sandbox("#!/bin/sh\nexit 99\n")
    const targetDir = path.join(path.dirname(bin), "package", "bin")
    mkdirSync(targetDir, { recursive: true })
    const target = path.join(targetDir, "claude.js")
    writeFileSync(target, `#!/bin/sh\nprintf '%s\\n' '${RESULT_LINE("SYMLINK SAFE", { "claude-fable-5": {} })}'\n`)
    chmodSync(target, 0o755)
    rmSync(path.join(bin, "claude"))
    symlinkSync(target, path.join(bin, "claude"))

    const scratch = mkTempRoot("elevation-symlink-run-")
    const promptFile = path.join(scratch, "brief.md")
    const resultPath = path.join(scratch, "result.json")
    writeFileSync(promptFile, "author the plan")
    spawnSync(PYTHON, ["-I", "-S", LAUNCHER, "fable", promptFile, resultPath], {
      encoding: "utf8",
      env: { CE_ELEVATION_POLL_SECS: "0.2", ...env },
    })

    expect(JSON.parse(readFileSync(resultPath, "utf8"))).toMatchObject({
      status: "ok",
      output: "SYMLINK SAFE",
    })
  })

  test("binds an argument-free env shebang interpreter without invoking a malicious provider sibling", () => {
    const root = mkTempRoot("elevation-env-chain-")
    const interpreterBin = path.join(root, "interpreters")
    const providerBin = path.join(root, "provider")
    mkdirSync(interpreterBin)
    mkdirSync(providerBin)
    const safeMarker = path.join(root, "safe-interpreter")
    const maliciousMarker = path.join(root, "malicious-interpreter")
    const interpreter = path.join(interpreterBin, "ce-safe-node")
    writeFileSync(interpreter, `#!/bin/sh\n: > '${safeMarker}'\nexec /bin/sh "$@"\n`)
    chmodSync(interpreter, 0o755)
    const malicious = path.join(providerBin, "ce-safe-node")
    writeFileSync(malicious, `#!/bin/sh\n: > '${maliciousMarker}'\nexit 99\n`)
    chmodSync(malicious, 0o755)
    const provider = path.join(providerBin, "claude")
    writeFileSync(
      provider,
      `#!/usr/bin/env ce-safe-node\nprintf '%s\\n' '${RESULT_LINE("ENV SAFE", { "claude-fable-5": {} })}'\n`,
    )
    chmodSync(provider, 0o755)

    const { result } = runWorker(
      "fable",
      "#!/bin/sh\nexit 99\n",
      { PATH: `${interpreterBin}:${providerBin}:${process.env.PATH ?? "/usr/bin:/bin"}` },
    )

    expect(result).toMatchObject({ status: "ok", output: "ENV SAFE" })
    expect(existsSync(safeMarker)).toBe(true)
    expect(existsSync(maliciousMarker)).toBe(false)
  })

  test("rejects unsupported env shebang forms before invoking the provider", () => {
    const { bin, env } = sandbox("#!/bin/sh\nexit 99\n")
    const invoked = path.join(path.dirname(bin), "unsupported-invoked")
    writeFileSync(
      path.join(bin, "claude"),
      `#!/usr/bin/env sh unsupported-without-split\n: > '${invoked}'\n`,
    )
    chmodSync(path.join(bin, "claude"), 0o755)
    const scratch = mkTempRoot("elevation-unsupported-shebang-")
    const promptFile = path.join(scratch, "brief.md")
    const resultPath = path.join(scratch, "result.json")
    writeFileSync(promptFile, "author the plan")

    const result = spawnSync(PYTHON, ["-I", "-S", LAUNCHER, "fable", promptFile, resultPath], {
      encoding: "utf8",
      env: { CE_ELEVATION_POLL_SECS: "0.2", ...env },
    })

    expect(result.stderr).toContain("unsupported /usr/bin/env shebang form")
    expect(JSON.parse(readFileSync(resultPath, "utf8")).status).toBe("failed")
    expect(existsSync(invoked)).toBe(false)
  })

  test.each([
    ["project module", "#!/usr/bin/env -S python3 -m hostile_project_module"],
    ["split string", "#!/usr/bin/env --split-string=python3\\ -m\\ hostile_project_module"],
  ])("rejects %s shebang selection without running code or publishing a matched receipt", (_name, shebang) => {
    const { bin, env } = sandbox("#!/bin/sh\nexit 99\n")
    const project = mkTempRoot("elevation-code-selector-project-")
    const marker = path.join(path.dirname(bin), "selected-code-ran")
    writeFileSync(path.join(project, "hostile_project_module.py"), `open('${marker}', 'w').close()\n`)
    writeFileSync(path.join(bin, "claude"), `${shebang}\nprintf ignored\n`)
    chmodSync(path.join(bin, "claude"), 0o755)
    const scratch = mkTempRoot("elevation-code-selector-")
    const promptFile = path.join(scratch, "brief.md")
    const resultPath = path.join(scratch, "result.json")
    writeFileSync(promptFile, "author the plan")

    const result = spawnSync(PYTHON, ["-I", "-S", LAUNCHER, "fable", promptFile, resultPath], {
      encoding: "utf8",
      env: { CE_ELEVATION_POLL_SECS: "0.2", ...env },
      cwd: project,
    })

    expect(result.status).toBe(0)
    expect(existsSync(marker)).toBe(false)
    expect(JSON.parse(readFileSync(resultPath, "utf8"))).toMatchObject({
      status: "failed",
      model_identity_status: "unverified",
    })
  })

  test("rejects an absolute interpreter preload argument before any selected code runs", () => {
    const root = mkTempRoot("elevation-preload-")
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

    const { result } = runWorker("fable", "#!/bin/sh\nexit 99\n", {
      PATH: `${providerBin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
    })

    expect(result).toMatchObject({ status: "failed", model_identity_status: "unverified" })
    expect(existsSync(marker)).toBe(false)
  })

  test("rejects a provider below a group-writable external ancestor", () => {
    const invoked = path.join(mkTempRoot("elevation-unsafe-marker-"), "invoked")
    const { bin, env } = sandbox(`#!/bin/sh\n: > '${invoked}'\nexit 0\n`)
    chmodSync(path.dirname(bin), 0o770)
    const scratch = mkTempRoot("elevation-unsafe-run-")
    const promptFile = path.join(scratch, "brief.md")
    const resultPath = path.join(scratch, "result.json")
    writeFileSync(promptFile, "author the plan")
    const result = spawnSync(PYTHON, ["-I", "-S", LAUNCHER, "fable", promptFile, resultPath], {
      encoding: "utf8",
      env: { CE_ELEVATION_POLL_SECS: "0.2", ...env },
    })

    expect(result.stderr).toContain("group/other writable")
    expect(JSON.parse(readFileSync(resultPath, "utf8")).status).toBe("failed")
    expect(existsSync(invoked)).toBe(false)
  })

  test("grants read access to only the prompt's own dir, not the whole temp root", () => {
    // Security: the elevated model must see the per-run handoff dir (where the
    // orchestrator co-locates prompt + evidence) and nothing else in the temp
    // root. The worker derives --add-dir from the prompt-file's parent dir.
    const scratch = mkTempRoot("elevation-handoff-")
    const promptFile = path.join(scratch, "brief.md")
    const resultPath = path.join(scratch, "result.json")
    const argvDump = path.join(scratch, "argv.txt")
    writeFileSync(promptFile, "author the plan")
    const dumpStub =
      "#!/bin/sh\n" +
      `printf '%s\\n' "$*" > "${argvDump}"\n` +
      `printf '%s\\n' '${RESULT_LINE("OK", { "claude-fable-5": {} })}'\n`
    const { env } = sandbox(dumpStub)
    spawnSync(PYTHON, ["-I", "-S", LAUNCHER, "fable", promptFile, resultPath], {
      encoding: "utf8",
      env: { CE_ELEVATION_POLL_SECS: "0.2", ...env },
    })
    const argv = readFileSync(argvDump, "utf8")
    const m = argv.match(/--add-dir (\S+)/)
    expect(m).toBeTruthy()
    // realpath both sides — macOS pwd is logical (/var/...) vs realpath (/private/var/...)
    expect(realpathSync(m![1])).toBe(realpathSync(scratch))
    expect(argv).not.toMatch(/--add-dir \/tmp(\s|$)/)
    expect((argv.match(/--add-dir/g) || []).length).toBe(1)
  })

  test("permits externally brokered auth without forwarding config or credential variables", () => {
    const scratch = mkTempRoot("elevation-min-env-")
    const promptFile = path.join(scratch, "brief.md")
    const resultPath = path.join(scratch, "result.json")
    const envCapture = path.join(scratch, "env.txt")
    const claudeConfig = path.join(scratch, "claude-config")
    const apiSecret = "SENTINEL-elevation-api-secret"
    const oauthSecret = "SENTINEL-elevation-oauth-secret"
    writeFileSync(promptFile, "author the plan")
    const stub =
      "#!/bin/sh\n" +
      `env > "${envCapture}"\n` +
      `printf '%s\\n' '${RESULT_LINE("OK", { "claude-fable-5": {} })}'\n`
    const { env } = sandbox(stub)
    const r = spawnSync(PYTHON, ["-I", "-S", LAUNCHER, "fable", promptFile, resultPath], {
      encoding: "utf8",
      env: {
        CE_ELEVATION_POLL_SECS: "0.2",
        ...env,
        USER: "elevation-keychain-user",
        CLAUDE_CONFIG_DIR: claudeConfig,
        ANTHROPIC_API_KEY: apiSecret,
        CLAUDE_CODE_OAUTH_TOKEN: oauthSecret,
      },
    })

    expect(r.status).toBe(0)
    const childEnv = readFileSync(envCapture, "utf8")
    expect(childEnv).toContain("USER=elevation-keychain-user")
    expect(childEnv).not.toContain(`CLAUDE_CONFIG_DIR=${claudeConfig}`)
    expect(childEnv).not.toContain("CLAUDE_CONFIG_DIR=")
    expect(childEnv.split("\n").find((line) => line.startsWith("PATH="))).toBe(
      "PATH=/usr/bin:/bin",
    )
    expect(childEnv).not.toContain("ANTHROPIC_API_KEY=")
    expect(childEnv).not.toContain("CLAUDE_CODE_OAUTH_TOKEN=")
    expect(childEnv).not.toContain(apiSecret)
    expect(childEnv).not.toContain(oauthSecret)
  })

  test("BASH_ENV and exported functions cannot run before adapter PATH cleanup", () => {
    const root = mkTempRoot("elevation-shell-startup-")
    const marker = path.join(root, "startup-ran")
    const bashEnv = path.join(root, "bash-env")
    writeFileSync(bashEnv, `: > '${marker}'\n`)
    const response = RESULT_LINE("SAFE", { "claude-fable-5": {} })
    const { result } = runWorker("fable", `#!/bin/sh\nprintf '%s\\n' '${response}'\n`, {
      BASH_ENV: bashEnv,
      "BASH_FUNC_date%%": `() { : > '${marker}'; /bin/date "$@"; }`,
      SHELLOPTS: "xtrace",
    })

    expect(result).toMatchObject({ status: "ok", output: "SAFE" })
    expect(existsSync(marker)).toBe(false)
  })

  test("trusted jq remains functional when it is absent from caller PATH", () => {
    const stub =
      "#!/bin/sh\n" + `printf '%s\\n' '${RESULT_LINE("PLAN BODY", null)}'\n`
    const { result, status } = runWorker("fable", stub, {}, ["jq"])
    expect(status).toBe(0)
    expect(result.status).toBe("ok")
    expect(result.requested_model).toBe("fable")
  })

  test("a large plan is shipped intact — envelope build never passes it as an argv", () => {
    // Guards the ARG_MAX fix: the success envelope pipes the event THROUGH jq
    // rather than passing .result as `jq --arg o "$OUTPUT"`. A ~300KB plan would
    // exceed ARG_MAX and fail the exec if that regressed. printf is a shell
    // builtin, so emitting it from the stub is not itself argv-bounded.
    const big = "PLAN LINE. ".repeat(30000) // ~300KB, well past ARG_MAX
    const stub =
      "#!/bin/sh\n" +
      `printf '%s\\n' '${RESULT_LINE(big, { "claude-fable-5": { outputTokens: 5 } })}'\n`
    const { result } = runWorker("fable", stub)
    expect(result.status).toBe("ok")
    expect(result.output).toBe(big)
  })

  test("a truncated/error terminal result is failed, not shipped as ok", () => {
    // max-turns result still carries .result, but subtype/is_error mark it bad.
    const errLine = JSON.stringify({
      type: "result",
      subtype: "error_max_turns",
      is_error: true,
      result: "PARTIAL PLAN, cut off mid-",
      modelUsage: { "claude-fable-5": { outputTokens: 5 } },
    })
    const stub = "#!/bin/sh\n" + `printf '%s\\n' '${errLine}'\n`
    const { result } = runWorker("fable", stub)
    expect(result.status).toBe("failed")
  })

  test("a different served family is recorded as a mismatch", () => {
    const stub =
      "#!/bin/sh\n" +
      `printf '%s\\n' '${RESULT_LINE("PLAN BODY", { "claude-opus-4-8": { outputTokens: 5 } })}'\n`
    const { result } = runWorker("fable", stub)
    expect(result.status).toBe("ok")
    expect(result.served_model).toBe("claude-opus-4-8")
    expect(result.receipt).toBe("mismatch")
  })

  test("picks the requested family's key from a multi-key modelUsage, not keys[0]", () => {
    // jq `keys` is sorted, so keys[0] here is claude-haiku-*, an auxiliary
    // model — the served model for a requested opus is claude-opus-*.
    const stub =
      "#!/bin/sh\n" +
      `printf '%s\\n' '${RESULT_LINE("PLAN BODY", { "claude-haiku-4-5": { outputTokens: 1 }, "claude-opus-4-8": { outputTokens: 9 } })}'\n`
    const { result } = runWorker("opus", stub)
    expect(result.served_model).toBe("claude-opus-4-8")
    expect(result.receipt).toBe("matched")
  })

  test("an absent receipt is recorded as unverified, not the requested model", () => {
    const stub =
      "#!/bin/sh\n" + `printf '%s\\n' '${RESULT_LINE("PLAN BODY", null)}'\n`
    const { result } = runWorker("fable", stub)
    expect(result.status).toBe("ok")
    expect(result.served_model).toBe("unverified")
    expect(result.receipt).toBe("unverified")
  })

  // AE4 mechanism (deterministic): the idle window is a *reset-on-growth* window,
  // not a fixed timer — so a run that keeps growing $PEERLOG is never reaped. The
  // positive-timing version of this is an inherently flaky subprocess race (it
  // depends on interpreter startup latency vs the window), so the reset mechanism
  // is asserted here against the worker source; the stall direction is exercised
  // behaviorally by the heartbeat-only test below.
  test("the idle window resets on $PEERLOG growth", () => {
    const src = readFileSync(WORKER, "utf8")
    // size change updates lastchg; reap fires only on (now - lastchg) >= IDLE_SECS
    expect(src).toContain('size="$(wc -c <"$PEERLOG"')
    expect(src).toMatch(/\[ "\$size" != "\$last" \] && \{ last="\$size"; lastchg="\$now"; \}/)
    expect(src).toMatch(/now - lastchg \)\) -ge "\$IDLE_SECS"/)
  })

  // The P0 fix: the worker's own heartbeat must not mask a stalled model. A stub
  // that grows nothing on stdout (→ empty $PEERLOG) is reaped by the worker's
  // $PEERLOG idle window even while the heartbeat keeps firing to script stderr.
  test("a heartbeat-only stall is still reaped by the idle window", () => {
    const stub = "#!/bin/sh\nsleep 30\n"
    // idle window (3s) wider than the heartbeat interval (1s) so the heartbeat
    // fires repeatedly before the idle window reaps — proving it doesn't mask.
    const { result, stderr } = runWorker("fable", stub, {
      CE_ELEVATION_POLL_SECS: "0.2",
      CE_ELEVATION_IDLE_SECS: "3",
      CE_ELEVATION_HARD_SECS: "600",
      CROSS_MODEL_HEARTBEAT_SECS: "1",
    })
    expect(stderr).toContain("peer alive") // heartbeat fired
    expect(stderr).toContain("idle") // reaped by the idle window despite it
    expect(result.status).toBe("failed")
  }, 20000)
})
