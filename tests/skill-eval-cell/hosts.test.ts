import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { attestCurrentHost, cellEnv, peerHosts, planHost, privateCodexHome, resolveRunHosts, wrapPrompt } from "./hosts"

// A fake operator: the real HOME and ~/.codex must never be read or linked by these tests.
const fake = fs.mkdtempSync(path.join(os.tmpdir(), "eval-cell-hosts-"))
const fakeHome = path.join(fake, "home")
const fakeCodex = path.join(fakeHome, ".codex")
const saved = { HOME: process.env.HOME, CODEX_HOME: process.env.CODEX_HOME }
beforeAll(() => {
  fs.mkdirSync(fakeCodex, { recursive: true })
  fs.writeFileSync(path.join(fakeCodex, "auth.json"), "{}")
  fs.writeFileSync(path.join(fakeCodex, "AGENTS.md"), "operator rule")
  process.env.HOME = fakeHome
  process.env.CODEX_HOME = fakeCodex
})
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v)
  fs.rmSync(fake, { recursive: true, force: true })
})

describe("skill-eval-cell host plans pin measured gotchas", () => {
  const cwd = os.tmpdir()
  const promptFile = path.join(cwd, "prompt.md")
  const userConfigDir = path.join(fake, "user-config")

  test("every host unsets CLAUDECODE and forces NO_COLOR", () => {
    const env = cellEnv({ CLAUDECODE: "1", OMPCODE: "1", CLICOLOR_FORCE: "1", GH_FORCE_TTY: "1" })
    expect(env.CLAUDECODE).toBeUndefined()
    expect(env.OMPCODE).toBeUndefined()
    expect(env.CLICOLOR_FORCE).toBeUndefined()
    expect(env.GH_FORCE_TTY).toBeUndefined()
    expect(env.NO_COLOR).toBe("1")
  })

  test("claude uses print mode and skip-permissions", () => {
    const plan = planHost("claude", { cwd, prompt: "task", promptFile, userConfigDir })
    expect(plan.argv).toEqual([
      "claude",
      "-p",
      "task",
      "--dangerously-skip-permissions",
      "--output-format",
      "text",
      "--setting-sources",
      "project,local",
    ])
    expect(plan.stdin).toBe("null")
  })

  test("claude skips the operator's user settings and auto memory", () => {
    const plan = planHost("claude", { cwd, prompt: "task", promptFile, userConfigDir })
    expect(plan.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe("1")
  })

  test("codex runs on a private CODEX_HOME that links, not copies, the operator's login", () => {
    const plan = planHost("codex", { cwd, prompt: "task", promptFile, userConfigDir })
    const home = plan.env.CODEX_HOME!
    expect(home.startsWith(userConfigDir)).toBe(true)
    expect(fs.lstatSync(path.join(home, "auth.json")).isSymbolicLink()).toBe(true)
    expect(fs.readlinkSync(path.join(home, "auth.json"))).toBe(path.join(fakeCodex, "auth.json"))
    expect(fs.existsSync(path.join(home, "AGENTS.md"))).toBe(false)
  })

  test("the private codex home disables each user skill under ~/.agents/skills by path", () => {
    const root = path.join(fake, "skills-case")
    const skill = path.join(root, "home", ".agents", "skills", "mine", "SKILL.md")
    const linkedReal = path.join(root, "elsewhere", "linked", "SKILL.md")
    fs.mkdirSync(path.dirname(skill), { recursive: true })
    fs.mkdirSync(path.dirname(linkedReal), { recursive: true })
    fs.writeFileSync(skill, "---\nname: mine\n---\n")
    fs.writeFileSync(linkedReal, "---\nname: linked\n---\n")
    fs.symlinkSync(path.dirname(linkedReal), path.join(root, "home", ".agents", "skills", "linked"))
    // A skill may bundle a symlink to a file (e.g. a tool's python binary); the walk must not scandir it.
    fs.writeFileSync(path.join(root, "elsewhere", "python3"), "")
    fs.symlinkSync(path.join(root, "elsewhere", "python3"), path.join(path.dirname(skill), "python"))
    const { env } = privateCodexHome(path.join(root, "codex-home"), { HOME: path.join(root, "home"), CODEX_HOME: path.join(root, "none") })
    const config = fs.readFileSync(path.join(env.CODEX_HOME!, "config.toml"), "utf8")
    for (const p of [skill, path.join(root, "home", ".agents", "skills", "linked", "SKILL.md"), fs.realpathSync(linkedReal)]) {
      expect(config).toContain(`[[skills.config]]\npath = ${JSON.stringify(p)}\nenabled = false`)
    }
    expect(fs.existsSync(path.join(env.CODEX_HOME!, "auth.json"))).toBe(false)
  })

  test("codex closes stdin and skips the git-repo check", () => {
    const plan = planHost("codex", { cwd, prompt: "task", promptFile, userConfigDir })
    expect(plan.argv).toContain("exec")
    expect(plan.argv).toContain("--dangerously-bypass-approvals-and-sandbox")
    expect(plan.argv).toContain("--skip-git-repo-check")
    expect(plan.argv).toContain("-C")
    expect(plan.argv).toContain(cwd)
    expect(plan.stdin).toBe("null")
    expect(plan.env.CLAUDECODE).toBeUndefined()
  })

  test("grok uses --prompt-file, not a unused -p write", () => {
    const plan = planHost("grok", { cwd, prompt: "task", promptFile, userConfigDir })
    expect(plan.argv).toContain("--prompt-file")
    expect(plan.argv).toContain(promptFile)
    expect(plan.argv).toContain("--verbatim")
    expect(plan.argv).toContain("--cwd")
    expect(plan.argv).toContain("--disable-web-search")
    expect(plan.argv).not.toContain("-p")
    expect(plan.stdin).toBe("null")
  })

  test("opencode runs a private --standalone server and omits --auto when read-only", () => {
    const plan = planHost("opencode", { cwd, prompt: "task", promptFile, userConfigDir })
    expect(plan.argv).toEqual(["opencode", "run", "--standalone", "task", "--auto"])
    const readOnly = planHost("opencode", { cwd, prompt: "task", promptFile, userConfigDir, readOnly: true })
    expect(readOnly.argv).toEqual(["opencode", "run", "--standalone", "task"])
    expect(readOnly.argv).not.toContain("--auto")
    expect(attestCurrentHost({ OPENCODE_TERMINAL: "1" })).toBe("opencode")
  })

  test("under omp the copied CLAUDECODE does not drop claude from the default peers", () => {
    const env = { OMPCODE: "1", CLAUDECODE: "1" }
    expect(attestCurrentHost(env)).toBe("unknown")
    expect(resolveRunHosts({ env, onPath: () => true }).run).toContain("claude")
  })

  test("from grok the default peers are claude, codex, and opencode", () => {
    expect(attestCurrentHost({ GROK_AGENT: "1" })).toBe("grok")
    expect(peerHosts("grok")).toEqual(["claude", "codex", "opencode"])
    const resolved = resolveRunHosts({
      env: { GROK_AGENT: "1" },
      onPath: (host) => host === "claude" || host === "codex" || host === "opencode",
    })
    expect(resolved.run).toEqual(["claude", "codex", "opencode"])
    expect(resolved.ownEvalOnly).toBe(false)
    expect(resolved.warnings).toEqual([])
  })

  test("missing peer CLIs warn and continue; self-only is own-eval", () => {
    const limited = resolveRunHosts({
      env: { GROK_AGENT: "1" },
      onPath: (host) => host === "claude",
    })
    expect(limited.run).toEqual(["claude"])
    expect(limited.warnings.some((line) => line.startsWith("warning: skipping codex"))).toBe(true)
    expect(limited.warnings.some((line) => line.includes("limited multi-harness"))).toBe(true)

    const own = resolveRunHosts({
      env: { GROK_AGENT: "1" },
      onPath: (host) => host === "grok",
    })
    expect(own.run).toEqual(["grok"])
    expect(own.ownEvalOnly).toBe(true)
    expect(own.warnings.some((line) => line.includes("own-eval only"))).toBe(true)
  })

  test("an explicit --hosts that is unavailable does not fall back to self", () => {
    const explicit = resolveRunHosts({
      explicit: ["claude"],
      env: { CODEX_SESSION_ID: "x" },
      onPath: (host) => host === "codex",
    })
    expect(explicit.run).toEqual([])
    expect(explicit.ownEvalOnly).toBe(false)
  })

  test("read-only maps to each host's measured flags", () => {
    const claude = planHost("claude", { cwd, prompt: "task", promptFile, userConfigDir, readOnly: true })
    expect(claude.argv).toContain("--allowedTools")
    expect(claude.argv).toContain("Read,Glob,Grep")
    const codex = planHost("codex", { cwd, prompt: "task", promptFile, userConfigDir, readOnly: true })
    expect(codex.argv).toContain("--sandbox")
    expect(codex.argv).toContain("read-only")
    expect(codex.argv).not.toContain("--dangerously-bypass-approvals-and-sandbox")
    const grok = planHost("grok", { cwd, prompt: "task", promptFile, userConfigDir, readOnly: true })
    expect(grok.argv).toContain("--deny")
    expect(grok.argv).toContain("Bash")
  })

  test("claude read-only also denies the tools skip-permissions leaves callable", () => {
    const plan = planHost("claude", { cwd, prompt: "task", promptFile, userConfigDir, readOnly: true })
    const deny = plan.argv[plan.argv.indexOf("--disallowedTools") + 1]?.split(",") ?? []
    for (const tool of ["Bash", "Edit", "Write", "NotebookEdit", "Task", "Skill", "WebFetch", "WebSearch"]) {
      expect(deny).toContain(tool)
    }
  })

  test("wrapPrompt does not tell the model it is an eval", () => {
    const prompt = wrapPrompt({
      skillDir: "/tmp/skill",
      workspace: "/tmp/ws",
      task: "Babysit PR #12.",
    })
    expect(prompt.toLowerCase()).not.toContain("eval")
    expect(prompt).toContain("Babysit PR #12.")
    expect(prompt).toContain("FILES_READ:")
    expect(prompt).toContain("~/.config/opencode")
    expect(prompt).toContain("project .opencode")
  })

  test("each host takes an explicit reasoning effort instead of the operator default", () => {
    const base = { cwd: "/tmp/ws", prompt: "p", promptFile: "/tmp/p.md", userConfigDir }
    const pair = (argv: string[], flag: string) => argv.slice(argv.indexOf(flag), argv.indexOf(flag) + 2)
    expect(planHost("grok", base).argv).not.toContain("--reasoning-effort")
    expect(pair(planHost("grok", { ...base, reasoningEffort: "high" }).argv, "--reasoning-effort")).toEqual(["--reasoning-effort", "high"])
    expect(planHost("claude", base).argv).not.toContain("--effort")
    expect(pair(planHost("claude", { ...base, reasoningEffort: "xhigh" }).argv, "--effort")).toEqual(["--effort", "xhigh"])
    expect(planHost("codex", base).argv).not.toContain("-c")
    const codex = planHost("codex", { ...base, reasoningEffort: "xhigh" }).argv
    expect(pair(codex, "-c")).toEqual(["-c", "model_reasoning_effort=xhigh"])
    expect(codex.at(-1)).toBe("p")
  })

  test("wrapPrompt points each companion skill at its bundled copy", () => {
    const prompt = wrapPrompt({
      skillDir: "/tmp/skill",
      workspace: "/tmp/ws",
      task: "Plan it.",
      companions: [{ name: "ce-doc-review", dir: "/tmp/skills/ce-doc-review" }],
    })
    expect(prompt).toContain("/tmp/skills/ce-doc-review/SKILL.md")
    expect(prompt).toContain("Do not use an installed plugin copy of `ce-doc-review`")
    expect(prompt.toLowerCase()).not.toContain("eval")
  })
})
