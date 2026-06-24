import { describe, expect, spyOn, test } from "bun:test"
import { convertClaudeToKimi } from "../src/converters/claude-to-kimi"
import { parseFrontmatter } from "../src/utils/frontmatter"
import type { ClaudeHooks, ClaudePlugin } from "../src/types/claude"

const fixturePlugin: ClaudePlugin = {
  root: "/tmp/plugin",
  manifest: { name: "fixture", version: "1.0.0" },
  agents: [
    {
      name: "ce-security-reviewer",
      description: "Security-focused agent",
      capabilities: ["Threat modeling", "OWASP"],
      body: "Focus on vulnerabilities. Use the `.claude/` rules.",
      sourcePath: "/tmp/plugin/agents/review/ce-security-reviewer.md",
    },
  ],
  commands: [
    {
      name: "workflows:plan",
      description: "Planning command",
      argumentHint: "[FOCUS]",
      allowedTools: ["Read"],
      body: "Plan the work. Then run /workflows:plan again.",
      sourcePath: "/tmp/plugin/commands/workflows/plan.md",
    },
    {
      name: "hidden",
      description: "Should be skipped",
      disableModelInvocation: true,
      body: "Hidden body.",
      sourcePath: "/tmp/plugin/commands/hidden.md",
    },
  ],
  skills: [
    {
      name: "existing-skill",
      description: "Existing skill",
      sourceDir: "/tmp/plugin/skills/existing-skill",
      skillPath: "/tmp/plugin/skills/existing-skill/SKILL.md",
    },
  ],
  hooks: undefined,
  mcpServers: {
    local: { command: "echo", args: ["hello"] },
  },
}

const options = { agentMode: "subagent" as const, inferTemperature: false, permissions: "none" as const }

describe("convertClaudeToKimi", () => {
  test("passes through skills and carries MCP + plugin name", () => {
    const bundle = convertClaudeToKimi(fixturePlugin, options)

    expect(bundle.pluginName).toBe("fixture")
    expect(bundle.skillDirs).toEqual([
      { name: "existing-skill", sourceDir: "/tmp/plugin/skills/existing-skill" },
    ])
    expect(bundle.mcpServers).toEqual({ local: { command: "echo", args: ["hello"] } })
  })

  test("converts invocable commands to skills and skips model-disabled ones", () => {
    const bundle = convertClaudeToKimi(fixturePlugin, options)
    const names = bundle.generatedSkills.map((s) => s.name)

    // workflows:plan -> workflows-plan command skill, plus the agent skill.
    expect(names).toContain("workflows-plan")
    expect(names).not.toContain("hidden")
  })

  test("converts agents to skills with capabilities section", () => {
    const bundle = convertClaudeToKimi(fixturePlugin, options)
    const agentSkill = bundle.generatedSkills.find((s) => s.name === "ce-security-reviewer")
    expect(agentSkill).toBeDefined()

    const { data, body } = parseFrontmatter(agentSkill!.content)
    expect(data.name).toBe("ce-security-reviewer")
    expect(data.description).toBe("Security-focused agent")
    expect(body).toContain("## Capabilities")
    expect(body).toContain("- Threat modeling")
    // .claude/ paths are rewritten to .kimi-code/
    expect(body).toContain(".kimi-code/")
    expect(body).not.toContain(".claude/")
  })

  test("rewrites slash command references to /skill:<name>", () => {
    const bundle = convertClaudeToKimi(fixturePlugin, options)
    const cmdSkill = bundle.generatedSkills.find((s) => s.name === "workflows-plan")
    expect(cmdSkill!.content).toContain("/skill:workflows-plan")
  })

  test("builds invocation targets covering skills, commands, and agents", () => {
    const bundle = convertClaudeToKimi(fixturePlugin, options)
    expect(bundle.invocationTargets?.skillTargets["existing-skill"]).toBe("existing-skill")
    expect(bundle.invocationTargets?.skillTargets["workflows-plan"]).toBe("workflows-plan")
    // agent aliases include the bare (ce-stripped) and category-qualified forms
    expect(bundle.invocationTargets?.agentTargets?.["ce-security-reviewer"]).toBe("ce-security-reviewer")
    expect(bundle.invocationTargets?.agentTargets?.["security-reviewer"]).toBe("ce-security-reviewer")
  })

  test("warns about unsupported hook events and prompt/agent hooks", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    try {
      const hooks: ClaudeHooks = {
        hooks: {
          // Unsupported event -> warned. (Use a synthetic name: Kimi Code CLI
          // supports every real Claude hook event, including PermissionRequest.)
          MadeUpEvent: [{ matcher: "Bash", hooks: [{ type: "command", command: "x" }] }],
          // Supported event but prompt/agent entries -> warned, not converted.
          PostToolUse: [
            { matcher: "Write", hooks: [{ type: "prompt", prompt: "p" }, { type: "agent", agent: "a" }] },
          ],
        },
      }
      convertClaudeToKimi({ ...fixturePlugin, hooks }, options)
      expect(warn).toHaveBeenCalled()
      const message = warn.mock.calls.map((c) => String(c[0])).join("\n")
      expect(message).toContain("MadeUpEvent")
      expect(message).toContain("shell commands only")
    } finally {
      warn.mockRestore()
    }
  })

  test("does not warn when there are no hooks", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    try {
      convertClaudeToKimi(fixturePlugin, options)
      const hookWarning = warn.mock.calls
        .map((c) => String(c[0]))
        .find((m) => m.includes("Kimi hook conversion"))
      expect(hookWarning).toBeUndefined()
    } finally {
      warn.mockRestore()
    }
  })

  test("respects ce_platforms filtering", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      skills: [
        { name: "kimi-only", sourceDir: "/tmp/a", skillPath: "/tmp/a/SKILL.md", ce_platforms: ["kimi"] },
        { name: "codex-only", sourceDir: "/tmp/b", skillPath: "/tmp/b/SKILL.md", ce_platforms: ["codex"] },
      ],
    }
    const bundle = convertClaudeToKimi(plugin, options)
    const names = bundle.skillDirs.map((s) => s.name)
    expect(names).toContain("kimi-only")
    expect(names).not.toContain("codex-only")
  })
})
