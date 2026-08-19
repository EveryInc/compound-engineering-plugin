import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { attestCurrentHost, cellEnv, peerHosts, planHost, resolveRunHosts, wrapPrompt } from "./hosts"

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

  test("from grok the default peers are claude and codex", () => {
    expect(attestCurrentHost({ GROK_AGENT: "1" })).toBe("grok")
    expect(peerHosts("grok")).toEqual(["claude", "codex"])
    const resolved = resolveRunHosts({
      env: { GROK_AGENT: "1" },
      onPath: (host) => host === "claude" || host === "codex",
    })
    expect(resolved.run).toEqual(["claude", "codex"])
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

  test("read-only maps to each host's measured flags", () => {
    const claude = planHost("claude", { cwd, prompt: "task", promptFile, readOnly: true })
    expect(claude.argv).toContain("--allowedTools")
    expect(claude.argv).toContain("Read,Glob,Grep")
    const codex = planHost("codex", { cwd, prompt: "task", promptFile, readOnly: true })
    expect(codex.argv).toContain("--sandbox")
    expect(codex.argv).toContain("read-only")
    const grok = planHost("grok", { cwd, prompt: "task", promptFile, readOnly: true })
    expect(grok.argv).toContain("--deny")
    expect(grok.argv).toContain("Bash")
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
  })
})
