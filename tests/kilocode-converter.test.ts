import { describe, expect, test } from "bun:test"
import { convertClaudeToKiloCode, transformContentForKiloCode, normalizeName } from "../src/converters/claude-to-kilocode"
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
  commands: [],
  skills: [
    {
      name: "existing-skill",
      description: "Existing skill",
      sourceDir: "/tmp/plugin/skills/existing-skill",
      skillPath: "/tmp/plugin/skills/existing-skill/SKILL.md",
    },
  ],
  mcpServers: {
    local: { command: "echo", args: ["hello"] },
  },
}

const defaultOptions = {
  agentMode: "subagent" as const,
  inferTemperature: false,
  permissions: "none" as const,
}

describe("convertClaudeToKiloCode", () => {
  test("converts agents with correct frontmatter (description, mode: subagent, permission fields)", () => {
    const bundle = convertClaudeToKiloCode(fixturePlugin, defaultOptions)

    const agent = bundle.agents.find((a) => a.name === "security-reviewer")
    expect(agent).toBeDefined()
    expect(agent!.content).toContain("description: Security-focused agent")
    expect(agent!.content).toContain("mode: subagent")
    expect(agent!.content).toContain("permission:")
    expect(agent!.content).toContain("edit: deny")
    expect(agent!.content).toContain("bash: deny")
  })

  test("agent capabilities included in content", () => {
    const bundle = convertClaudeToKiloCode(fixturePlugin, defaultOptions)
    const agent = bundle.agents.find((a) => a.name === "security-reviewer")
    expect(agent!.content).toContain("## Capabilities")
    expect(agent!.content).toContain("- Threat modeling")
    expect(agent!.content).toContain("- OWASP")
  })

  test("agent with empty description gets default", () => {
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

    const bundle = convertClaudeToKiloCode(plugin, defaultOptions)
    expect(bundle.agents[0].content).toContain("description: Converted from Claude agent my-agent")
  })

  test("agent model field preserved when not inherit", () => {
    const bundle = convertClaudeToKiloCode(fixturePlugin, defaultOptions)
    const agent = bundle.agents.find((a) => a.name === "security-reviewer")
    expect(agent!.content).toContain("model: claude-sonnet-4-20250514")
  })

  test("agent model field omitted when inherit", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        {
          name: "Inherit Agent",
          description: "Uses inherit model",
          model: "inherit",
          body: "Do things.",
          sourcePath: "/tmp/plugin/agents/inherit.md",
        },
      ],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToKiloCode(plugin, defaultOptions)
    const agent = bundle.agents.find((a) => a.name === "inherit-agent")
    expect(agent!.content).not.toContain("model: inherit")
    expect(agent!.content).not.toMatch(/^model:\s*$/m)
  })

  test("agent with empty body gets default text", () => {
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

    const bundle = convertClaudeToKiloCode(plugin, defaultOptions)
    expect(bundle.agents[0].content).toContain("Instructions converted from the Empty Agent agent.")
  })

  test("skills pass through as directory references", () => {
    const bundle = convertClaudeToKiloCode(fixturePlugin, defaultOptions)

    expect(bundle.skillDirs).toHaveLength(1)
    expect(bundle.skillDirs[0].name).toBe("existing-skill")
    expect(bundle.skillDirs[0].sourceDir).toBe("/tmp/plugin/skills/existing-skill")
  })

  test("MCP server conversion: stdio → local type with command array", () => {
    const bundle = convertClaudeToKiloCode(fixturePlugin, defaultOptions)
    expect(bundle.mcpConfig.mcp).toBeDefined()
    expect(bundle.mcpConfig.mcp!.local).toEqual({
      type: "local",
      command: ["echo", "hello"],
      enabled: true,
    })
  })

  test("MCP server conversion: http → remote type with url", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      mcpServers: {
        remote: { url: "https://example.com/mcp", headers: { Authorization: "Bearer abc" } },
      },
      agents: [],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToKiloCode(plugin, defaultOptions)
    expect(bundle.mcpConfig.mcp!.remote).toEqual({
      type: "remote",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer abc" },
      enabled: true,
    })
  })

  test("MCP key is 'mcp' (not 'mcpServers')", () => {
    const bundle = convertClaudeToKiloCode(fixturePlugin, defaultOptions)
    expect(bundle.mcpConfig.mcp).toBeDefined()
    expect(bundle.mcpConfig).not.toHaveProperty("mcpServers")
  })

  test("MCP command is an array (not a string)", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      mcpServers: {
        myserver: { command: "npx", args: ["-y", "@anthropic/mcp-server"] },
      },
      agents: [],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToKiloCode(plugin, defaultOptions)
    expect(Array.isArray(bundle.mcpConfig.mcp!.myserver.command)).toBe(true)
    expect(bundle.mcpConfig.mcp!.myserver.command).toEqual(["npx", "-y", "@anthropic/mcp-server"])
  })

  test("MCP environment mapping (env → environment)", () => {
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

    const bundle = convertClaudeToKiloCode(plugin, defaultOptions)
    expect(bundle.mcpConfig.mcp!.myserver.environment).toEqual({
      API_KEY: "secret123",
      PORT: "3000",
    })
    expect(bundle.mcpConfig.mcp!.myserver.env).toBeUndefined()
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

    convertClaudeToKiloCode(plugin, defaultOptions)
    console.warn = originalWarn

    expect(warnings.some((w) => w.includes("KiloCode") && w.includes("hooks"))).toBe(true)
  })

  test("empty plugin produces empty bundle", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/empty",
      manifest: { name: "empty", version: "1.0.0" },
      agents: [],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToKiloCode(plugin, defaultOptions)
    expect(bundle.agents).toHaveLength(0)
    expect(bundle.skillDirs).toHaveLength(0)
    expect(bundle.mcpConfig).toEqual({})
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

    const bundle = convertClaudeToKiloCode(plugin, defaultOptions)
    expect(bundle.agents[0].name).toBe("my-cool-agent")
    expect(bundle.agents[1].name).toBe("uppercase-agent")
    expect(bundle.agents[2].name).toBe("agent-with-double-hyphens")
  })

  test("name deduplication within agents", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        { name: "reviewer", description: "First", body: "Body.", sourcePath: "/tmp/a.md" },
        { name: "Reviewer", description: "Second", body: "Body.", sourcePath: "/tmp/b.md" },
      ],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToKiloCode(plugin, defaultOptions)
    expect(bundle.agents[0].name).toBe("reviewer")
    expect(bundle.agents[1].name).toBe("reviewer-2")
  })

  test("agent name deduplicates against pass-through skill names", () => {
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

    const bundle = convertClaudeToKiloCode(plugin, defaultOptions)
    expect(bundle.agents[0].name).toBe("existing-skill")
    expect(bundle.skillDirs[0].name).toBe("existing-skill")
  })

  test("MCP server with no command and no URL is skipped with warning", () => {
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)

    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      mcpServers: {
        broken: {} as { command: string },
      },
      agents: [],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToKiloCode(plugin, defaultOptions)
    console.warn = originalWarn

    expect(bundle.mcpConfig.mcp).toBeUndefined()
    expect(warnings.some((w) => w.includes("broken") && w.includes("neither command nor url"))).toBe(true)
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

    const bundle = convertClaudeToKiloCode(plugin, defaultOptions)
    expect(Object.keys(bundle.mcpConfig.mcp!)).toHaveLength(2)
    expect(bundle.mcpConfig.mcp!.local.type).toBe("local")
    expect(bundle.mcpConfig.mcp!.remote.type).toBe("remote")
  })
})

