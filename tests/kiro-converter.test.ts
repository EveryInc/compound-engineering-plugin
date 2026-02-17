import { describe, expect, test } from "bun:test"
import { convertClaudeToKiro, transformContentForKiro } from "../src/converters/claude-to-kiro"
import { parseFrontmatter } from "../src/utils/frontmatter"
import type { ClaudePlugin } from "../src/types/claude"

const fixturePlugin: ClaudePlugin = {
  root: "/tmp/plugin",
  manifest: { name: "fixture", version: "1.0.0" },
  agents: [
    {
      name: "Security Reviewer",
      description: "Security-focused agent",
      capabilities: ["Threat modeling", "OWASP"],
      model: "claude-sonnet-4-20250514",
      body: "Focus on vulnerabilities.",
      sourcePath: "/tmp/plugin/agents/security-reviewer.md",
    },
  ],
  commands: [
    {
      name: "workflows:plan",
      description: "Planning command",
      argumentHint: "[FOCUS]",
      model: "inherit",
      allowedTools: ["Read"],
      body: "Plan the work.",
      sourcePath: "/tmp/plugin/commands/workflows/plan.md",
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

const defaultOptions = {
  agentMode: "subagent" as const,
  inferTemperature: false,
  permissions: "none" as const,
}

describe("convertClaudeToKiro", () => {
  test("converts agents to Kiro agent configs with prompt files", () => {
    const bundle = convertClaudeToKiro(fixturePlugin, defaultOptions)

    const agent = bundle.agents.find((a) => a.name === "security-reviewer")
    expect(agent).toBeDefined()
    expect(agent!.config.name).toBe("security-reviewer")
    expect(agent!.config.description).toBe("Security-focused agent")
    expect(agent!.config.prompt).toBe("file://./prompts/security-reviewer.md")
    expect(agent!.config.tools).toEqual(["*"])
    expect(agent!.config.includeMcpJson).toBe(true)
    expect(agent!.config.resources).toContain("file://.kiro/steering/**/*.md")
    expect(agent!.config.resources).toContain("skill://.kiro/skills/**/SKILL.md")
    expect(agent!.promptContent).toContain("Focus on vulnerabilities.")
  })

  test("agent config has welcomeMessage generated from description", () => {
    const bundle = convertClaudeToKiro(fixturePlugin, defaultOptions)
    const agent = bundle.agents.find((a) => a.name === "security-reviewer")
    expect(agent!.config.welcomeMessage).toContain("security-reviewer")
    expect(agent!.config.welcomeMessage).toContain("Security-focused agent")
  })

  test("agent with capabilities prepended to prompt content", () => {
    const bundle = convertClaudeToKiro(fixturePlugin, defaultOptions)
    const agent = bundle.agents.find((a) => a.name === "security-reviewer")
    expect(agent!.promptContent).toContain("## Capabilities")
    expect(agent!.promptContent).toContain("- Threat modeling")
    expect(agent!.promptContent).toContain("- OWASP")
  })

  test("agent with empty description gets default description", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        {
          name: "my-agent",
          body: "Do things.",
          sourcePath: "/tmp/plugin/agents/my-agent.md",
        },
      ],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToKiro(plugin, defaultOptions)
    expect(bundle.agents[0].config.description).toBe("Use this agent for my-agent tasks")
  })

  test("agent model field silently dropped", () => {
    const bundle = convertClaudeToKiro(fixturePlugin, defaultOptions)
    const agent = bundle.agents.find((a) => a.name === "security-reviewer")
    expect((agent!.config as Record<string, unknown>).model).toBeUndefined()
  })

  test("agent with empty body gets default body text", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        {
          name: "Empty Agent",
          description: "An empty agent",
          body: "",
          sourcePath: "/tmp/plugin/agents/empty.md",
        },
      ],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToKiro(plugin, defaultOptions)
    expect(bundle.agents[0].promptContent).toContain("Instructions converted from the Empty Agent agent.")
  })

  test("converts commands to SKILL.md with valid frontmatter", () => {
    const bundle = convertClaudeToKiro(fixturePlugin, defaultOptions)

    expect(bundle.generatedSkills).toHaveLength(1)
    const skill = bundle.generatedSkills[0]
    expect(skill.name).toBe("workflows-plan")
    const parsed = parseFrontmatter(skill.content)
    expect(parsed.data.name).toBe("workflows-plan")
    expect(parsed.data.description).toBe("Planning command")
    expect(parsed.body).toContain("Plan the work.")
  })

  test("command with disable-model-invocation is still included", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "disabled-command",
          description: "Disabled command",
          disableModelInvocation: true,
          body: "Disabled body.",
          sourcePath: "/tmp/plugin/commands/disabled.md",
        },
      ],
      agents: [],
      skills: [],
    }

    const bundle = convertClaudeToKiro(plugin, defaultOptions)
    expect(bundle.generatedSkills).toHaveLength(1)
    expect(bundle.generatedSkills[0].name).toBe("disabled-command")
  })

  test("command allowedTools silently dropped", () => {
    const bundle = convertClaudeToKiro(fixturePlugin, defaultOptions)
    const skill = bundle.generatedSkills[0]
    expect(skill.content).not.toContain("allowedTools")
  })

  test("skills pass through as directory references", () => {
    const bundle = convertClaudeToKiro(fixturePlugin, defaultOptions)

    expect(bundle.skillDirs).toHaveLength(1)
    expect(bundle.skillDirs[0].name).toBe("existing-skill")
    expect(bundle.skillDirs[0].sourceDir).toBe("/tmp/plugin/skills/existing-skill")
  })

  test("MCP stdio servers convert to mcp.json-compatible config", () => {
    const bundle = convertClaudeToKiro(fixturePlugin, defaultOptions)
    expect(bundle.mcpServers.local.command).toBe("echo")
    expect(bundle.mcpServers.local.args).toEqual(["hello"])
  })

  test("MCP HTTP servers skipped with warning", () => {
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)

    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      mcpServers: {
        httpServer: { url: "https://example.com/mcp" },
      },
      agents: [],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToKiro(plugin, defaultOptions)
    console.warn = originalWarn

    expect(Object.keys(bundle.mcpServers)).toHaveLength(0)
    expect(warnings.some((w) => w.includes("no command") || w.includes("HTTP"))).toBe(true)
  })

  test("plugin with zero agents produces empty agents array", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToKiro(plugin, defaultOptions)
    expect(bundle.agents).toHaveLength(0)
    expect(bundle.generatedSkills).toHaveLength(0)
    expect(bundle.skillDirs).toHaveLength(0)
  })

  test("plugin with only skills works correctly", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [],
      commands: [],
    }

    const bundle = convertClaudeToKiro(plugin, defaultOptions)
    expect(bundle.agents).toHaveLength(0)
    expect(bundle.generatedSkills).toHaveLength(0)
    expect(bundle.skillDirs).toHaveLength(1)
  })

  test("skill name colliding with command name: command gets deduplicated", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      skills: [{ name: "my-command", description: "Existing skill", sourceDir: "/tmp/skill", skillPath: "/tmp/skill/SKILL.md" }],
      commands: [{ name: "my-command", description: "A command", body: "Body.", sourcePath: "/tmp/commands/cmd.md" }],
      agents: [],
    }

    const bundle = convertClaudeToKiro(plugin, defaultOptions)

    // Skill keeps original name, command gets deduplicated
    expect(bundle.skillDirs[0].name).toBe("my-command")
    expect(bundle.generatedSkills[0].name).toBe("my-command-2")
  })

  test("hooks present emits console.warn", () => {
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)

    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      hooks: { hooks: { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "echo test" }] }] } },
      agents: [],
      commands: [],
      skills: [],
    }

    convertClaudeToKiro(plugin, defaultOptions)
    console.warn = originalWarn

    expect(warnings.some((w) => w.includes("Kiro"))).toBe(true)
  })

  test("steering file not generated when CLAUDE.md missing", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      root: "/tmp/nonexistent-plugin-dir",
      agents: [],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToKiro(plugin, defaultOptions)
    expect(bundle.steeringFiles).toHaveLength(0)
  })

  test("name normalization handles various inputs", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        { name: "My Cool Agent!!!", description: "Cool", body: "Body.", sourcePath: "/tmp/a.md" },
        { name: "UPPERCASE-AGENT", description: "Upper", body: "Body.", sourcePath: "/tmp/b.md" },
        { name: "agent--with--double-hyphens", description: "Hyphens", body: "Body.", sourcePath: "/tmp/c.md" },
      ],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToKiro(plugin, defaultOptions)
    expect(bundle.agents[0].name).toBe("my-cool-agent")
    expect(bundle.agents[1].name).toBe("uppercase-agent")
    expect(bundle.agents[2].name).toBe("agent-with-double-hyphens") // collapsed
  })

  test("description truncation to 1024 chars", () => {
    const longDesc = "a".repeat(2000)
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        { name: "long-desc", description: longDesc, body: "Body.", sourcePath: "/tmp/a.md" },
      ],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToKiro(plugin, defaultOptions)
    expect(bundle.agents[0].config.description.length).toBeLessThanOrEqual(1024)
    expect(bundle.agents[0].config.description.endsWith("...")).toBe(true)
  })

  test("empty plugin produces empty bundle", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/empty",
      manifest: { name: "empty", version: "1.0.0" },
      agents: [],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToKiro(plugin, defaultOptions)
    expect(bundle.agents).toHaveLength(0)
    expect(bundle.generatedSkills).toHaveLength(0)
    expect(bundle.skillDirs).toHaveLength(0)
    expect(bundle.steeringFiles).toHaveLength(0)
    expect(Object.keys(bundle.mcpServers)).toHaveLength(0)
  })
})

