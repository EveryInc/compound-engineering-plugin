import { describe, expect, test, spyOn } from "bun:test"
import { convertClaudeToCopilot, transformContentForCopilot } from "../src/converters/claude-to-copilot"
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

describe("convertClaudeToCopilot", () => {
  test("converts agents to .agent.md with Copilot frontmatter", () => {
    const bundle = convertClaudeToCopilot(fixturePlugin, defaultOptions)

    expect(bundle.agents).toHaveLength(1)
    const agent = bundle.agents[0]
    expect(agent.name).toBe("security-reviewer")

    const parsed = parseFrontmatter(agent.content)
    expect(parsed.data.description).toBe("Security-focused code review agent")
    expect(parsed.data.tools).toEqual(["*"])
    expect(parsed.data.infer).toBe(true)
    expect(parsed.body).toContain("Capabilities")
    expect(parsed.body).toContain("Threat modeling")
    expect(parsed.body).toContain("Focus on vulnerabilities.")
  })

  test("agent description is required, fallback generated if missing", () => {
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

    const bundle = convertClaudeToCopilot(plugin, defaultOptions)
    const parsed = parseFrontmatter(bundle.agents[0].content)
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

    const bundle = convertClaudeToCopilot(plugin, defaultOptions)
    const parsed = parseFrontmatter(bundle.agents[0].content)
    expect(parsed.body).toContain("Instructions converted from the empty-agent agent.")
  })

  test("agent capabilities are prepended to body", () => {
    const bundle = convertClaudeToCopilot(fixturePlugin, defaultOptions)
    const parsed = parseFrontmatter(bundle.agents[0].content)
    expect(parsed.body).toMatch(/## Capabilities\n- Threat modeling\n- OWASP/)
  })

  test("agent model field is passed through", () => {
    const bundle = convertClaudeToCopilot(fixturePlugin, defaultOptions)
    const parsed = parseFrontmatter(bundle.agents[0].content)
    expect(parsed.data.model).toBe("claude-sonnet-4-20250514")
  })

  test("agent without model omits model field", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        {
          name: "no-model",
          description: "No model agent",
          body: "Content.",
          sourcePath: "/tmp/plugin/agents/no-model.md",
        },
      ],
    }

    const bundle = convertClaudeToCopilot(plugin, defaultOptions)
    const parsed = parseFrontmatter(bundle.agents[0].content)
    expect(parsed.data.model).toBeUndefined()
  })

  test("agent tools defaults to [*]", () => {
    const bundle = convertClaudeToCopilot(fixturePlugin, defaultOptions)
    const parsed = parseFrontmatter(bundle.agents[0].content)
    expect(parsed.data.tools).toEqual(["*"])
  })

  test("agent infer defaults to true", () => {
    const bundle = convertClaudeToCopilot(fixturePlugin, defaultOptions)
    const parsed = parseFrontmatter(bundle.agents[0].content)
    expect(parsed.data.infer).toBe(true)
  })

  test("warns when agent body exceeds 30k characters", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        {
          name: "large-agent",
          description: "Large agent",
          body: "x".repeat(31_000),
          sourcePath: "/tmp/plugin/agents/large.md",
        },
      ],
      commands: [],
      skills: [],
    }

    convertClaudeToCopilot(plugin, defaultOptions)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("exceeds 30000 characters"),
    )

    warnSpy.mockRestore()
  })

  test("converts commands to skills with SKILL.md format", () => {
    const bundle = convertClaudeToCopilot(fixturePlugin, defaultOptions)

    expect(bundle.generatedSkills).toHaveLength(1)
    const skill = bundle.generatedSkills[0]
    expect(skill.name).toBe("workflows-plan")

    const parsed = parseFrontmatter(skill.content)
    expect(parsed.data.name).toBe("workflows-plan")
    expect(parsed.data.description).toBe("Planning command")
    expect(parsed.body).toContain("Plan the work.")
  })

  test("preserves namespaced command names with hyphens", () => {
    const bundle = convertClaudeToCopilot(fixturePlugin, defaultOptions)
    expect(bundle.generatedSkills[0].name).toBe("workflows-plan")
  })

  test("command name collision after normalization is deduplicated", () => {
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
          name: "workflows:plan",
          description: "Duplicate plan",
          body: "Duplicate body.",
          sourcePath: "/tmp/plugin/commands/workflows/plan2.md",
        },
      ],
      agents: [],
      skills: [],
    }

    const bundle = convertClaudeToCopilot(plugin, defaultOptions)
    const names = bundle.generatedSkills.map((s) => s.name)
    expect(names).toEqual(["workflows-plan", "workflows-plan-2"])
  })

  test("namespaced and non-namespaced commands produce distinct names", () => {
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

    const bundle = convertClaudeToCopilot(plugin, defaultOptions)
    const names = bundle.generatedSkills.map((s) => s.name)
    expect(names).toEqual(["workflows-plan", "plan"])
  })

  test("command allowedTools is silently dropped", () => {
    const bundle = convertClaudeToCopilot(fixturePlugin, defaultOptions)
    const skill = bundle.generatedSkills[0]
    expect(skill.content).not.toContain("allowedTools")
    expect(skill.content).not.toContain("allowed-tools")
  })

  test("command with argument-hint gets Arguments section", () => {
    const bundle = convertClaudeToCopilot(fixturePlugin, defaultOptions)
    const skill = bundle.generatedSkills[0]
    expect(skill.content).toContain("## Arguments")
    expect(skill.content).toContain("[FOCUS]")
  })

  test("passes through skill directories", () => {
    const bundle = convertClaudeToCopilot(fixturePlugin, defaultOptions)

    expect(bundle.skillDirs).toHaveLength(1)
    expect(bundle.skillDirs[0].name).toBe("existing-skill")
    expect(bundle.skillDirs[0].sourceDir).toBe("/tmp/plugin/skills/existing-skill")
  })

  test("skill and generated skill name collision is deduplicated", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "existing-skill",
          description: "Colliding command",
          body: "This collides with skill name.",
          sourcePath: "/tmp/plugin/commands/existing-skill.md",
        },
      ],
      agents: [],
    }

    const bundle = convertClaudeToCopilot(plugin, defaultOptions)
    // The command should get deduplicated since the skill name is reserved
    expect(bundle.generatedSkills[0].name).toBe("existing-skill-2")
    expect(bundle.skillDirs[0].name).toBe("existing-skill")
  })

  test("converts MCP servers with COPILOT_MCP_ prefix", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [],
      commands: [],
      skills: [],
      mcpServers: {
        playwright: {
          command: "npx",
          args: ["-y", "@anthropic/mcp-playwright"],
          env: { DISPLAY: ":0", API_KEY: "secret" },
        },
      },
    }

    const bundle = convertClaudeToCopilot(plugin, defaultOptions)
    expect(bundle.mcpConfig).toBeDefined()
    expect(bundle.mcpConfig!.playwright.type).toBe("local")
    expect(bundle.mcpConfig!.playwright.command).toBe("npx")
    expect(bundle.mcpConfig!.playwright.args).toEqual(["-y", "@anthropic/mcp-playwright"])
    expect(bundle.mcpConfig!.playwright.tools).toEqual(["*"])
    expect(bundle.mcpConfig!.playwright.env).toEqual({
      COPILOT_MCP_DISPLAY: ":0",
      COPILOT_MCP_API_KEY: "secret",
    })
  })

  test("MCP env vars already prefixed are not double-prefixed", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [],
      commands: [],
      skills: [],
      mcpServers: {
        server: {
          command: "node",
          args: ["server.js"],
          env: { COPILOT_MCP_TOKEN: "abc" },
        },
      },
    }

    const bundle = convertClaudeToCopilot(plugin, defaultOptions)
    expect(bundle.mcpConfig!.server.env).toEqual({ COPILOT_MCP_TOKEN: "abc" })
  })

  test("MCP servers get type field (local vs sse)", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [],
      commands: [],
      skills: [],
      mcpServers: {
        local: { command: "npx", args: ["server"] },
        remote: { url: "https://mcp.example.com/sse" },
      },
    }

    const bundle = convertClaudeToCopilot(plugin, defaultOptions)
    expect(bundle.mcpConfig!.local.type).toBe("local")
    expect(bundle.mcpConfig!.remote.type).toBe("sse")
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

    const bundle = convertClaudeToCopilot(plugin, defaultOptions)
    expect(bundle.mcpConfig!.remote.url).toBe("https://mcp.example.com/sse")
    expect(bundle.mcpConfig!.remote.headers).toEqual({ Authorization: "Bearer token" })
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

    convertClaudeToCopilot(plugin, defaultOptions)
    expect(warnSpy).toHaveBeenCalledWith(
      "Warning: Copilot does not support hooks. Hooks were skipped during conversion.",
    )

    warnSpy.mockRestore()
  })

  test("no warning when hooks are absent", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    convertClaudeToCopilot(fixturePlugin, defaultOptions)
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  test("plugin with zero agents produces empty agents array", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [],
    }

    const bundle = convertClaudeToCopilot(plugin, defaultOptions)
    expect(bundle.agents).toHaveLength(0)
  })

  test("plugin with only skills works", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [],
      commands: [],
    }

    const bundle = convertClaudeToCopilot(plugin, defaultOptions)
    expect(bundle.agents).toHaveLength(0)
    expect(bundle.generatedSkills).toHaveLength(0)
    expect(bundle.skillDirs).toHaveLength(1)
  })
})