describe("transformContentForKiloCode", () => {
  test("transforms .claude/ → .kilocode/", () => {
    const result = transformContentForKiloCode("Read .claude/settings.json for config.")
    expect(result).toContain(".kilocode/settings.json")
    expect(result).not.toContain(".claude/")
  })

  test("transforms ~/.claude/ → ~/.kilocode/", () => {
    const result = transformContentForKiloCode("Check ~/.claude/config for settings.")
    expect(result).toContain("~/.kilocode/config")
    expect(result).not.toContain("~/.claude/")
  })

  test("transforms Task agent calls to skill references", () => {
    const input = `Run these:

- Task repo-research-analyst(feature_description)
- Task learnings-researcher(feature_description)

Task best-practices-researcher(topic)`

    const result = transformContentForKiloCode(input)
    expect(result).toContain("Use the repo-research-analyst skill to: feature_description")
    expect(result).toContain("Use the learnings-researcher skill to: feature_description")
    expect(result).toContain("Use the best-practices-researcher skill to: topic")
    expect(result).not.toContain("Task repo-research-analyst")
  })

  test("transforms @agent-name references", () => {
    const result = transformContentForKiloCode("Ask @security-reviewer for a review.")
    expect(result).toContain("the security-reviewer subagent")
    expect(result).not.toContain("@security-reviewer")
  })

  test("transforms @agent-name references with various suffixes", () => {
    const result = transformContentForKiloCode("Contact @learnings-researcher, @code-analyst, and @bug-specialist.")
    expect(result).toContain("the learnings-researcher subagent")
    expect(result).toContain("the code-analyst subagent")
    expect(result).toContain("the bug-specialist subagent")
  })

  test("does not transform partial .claude paths in middle of word", () => {
    const result = transformContentForKiloCode("Check some-package/.claude-config/settings")
    expect(result).toContain("some-package/")
  })

  test("handles multiple occurrences of same transform", () => {
    const result = transformContentForKiloCode(
      "Use .claude/foo and .claude/bar for config.",
    )
    expect(result).toContain(".kilocode/foo")
    expect(result).toContain(".kilocode/bar")
    expect(result).not.toContain(".claude/")
  })

  test("transforms slash command references (flatten namespaced commands)", () => {
    const result = transformContentForKiloCode("Run /workflows:plan to start planning.")
    expect(result).toContain("/workflows-plan")
    expect(result).not.toContain("/workflows:plan")
  })

  test("does not transform file paths that look like slash commands", () => {
    const result = transformContentForKiloCode("Check /dev/null or /tmp/file")
    expect(result).toContain("/dev/null")
    expect(result).toContain("/tmp/file")
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

  test("handles slashes and backslashes", () => {
    expect(normalizeName("path/to/agent")).toBe("path-to-agent")
    expect(normalizeName("path\\to\\agent")).toBe("path-to-agent")
  })
})

describe("agentMode option", () => {
  test("agentMode: primary produces mode: primary in frontmatter", () => {
    const options = {
      agentMode: "primary" as const,
      inferTemperature: false,
      permissions: "none" as const,
    }

    const bundle = convertClaudeToKiloCode(fixturePlugin, options)
    const agent = bundle.agents.find((a) => a.name === "security-reviewer")
    expect(agent!.content).toContain("mode: primary")
    expect(agent!.content).not.toContain("mode: subagent")
  })

  test("agentMode: subagent produces mode: subagent in frontmatter", () => {
    const options = {
      agentMode: "subagent" as const,
      inferTemperature: false,
      permissions: "none" as const,
    }

    const bundle = convertClaudeToKiloCode(fixturePlugin, options)
    const agent = bundle.agents.find((a) => a.name === "security-reviewer")
    expect(agent!.content).toContain("mode: subagent")
    expect(agent!.content).not.toContain("mode: primary")
  })
})