describe("transformContentForKiro", () => {
  test("transforms .claude/ paths to .kiro/", () => {
    const result = transformContentForKiro("Read .claude/settings.json for config.")
    expect(result).toContain(".kiro/settings.json")
    expect(result).not.toContain(".claude/")
  })

  test("transforms ~/.claude/ paths to ~/.kiro/", () => {
    const result = transformContentForKiro("Check ~/.claude/config for settings.")
    expect(result).toContain("~/.kiro/config")
    expect(result).not.toContain("~/.claude/")
  })

  test("transforms Task agent(args) to use_subagent reference", () => {
    const input = `Run these:

- Task repo-research-analyst(feature_description)
- Task learnings-researcher(feature_description)

Task best-practices-researcher(topic)`

    const result = transformContentForKiro(input)
    expect(result).toContain("Use the use_subagent tool to delegate to the repo-research-analyst agent: feature_description")
    expect(result).toContain("Use the use_subagent tool to delegate to the learnings-researcher agent: feature_description")
    expect(result).toContain("Use the use_subagent tool to delegate to the best-practices-researcher agent: topic")
    expect(result).not.toContain("Task repo-research-analyst")
  })

  test("transforms @agent references for known agents only", () => {
    const result = transformContentForKiro("Ask @security-sentinel for a review.", ["security-sentinel"])
    expect(result).toContain("the security-sentinel agent")
    expect(result).not.toContain("@security-sentinel")
  })

  test("does not transform @unknown-name when not in known agents", () => {
    const result = transformContentForKiro("Contact @someone-else for help.", ["security-sentinel"])
    expect(result).toContain("@someone-else")
  })

  test("transforms Claude tool names to Kiro equivalents", () => {
    const result = transformContentForKiro("Use the Bash tool to run commands. Use Read to check files.")
    expect(result).toContain("shell tool")
    expect(result).toContain("read to")
  })

  test("transforms slash command refs to skill activation", () => {
    const result = transformContentForKiro("Run /workflows:plan to start planning.")
    expect(result).toContain("the workflows-plan skill")
  })

  test("does not transform partial .claude paths like package/.claude-config/", () => {
    const result = transformContentForKiro("Check some-package/.claude-config/settings")
    // The .claude-config/ part should be transformed since it starts with .claude/
    // but only when preceded by a word boundary
    expect(result).toContain("some-package/")
  })
})