describe("transformContentForCopilot", () => {
  test("rewrites .claude/ paths to .github/", () => {
    const input = "Read `.claude/compound-engineering.local.md` for config."
    const result = transformContentForCopilot(input)
    expect(result).toContain(".github/compound-engineering.local.md")
    expect(result).not.toContain(".claude/")
  })

  test("rewrites ~/.claude/ paths to ~/.copilot/", () => {
    const input = "Global config at ~/.claude/settings.json"
    const result = transformContentForCopilot(input)
    expect(result).toContain("~/.copilot/settings.json")
    expect(result).not.toContain("~/.claude/")
  })

  test("transforms Task agent calls to skill references", () => {
    const input = `Run agents:

- Task repo-research-analyst(feature_description)
- Task learnings-researcher(feature_description)

Task best-practices-researcher(topic)`

    const result = transformContentForCopilot(input)
    expect(result).toContain("Use the repo-research-analyst skill to: feature_description")
    expect(result).toContain("Use the learnings-researcher skill to: feature_description")
    expect(result).toContain("Use the best-practices-researcher skill to: topic")
    expect(result).not.toContain("Task repo-research-analyst(")
  })

  test("replaces colons with hyphens in slash commands", () => {
    const input = `1. Run /deepen-plan to enhance
2. Start /workflows:work to implement
3. File at /tmp/output.md`

    const result = transformContentForCopilot(input)
    expect(result).toContain("/deepen-plan")
    expect(result).toContain("/workflows-work")
    expect(result).not.toContain("/workflows:work")
    // File paths preserved
    expect(result).toContain("/tmp/output.md")
  })

  test("transforms @agent references to agent references", () => {
    const input = "Have @security-sentinel and @dhh-rails-reviewer check the code."
    const result = transformContentForCopilot(input)
    expect(result).toContain("the security-sentinel agent")
    expect(result).toContain("the dhh-rails-reviewer agent")
    expect(result).not.toContain("@security-sentinel")
  })
})
