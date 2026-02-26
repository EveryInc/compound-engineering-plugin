import { describe, expect, test } from "bun:test"
import { convertClaudeToWindsurf, transformContentForWindsurf, normalizeName } from "../src/converters/claude-to-windsurf"
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

describe("convertClaudeToWindsurf", () => {
  test("converts agents to skills with correct name and description in SKILL.md", () => {
    const bundle = convertClaudeToWindsurf(fixturePlugin, defaultOptions)

    const skill = bundle.agentSkills.find((s) => s.name === "security-reviewer")
    expect(skill).toBeDefined()
    expect(skill!.content).toContain("name: security-reviewer")
    expect(skill!.content).toContain("description: Security-focused agent")
    expect(skill!.content).toContain("Focus on vulnerabilities.")
  })

  test("agent capabilities included in skill content", () => {
    const bundle = convertClaudeToWindsurf(fixturePlugin, defaultOptions)
    const skill = bundle.agentSkills.find((s) => s.name === "security-reviewer")
    expect(skill!.content).toContain("## Capabilities")
    expect(skill!.content).toContain("- Threat modeling")
    expect(skill!.content).toContain("- OWASP")
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

    const bundle = convertClaudeToWindsurf(plugin, defaultOptions)
    expect(bundle.agentSkills[0].content).toContain("description: Converted from Claude agent my-agent")
  })

  test("agent model field silently dropped", () => {
    const bundle = convertClaudeToWindsurf(fixturePlugin, defaultOptions)
    const skill = bundle.agentSkills.find((s) => s.name === "security-reviewer")
    expect(skill!.content).not.toContain("model:")
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

    const bundle = convertClaudeToWindsurf(plugin, defaultOptions)
    expect(bundle.agentSkills[0].content).toContain("Instructions converted from the Empty Agent agent.")
  })

  test("converts commands to workflows with description", () => {
    const bundle = convertClaudeToWindsurf(fixturePlugin, defaultOptions)

    expect(bundle.commandWorkflows).toHaveLength(1)
    const workflow = bundle.commandWorkflows[0]
    expect(workflow.name).toBe("workflows-plan")
    expect(workflow.description).toBe("Planning command")
    expect(workflow.body).toContain("Plan the work.")
  })

  test("command argumentHint preserved as note in body", () => {
    const bundle = convertClaudeToWindsurf(fixturePlugin, defaultOptions)
    const workflow = bundle.commandWorkflows[0]
    expect(workflow.body).toContain("> Arguments: [FOCUS]")
  })

  test("command with no description gets fallback", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "my-command",
          body: "Do things.",
          sourcePath: "/tmp/plugin/commands/my-command.md",
        },
      ],
      agents: [],
      skills: [],
    }

    const bundle = convertClaudeToWindsurf(plugin, defaultOptions)
    expect(bundle.commandWorkflows[0].description).toBe("Converted from Claude command my-command")
  })

  test("command with disableModelInvocation is still included", () => {
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

    const bundle = convertClaudeToWindsurf(plugin, defaultOptions)
    expect(bundle.commandWorkflows).toHaveLength(1)
    expect(bundle.commandWorkflows[0].name).toBe("disabled-command")
  })

  test("command allowedTools silently dropped", () => {
    const bundle = convertClaudeToWindsurf(fixturePlugin, defaultOptions)
    const workflow = bundle.commandWorkflows[0]
    expect(workflow.body).not.toContain("allowedTools")
  })

  test("skills pass through as directory references", () => {
    const bundle = convertClaudeToWindsurf(fixturePlugin, defaultOptions)

    expect(bundle.skillDirs).toHaveLength(1)
    expect(bundle.skillDirs[0].name).toBe("existing-skill")
    expect(bundle.skillDirs[0].sourceDir).toBe("/tmp/plugin/skills/existing-skill")
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

    const bundle = convertClaudeToWindsurf(plugin, defaultOptions)
    expect(bundle.agentSkills[0].name).toBe("my-cool-agent")
    expect(bundle.agentSkills[1].name).toBe("uppercase-agent")
    expect(bundle.agentSkills[2].name).toBe("agent-with-double-hyphens")
  })

  test("name deduplication within agent skills", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        { name: "reviewer", description: "First", body: "Body.", sourcePath: "/tmp/a.md" },
        { name: "Reviewer", description: "Second", body: "Body.", sourcePath: "/tmp/b.md" },
      ],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToWindsurf(plugin, defaultOptions)
    expect(bundle.agentSkills[0].name).toBe("reviewer")
    expect(bundle.agentSkills[1].name).toBe("reviewer-2")
  })

  test("agent skill name deduplicates against pass-through skill names", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        { name: "existing-skill", description: "Agent with same name as skill", body: "Body.", sourcePath: "/tmp/a.md" },
      ],
      commands: [],
      skills: [
        {
          name: "existing-skill",
          description: "Pass-through skill",
          sourceDir: "/tmp/plugin/skills/existing-skill",
          skillPath: "/tmp/plugin/skills/existing-skill/SKILL.md",
        },
      ],
    }

    const bundle = convertClaudeToWindsurf(plugin, defaultOptions)
    expect(bundle.agentSkills[0].name).toBe("existing-skill-2")
  })

  test("agent skill and command with same normalized name are NOT deduplicated (separate sets)", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        { name: "review", description: "Agent", body: "Body.", sourcePath: "/tmp/a.md" },
      ],
      commands: [
        { name: "review", description: "Command", body: "Body.", sourcePath: "/tmp/b.md" },
      ],
      skills: [],
    }

    const bundle = convertClaudeToWindsurf(plugin, defaultOptions)
    expect(bundle.agentSkills[0].name).toBe("review")
    expect(bundle.commandWorkflows[0].name).toBe("review")
  })

  test("large agent skill does not emit 12K character limit warning (skills have no limit)", () => {
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)

    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        {
          name: "large-agent",
          description: "Large agent",
          body: "x".repeat(12_000),
          sourcePath: "/tmp/a.md",
        },
      ],
      commands: [],
      skills: [],
    }

    convertClaudeToWindsurf(plugin, defaultOptions)
    console.warn = originalWarn

    expect(warnings.some((w) => w.includes("12000") || w.includes("limit"))).toBe(false)
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

    convertClaudeToWindsurf(plugin, defaultOptions)
    console.warn = originalWarn

    expect(warnings.some((w) => w.includes("Windsurf"))).toBe(true)
  })

  test("empty plugin produces empty bundle with null mcpConfig", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/empty",
      manifest: { name: "empty", version: "1.0.0" },
      agents: [],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToWindsurf(plugin, defaultOptions)
    expect(bundle.agentSkills).toHaveLength(0)
    expect(bundle.commandWorkflows).toHaveLength(0)
    expect(bundle.skillDirs).toHaveLength(0)
    expect(bundle.mcpConfig).toBeNull()
  })

  // MCP config tests

  test("stdio server produces correct mcpConfig JSON structure", () => {
    const bundle = convertClaudeToWindsurf(fixturePlugin, defaultOptions)
    expect(bundle.mcpConfig).not.toBeNull()
    expect(bundle.mcpConfig!.mcpServers.local).toEqual({
      command: "echo",
      args: ["hello"],
    })
  })

  test("stdio server with env vars includes actual values (not redacted)", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      mcpServers: {
        myserver: {
          command: "serve",
          env: {
            API_KEY: "secret123",
            PORT: "3000",
          },
        },
      },
      agents: [],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToWindsurf(plugin, defaultOptions)
    expect(bundle.mcpConfig!.mcpServers.myserver.env).toEqual({
      API_KEY: "secret123",
      PORT: "3000",
    })
  })

  test("HTTP/SSE server produces correct mcpConfig with serverUrl", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      mcpServers: {
        remote: { url: "https://example.com/mcp", headers: { Authorization: "Bearer abc" } },
      },
      agents: [],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToWindsurf(plugin, defaultOptions)
    expect(bundle.mcpConfig!.mcpServers.remote).toEqual({
      serverUrl: "https://example.com/mcp",
      headers: { Authorization: "Bearer abc" },
    })
  })

  test("mixed stdio and HTTP servers both included", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      mcpServers: {
        local: { command: "echo", args: ["hello"] },
        remote: { url: "https://example.com/mcp" },
      },
      agents: [],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToWindsurf(plugin, defaultOptions)
    expect(Object.keys(bundle.mcpConfig!.mcpServers)).toHaveLength(2)
    expect(bundle.mcpConfig!.mcpServers.local.command).toBe("echo")
    expect(bundle.mcpConfig!.mcpServers.remote.serverUrl).toBe("https://example.com/mcp")
  })

  test("hasPotentialSecrets emits console.warn for sensitive env keys", () => {
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...msgs: unknown[]) => warnings.push(msgs.map(String).join(" "))

    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      mcpServers: {
        myserver: {
          command: "serve",
          env: { API_KEY: "secret123", PORT: "3000" },
        },
      },
      agents: [],
      commands: [],
      skills: [],
    }

    convertClaudeToWindsurf(plugin, defaultOptions)
    console.warn = originalWarn

    expect(warnings.some((w) => w.includes("secrets") && w.includes("myserver"))).toBe(true)
  })

  test("no secrets warning when env vars are safe", () => {
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...msgs: unknown[]) => warnings.push(msgs.map(String).join(" "))

    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      mcpServers: {
        myserver: {
          command: "serve",
          env: { PORT: "3000", HOST: "localhost" },
        },
      },
      agents: [],
      commands: [],
      skills: [],
    }

    convertClaudeToWindsurf(plugin, defaultOptions)
    console.warn = originalWarn

    expect(warnings.some((w) => w.includes("secrets"))).toBe(false)
  })

  test("no MCP servers produces null mcpConfig", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      mcpServers: undefined,
      agents: [],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToWindsurf(plugin, defaultOptions)
    expect(bundle.mcpConfig).toBeNull()
  })

  test("server with no command and no URL is skipped with warning", () => {
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...msgs: unknown[]) => warnings.push(msgs.map(String).join(" "))

    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      mcpServers: {
        broken: {} as { command: string },
      },
      agents: [],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToWindsurf(plugin, defaultOptions)
    console.warn = originalWarn

    expect(bundle.mcpConfig).toBeNull()
    expect(warnings.some((w) => w.includes("broken") && w.includes("no command or URL"))).toBe(true)
  })

  test("server command without args omits args field", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      mcpServers: {
        simple: { command: "myserver" },
      },
      agents: [],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToWindsurf(plugin, defaultOptions)
    expect(bundle.mcpConfig!.mcpServers.simple).toEqual({ command: "myserver" })
    expect(bundle.mcpConfig!.mcpServers.simple.args).toBeUndefined()
  })
})

