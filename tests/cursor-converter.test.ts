import { describe, expect, test, spyOn } from "bun:test"
import { convertClaudeToCursor, transformContentForCursor } from "../src/converters/claude-to-cursor"
import { parseFrontmatter } from "../src/utils/frontmatter"
import type { ClaudePlugin } from "../src/types/claude"

const fixturePlugin: ClaudePlugin = {
  root: "/tmp/plugin",
  manifest: { name: "fixture", version: "1.0.0" },
  agents: [
    {
      name: "Security Reviewer",
      description: "Security-focused code review agent",
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
  mcpServers: undefined,
}

const defaultOptions = {
  agentMode: "subagent" as const,
  inferTemperature: false,
  permissions: "none" as const,
}

describe("convertClaudeToCursor", () => {
  test("converts agents to rules with .mdc frontmatter", () => {
    const bundle = convertClaudeToCursor(fixturePlugin, defaultOptions)

    expect(bundle.rules).toHaveLength(1)
    const rule = bundle.rules[0]
    expect(rule.name).toBe("security-reviewer")

    const parsed = parseFrontmatter(rule.content)
    expect(parsed.data.description).toBe("Security-focused code review agent")
    expect(parsed.data.alwaysApply).toBe(false)
    // globs is omitted (Agent Requested mode doesn't need it)
    expect(parsed.body).toContain("Capabilities")
    expect(parsed.body).toContain("Threat modeling")
    expect(parsed.body).toContain("Focus on vulnerabilities.")
  })

  test("agent with empty description gets default", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        {
          name: "basic-agent",
          body: "Do things.",
          sourcePath: "/tmp/plugin/agents/basic.md",
        },
      ],
    }

    const bundle = convertClaudeToCursor(plugin, defaultOptions)
    const parsed = parseFrontmatter(bundle.rules[0].content)
    expect(parsed.data.description).toBe("Converted from Claude agent basic-agent")
  })

  test("agent with empty body gets default body", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        {
          name: "empty-agent",
          description: "Empty agent",
          body: "",
          sourcePath: "/tmp/plugin/agents/empty.md",
        },
      ],
    }

    const bundle = convertClaudeToCursor(plugin, defaultOptions)
    const parsed = parseFrontmatter(bundle.rules[0].content)
    expect(parsed.body).toContain("Instructions converted from the empty-agent agent.")
  })

  test("agent capabilities are prepended to body", () => {
    const bundle = convertClaudeToCursor(fixturePlugin, defaultOptions)
    const parsed = parseFrontmatter(bundle.rules[0].content)
    expect(parsed.body).toMatch(/## Capabilities\n- Threat modeling\n- OWASP/)
  })

  test("agent model field is silently dropped", () => {
    const bundle = convertClaudeToCursor(fixturePlugin, defaultOptions)
    const parsed = parseFrontmatter(bundle.rules[0].content)
    expect(parsed.data.model).toBeUndefined()
  })

  test("flattens namespaced command names", () => {
    const bundle = convertClaudeToCursor(fixturePlugin, defaultOptions)

    expect(bundle.commands).toHaveLength(1)
    const command = bundle.commands[0]
    expect(command.name).toBe("plan")
  })

  test("commands are plain markdown without frontmatter", () => {
    const bundle = convertClaudeToCursor(fixturePlugin, defaultOptions)
    const command = bundle.commands[0]

    // Should NOT start with ---
    expect(command.content.startsWith("---")).toBe(false)
    // Should include the description as a comment
    expect(command.content).toContain("<!-- Planning command -->")
    expect(command.content).toContain("Plan the work.")
  })

  test("command name collision after flattening is deduplicated", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "workflows:plan",
          description: "Workflow plan",
          body: "Plan body.",
          sourcePath: "/tmp/plugin/commands/workflows/plan.md",
        },
        {
          name: "plan",
          description: "Top-level plan",
          body: "Top plan body.",
          sourcePath: "/tmp/plugin/commands/plan.md",
        },
      ],
      agents: [],
      skills: [],
    }

    const bundle = convertClaudeToCursor(plugin, defaultOptions)
    const names = bundle.commands.map((c) => c.name)
    expect(names).toEqual(["plan", "plan-2"])
  })

  test("command with disable-model-invocation is still included", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "setup",
          description: "Setup command",
          disableModelInvocation: true,
          body: "Setup body.",
          sourcePath: "/tmp/plugin/commands/setup.md",
        },
      ],
      agents: [],
      skills: [],
    }

    const bundle = convertClaudeToCursor(plugin, defaultOptions)
    expect(bundle.commands).toHaveLength(1)
    expect(bundle.commands[0].name).toBe("setup")
  })

  test("command allowedTools is silently dropped", () => {
    const bundle = convertClaudeToCursor(fixturePlugin, defaultOptions)
    const command = bundle.commands[0]
    expect(command.content).not.toContain("allowedTools")
    expect(command.content).not.toContain("Read")
  })

  test("command with argument-hint gets Arguments section", () => {
    const bundle = convertClaudeToCursor(fixturePlugin, defaultOptions)
    const command = bundle.commands[0]
    expect(command.content).toContain("## Arguments")
    expect(command.content).toContain("[FOCUS]")
  })

  test("passes through skill directories", () => {
    const bundle = convertClaudeToCursor(fixturePlugin, defaultOptions)

    expect(bundle.skillDirs).toHaveLength(1)
    expect(bundle.skillDirs[0].name).toBe("existing-skill")
    expect(bundle.skillDirs[0].sourceDir).toBe("/tmp/plugin/skills/existing-skill")
  })

  test("converts MCP servers to JSON config", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [],
      commands: [],
      skills: [],
      mcpServers: {
        playwright: {
          command: "npx",
          args: ["-y", "@anthropic/mcp-playwright"],
          env: { DISPLAY: ":0" },
        },
      },
    }

    const bundle = convertClaudeToCursor(plugin, defaultOptions)
    expect(bundle.mcpServers).toBeDefined()
    expect(bundle.mcpServers!.playwright.command).toBe("npx")
    expect(bundle.mcpServers!.playwright.args).toEqual(["-y", "@anthropic/mcp-playwright"])
    expect(bundle.mcpServers!.playwright.env).toEqual({ DISPLAY: ":0" })
  })

  test("MCP headers pass through for remote servers", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [],
      commands: [],
      skills: [],
      mcpServers: {
        remote: {
          url: "https://mcp.example.com/sse",
          headers: { Authorization: "Bearer token" },
        },
      },
    }

    const bundle = convertClaudeToCursor(plugin, defaultOptions)
    expect(bundle.mcpServers!.remote.url).toBe("https://mcp.example.com/sse")
    expect(bundle.mcpServers!.remote.headers).toEqual({ Authorization: "Bearer token" })
  })

  test("warns when hooks are present", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [],
      commands: [],
      skills: [],
      hooks: {
        hooks: {
          PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo test" }] }],
        },
      },
    }

    convertClaudeToCursor(plugin, defaultOptions)
    expect(warnSpy).toHaveBeenCalledWith(
      "Warning: Cursor does not support hooks. Hooks were skipped during conversion.",
    )

    warnSpy.mockRestore()
  })

  test("no warning when hooks are absent", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    convertClaudeToCursor(fixturePlugin, defaultOptions)
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  test("plugin with zero agents produces empty rules array", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [],
    }

    const bundle = convertClaudeToCursor(plugin, defaultOptions)
    expect(bundle.rules).toHaveLength(0)
  })

  test("plugin with only skills works", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [],
      commands: [],
    }

    const bundle = convertClaudeToCursor(plugin, defaultOptions)
    expect(bundle.rules).toHaveLength(0)
    expect(bundle.commands).toHaveLength(0)
    expect(bundle.skillDirs).toHaveLength(1)
  })
})

