import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { attestCurrentHost, cellEnv, hostBinary, peerHosts, planHost, resolveRunHosts, wrapPrompt } from "./hosts"

describe("skill-eval-cell host plans pin measured gotchas", () => {
  const cwd = os.tmpdir()
  const promptFile = path.join(cwd, "prompt.md")

  test("every host unsets CLAUDECODE and forces NO_COLOR", () => {
    const env = cellEnv({ CLAUDECODE: "1", CLICOLOR_FORCE: "1", GH_FORCE_TTY: "1" })
    expect(env.CLAUDECODE).toBeUndefined()
    expect(env.CLICOLOR_FORCE).toBeUndefined()
    expect(env.GH_FORCE_TTY).toBeUndefined()
    expect(env.NO_COLOR).toBe("1")
  })

  test("claude uses print mode and skip-permissions", () => {
    const plan = planHost("claude", { cwd, prompt: "task", promptFile })
    expect(plan.argv).toEqual([
      "claude",
      "-p",
      "task",
      "--dangerously-skip-permissions",
      "--output-format",
      "text",
    ])
    expect(plan.stdin).toBe("null")
  })

  test("codex closes stdin and skips the git-repo check", () => {
    const plan = planHost("codex", { cwd, prompt: "task", promptFile })
    expect(plan.argv).toContain("exec")
    expect(plan.argv).toContain("--dangerously-bypass-approvals-and-sandbox")
    expect(plan.argv).toContain("--skip-git-repo-check")
    expect(plan.argv).toContain("-C")
    expect(plan.argv).toContain(cwd)
    expect(plan.stdin).toBe("null")
    expect(plan.env.CLAUDECODE).toBeUndefined()
  })

  test("grok uses --prompt-file, not a unused -p write", () => {
    const plan = planHost("grok", { cwd, prompt: "task", promptFile })
    expect(plan.argv).toContain("--prompt-file")
    expect(plan.argv).toContain(promptFile)
    expect(plan.argv).toContain("--verbatim")
    expect(plan.argv).toContain("--cwd")
    expect(plan.argv).toContain("--disable-web-search")
    expect(plan.argv).not.toContain("-p")
    expect(plan.stdin).toBe("null")
  })

  test("opencode uses run --dir and omits --auto when read-only", () => {
    const plan = planHost("opencode", { cwd, prompt: "task", promptFile })
    expect(plan.argv).toEqual(["opencode", "run", "--dir", cwd, "task", "--auto"])
    const readOnly = planHost("opencode", { cwd, prompt: "task", promptFile, readOnly: true })
    expect(readOnly.argv).toEqual(["opencode", "run", "--dir", cwd, "task"])
    expect(readOnly.argv).not.toContain("--auto")
    expect(attestCurrentHost({ OPENCODE_TERMINAL: "1" })).toBe("opencode")
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

  test("cursor runs cursor-agent headless in a trusted, sandboxed workspace", () => {
    const plan = planHost("cursor", { cwd, prompt: "task", promptFile })
    expect(plan.argv).toEqual([
      "cursor-agent",
      "-p",
      "--output-format",
      "text",
      "--trust",
      "--sandbox",
      "enabled",
      "--workspace",
      cwd,
      "--force",
      "task",
    ])
    expect(plan.stdin).toBe("null")
    const readOnly = planHost("cursor", { cwd, prompt: "task", promptFile, readOnly: true })
    expect(readOnly.argv.slice(readOnly.argv.indexOf("--mode"), readOnly.argv.indexOf("--mode") + 2)).toEqual(["--mode", "ask"])
    expect(readOnly.argv).not.toContain("--force")
    expect(readOnly.argv.at(-1)).toBe("task")
  })

  test("cursor is attested from its markers, and a cell does not inherit them", () => {
    expect(attestCurrentHost({ CURSOR_AGENT: "1" })).toBe("cursor")
    expect(attestCurrentHost({ CURSOR_CONVERSATION_ID: "c" })).toBe("cursor")
    const env = cellEnv({ CURSOR_AGENT: "1", CURSOR_CONVERSATION_ID: "c" })
    expect(env.CURSOR_AGENT).toBeUndefined()
    expect(env.CURSOR_CONVERSATION_ID).toBeUndefined()
  })

  test("cursor is an explicit host, never a default peer, and resolves by its own binary", () => {
    expect(peerHosts("claude")).toEqual(["codex", "grok", "opencode"])
    expect(peerHosts("unknown")).not.toContain("cursor")
    expect(peerHosts("cursor")).toEqual(["claude", "codex", "grok", "opencode"])
    expect(hostBinary("cursor")).toBe("cursor-agent")
    expect(hostBinary("claude")).toBe("claude")
    const explicit = resolveRunHosts({
      explicit: ["claude", "cursor"],
      env: { CLAUDECODE: "1" },
      onPath: () => true,
    })
    expect(explicit.run).toEqual(["claude", "cursor"])
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
    const claude = planHost("claude", { cwd, prompt: "task", promptFile, readOnly: true })
    expect(claude.argv).toContain("--allowedTools")
    expect(claude.argv).toContain("Read,Glob,Grep")
    const codex = planHost("codex", { cwd, prompt: "task", promptFile, readOnly: true })
    expect(codex.argv).toContain("--sandbox")
    expect(codex.argv).toContain("read-only")
    expect(codex.argv).not.toContain("--dangerously-bypass-approvals-and-sandbox")
    const grok = planHost("grok", { cwd, prompt: "task", promptFile, readOnly: true })
    expect(grok.argv).toContain("--deny")
    expect(grok.argv).toContain("Bash")
  })

  test("claude read-only also denies the tools skip-permissions leaves callable", () => {
    const plan = planHost("claude", { cwd, prompt: "task", promptFile, readOnly: true })
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

  test("grok takes an explicit reasoning effort instead of the operator default", () => {
    const base = { cwd: "/tmp/ws", prompt: "p", promptFile: "/tmp/p.md" }
    expect(planHost("grok", base).argv).not.toContain("--reasoning-effort")
    const argv = planHost("grok", { ...base, reasoningEffort: "high" }).argv
    expect(argv.slice(argv.indexOf("--reasoning-effort"), argv.indexOf("--reasoning-effort") + 2)).toEqual(["--reasoning-effort", "high"])
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