describe("transformContentForWindsurf", () => {
  test("transforms .claude/ paths to .windsurf/", () => {
    const result = transformContentForWindsurf("Read .claude/settings.json for config.")
    expect(result).toContain(".windsurf/settings.json")
    expect(result).not.toContain(".claude/")
  })

  test("transforms ~/.claude/ paths to ~/.codeium/windsurf/", () => {
    const result = transformContentForWindsurf("Check ~/.claude/config for settings.")
    expect(result).toContain("~/.codeium/windsurf/config")
    expect(result).not.toContain("~/.claude/")
  })

  test("transforms Task agent(args) to skill reference", () => {
    const input = `Run these:

- Task repo-research-analyst(feature_description)
- Task learnings-researcher(feature_description)

Task best-practices-researcher(topic)`

    const result = transformContentForWindsurf(input)
    expect(result).toContain("Use the @repo-research-analyst skill: feature_description")
    expect(result).toContain("Use the @learnings-researcher skill: feature_description")
    expect(result).toContain("Use the @best-practices-researcher skill: topic")
    expect(result).not.toContain("Task repo-research-analyst")
  })

  test("keeps @agent references as-is for known agents (Windsurf skill invocation syntax)", () => {
    const result = transformContentForWindsurf("Ask @security-sentinel for a review.", ["security-sentinel"])
    expect(result).toContain("@security-sentinel")
    expect(result).not.toContain("/agents/")
  })

  test("does not transform @unknown-name when not in known agents", () => {
    const result = transformContentForWindsurf("Contact @someone-else for help.", ["security-sentinel"])
    expect(result).toContain("@someone-else")
  })

  test("transforms slash command refs to /{workflow-name} (per spec)", () => {
    const result = transformContentForWindsurf("Run /workflows:plan to start planning.")
    expect(result).toContain("/workflows-plan")
    expect(result).not.toContain("/commands/")
  })

  test("does not transform partial .claude paths in middle of word", () => {
    const result = transformContentForWindsurf("Check some-package/.claude-config/settings")
    expect(result).toContain("some-package/")
  })

  test("handles case sensitivity in @agent-name matching", () => {
    const result = transformContentForWindsurf("Delegate to @My-Agent for help.", ["my-agent"])
    // @My-Agent won't match my-agent since regex is case-sensitive on the known names
    expect(result).toContain("@My-Agent")
  })

  test("handles multiple occurrences of same transform", () => {
    const result = transformContentForWindsurf(
      "Use .claude/foo and .claude/bar for config.",
    )
    expect(result).toContain(".windsurf/foo")
    expect(result).toContain(".windsurf/bar")
    expect(result).not.toContain(".claude/")
  })
})

describe("normalizeName", () => {
  test("lowercases and hyphenates spaces", () => {
    expect(normalizeName("Security Reviewer")).toBe("security-reviewer")
  })

  test("replaces colons with hyphens", () => {
    expect(normalizeName("workflows:plan")).toBe("workflows-plan")
  })

  test("collapses consecutive hyphens", () => {
    expect(normalizeName("agent--with--double-hyphens")).toBe("agent-with-double-hyphens")
  })

  test("strips leading/trailing hyphens", () => {
    expect(normalizeName("-leading-and-trailing-")).toBe("leading-and-trailing")
  })

  test("empty string returns item", () => {
    expect(normalizeName("")).toBe("item")
  })

  test("non-letter start returns item", () => {
    expect(normalizeName("123-agent")).toBe("item")
  })
})