describe("transformContentForCursor", () => {
  test("rewrites .claude/ paths to .cursor/", () => {
    const input = "Read `.claude/compound-engineering.local.md` for config."
    const result = transformContentForCursor(input)
    expect(result).toContain(".cursor/compound-engineering.local.md")
    expect(result).not.toContain(".claude/")
  })

  test("rewrites ~/.claude/ paths to ~/.cursor/", () => {
    const input = "Global config at ~/.claude/settings.json"
    const result = transformContentForCursor(input)
    expect(result).toContain("~/.cursor/settings.json")
    expect(result).not.toContain("~/.claude/")
  })

  test("transforms Task agent calls to skill references", () => {
    const input = `Run agents:

- Task repo-research-analyst(feature_description)
- Task learnings-researcher(feature_description)

Task best-practices-researcher(topic)`

    const result = transformContentForCursor(input)
    expect(result).toContain("Use the repo-research-analyst skill to: feature_description")
    expect(result).toContain("Use the learnings-researcher skill to: feature_description")
    expect(result).toContain("Use the best-practices-researcher skill to: topic")
    expect(result).not.toContain("Task repo-research-analyst(")
  })

  test("flattens slash commands", () => {
    const input = `1. Run /deepen-plan to enhance
2. Start /workflows:work to implement
3. File at /tmp/output.md`

    const result = transformContentForCursor(input)
    expect(result).toContain("/deepen-plan")
    expect(result).toContain("/work")
    expect(result).not.toContain("/workflows:work")
    // File paths preserved
    expect(result).toContain("/tmp/output.md")
  })

  test("transforms @agent references to rule references", () => {
    const input = "Have @security-sentinel and @dhh-rails-reviewer check the code."
    const result = transformContentForCursor(input)
    expect(result).toContain("the security-sentinel rule")
    expect(result).toContain("the dhh-rails-reviewer rule")
    expect(result).not.toContain("@security-sentinel")
  })
})
