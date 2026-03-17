import { describe, expect, test } from "bun:test"
import { convertClaudeToQwen } from "../src/converters/claude-to-qwen"
import { parseFrontmatter } from "../src/utils/frontmatter"
import type { ClaudePlugin } from "../src/types/claude"

const fixturePlugin: ClaudePlugin = {
  root: "/tmp/plugin",
  manifest: { name: "compound-engineering", version: "1.2.0", description: "A plugin for engineers" },
  agents: [
    {
      name: "security-sentinel",
      description: "Security-focused agent",
      capabilities: ["Threat modeling", "OWASP"],
      model: "claude-sonnet-4-20250514",
      body: "Focus on vulnerabilities in ~/.claude/settings.",
      sourcePath: "/tmp/plugin/agents/security-sentinel.md",
    },
    {
      name: "brainstorm-agent",
      description: "Creative brainstormer",
      model: "inherit",
      body: "Generate ideas.",
      sourcePath: "/tmp/plugin/agents/brainstorm-agent.md",
    },
  ],
  commands: [
    {
      name: "workflows:plan",
      description: "Planning command",
      argumentHint: "[FOCUS]",
      model: "inherit",
      allowedTools: ["Read"],
      body: "Plan the work. Config at ~/.claude/settings.",
      sourcePath: "/tmp/plugin/commands/workflows/plan.md",
    },
    {
      name: "disabled-cmd",
      description: "Disabled",
      model: "inherit",
      allowedTools: [],
      body: "Should be excluded.",
      disableModelInvocation: true,
      sourcePath: "/tmp/plugin/commands/disabled-cmd.md",
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
    local: { command: "npx", args: ["-y", "some-mcp"], env: { API_KEY: "${YOUR_API_KEY}" } },
    remote: { url: "https://mcp.example.com/api", headers: { Authorization: "Bearer token" } },
  },
}

const defaultOptions = {
  agentMode: "subagent" as const,
  inferTemperature: false,
}

describe("convertClaudeToQwen", () => {
  test("converts agents to yaml format with frontmatter", () => {
    const bundle = convertClaudeToQwen(fixturePlugin, defaultOptions)

    const agent = bundle.agents.find((a) => a.name === "security-sentinel")
    expect(agent).toBeDefined()
    expect(agent!.format).toBe("yaml")
    const parsed = parseFrontmatter(agent!.content)
    expect(parsed.data.name).toBe("security-sentinel")
    expect(parsed.data.description).toBe("Security-focused agent")
    expect(parsed.data.model).toBe("anthropic/claude-sonnet-4-20250514")
    expect(parsed.body).toContain("Focus on vulnerabilities")
  })

  test("agent with inherit model has no model field in frontmatter", () => {
    const bundle = convertClaudeToQwen(fixturePlugin, defaultOptions)
    const agent = bundle.agents.find((a) => a.name === "brainstorm-agent")
    expect(agent).toBeDefined()
    const parsed = parseFrontmatter(agent!.content)
    expect(parsed.data.model).toBeUndefined()
  })

  test("inferTemperature injects temperature based on agent name/description", () => {
    const bundle = convertClaudeToQwen(fixturePlugin, { ...defaultOptions, inferTemperature: true })

    const sentinel = bundle.agents.find((a) => a.name === "security-sentinel")
    const parsed = parseFrontmatter(sentinel!.content)
    expect(parsed.data.temperature).toBe(0.1) // review/security → 0.1

    const brainstorm = bundle.agents.find((a) => a.name === "brainstorm-agent")
    const bParsed = parseFrontmatter(brainstorm!.content)
    expect(bParsed.data.temperature).toBe(0.6) // brainstorm → 0.6
  })

  test("inferTemperature returns undefined for unrecognized agents (no temperature set)", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [{ name: "my-helper", description: "Generic helper", model: "inherit", body: "help", sourcePath: "/tmp/a.md" }],
    }
    const bundle = convertClaudeToQwen(plugin, { ...defaultOptions, inferTemperature: true })
    const agent = bundle.agents[0]
    const parsed = parseFrontmatter(agent.content)
    expect(parsed.data.temperature).toBeUndefined()
  })

  test("converts commands to command files excluding disableModelInvocation", () => {
    const bundle = convertClaudeToQwen(fixturePlugin, defaultOptions)

    const planCmd = bundle.commandFiles.find((c) => c.name === "workflows:plan")
    expect(planCmd).toBeDefined()
    const parsed = parseFrontmatter(planCmd!.content)
    expect(parsed.data.description).toBe("Planning command")
    expect(parsed.data.allowedTools).toEqual(["Read"])

    const disabled = bundle.commandFiles.find((c) => c.name === "disabled-cmd")
    expect(disabled).toBeUndefined()
  })

  test("config uses plugin manifest name and version", () => {
    const bundle = convertClaudeToQwen(fixturePlugin, defaultOptions)
    expect(bundle.config.name).toBe("compound-engineering")
    expect(bundle.config.version).toBe("1.2.0")
    expect(bundle.config.commands).toBe("commands")
    expect(bundle.config.skills).toBe("skills")
    expect(bundle.config.agents).toBe("agents")
  })

  test("stdio MCP servers are included in config", () => {
    const bundle = convertClaudeToQwen(fixturePlugin, defaultOptions)
    expect(bundle.config.mcpServers).toBeDefined()
    const local = bundle.config.mcpServers!.local
    expect(local.command).toBe("npx")
    expect(local.args).toEqual(["-y", "some-mcp"])
    // No cwd field
    expect((local as any).cwd).toBeUndefined()
  })

  test("remote MCP servers are skipped with a warning (not converted to curl)", () => {
    const bundle = convertClaudeToQwen(fixturePlugin, defaultOptions)
    // Only local (stdio) server should be present
    expect(bundle.config.mcpServers).toBeDefined()
    expect(bundle.config.mcpServers!.remote).toBeUndefined()
    expect(bundle.config.mcpServers!.local).toBeDefined()
  })

  test("placeholder env vars are extracted as settings", () => {
    const bundle = convertClaudeToQwen(fixturePlugin, defaultOptions)
    expect(bundle.config.settings).toBeDefined()
    const apiKeySetting = bundle.config.settings!.find((s) => s.envVar === "API_KEY")
    expect(apiKeySetting).toBeDefined()
    expect(apiKeySetting!.sensitive).toBe(true)
    expect(apiKeySetting!.name).toBe("Api Key")
  })

  test("plugin with no MCP servers has no mcpServers in config", () => {
    const plugin: ClaudePlugin = { ...fixturePlugin, mcpServers: undefined }
    const bundle = convertClaudeToQwen(plugin, defaultOptions)
    expect(bundle.config.mcpServers).toBeUndefined()
  })

  test("context file uses plugin.manifest.name and manifest.description", () => {
    const bundle = convertClaudeToQwen(fixturePlugin, defaultOptions)
    expect(bundle.contextFile).toContain("# compound-engineering")
    expect(bundle.contextFile).toContain("A plugin for engineers")
    expect(bundle.contextFile).toContain("## Agents")
    expect(bundle.contextFile).toContain("security-sentinel")
    expect(bundle.contextFile).toContain("## Commands")
    expect(bundle.contextFile).toContain("/workflows:plan")
    // Disabled commands excluded
    expect(bundle.contextFile).not.toContain("disabled-cmd")
    expect(bundle.contextFile).toContain("## Skills")
    expect(bundle.contextFile).toContain("existing-skill")
  })

  test("paths are rewritten from .claude/ to .qwen/ in agent and command content", () => {
    const bundle = convertClaudeToQwen(fixturePlugin, defaultOptions)

    const agent = bundle.agents.find((a) => a.name === "security-sentinel")
    expect(agent!.content).toContain("~/.qwen/settings")
    expect(agent!.content).not.toContain("~/.claude/settings")

    const cmd = bundle.commandFiles.find((c) => c.name === "workflows:plan")
    expect(cmd!.content).toContain("~/.qwen/settings")
    expect(cmd!.content).not.toContain("~/.claude/settings")
  })

  test("opencode paths are NOT rewritten (only claude paths)", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        {
          name: "test-agent",
          description: "test",
          model: "inherit",
          body: "See .opencode/config and ~/.config/opencode/settings",
          sourcePath: "/tmp/a.md",
        },
      ],
    }
    const bundle = convertClaudeToQwen(plugin, defaultOptions)
    const agent = bundle.agents[0]
    // opencode paths should NOT be rewritten
    expect(agent.content).toContain(".opencode/config")
    expect(agent.content).not.toContain(".qwen/config")
  })

  test("skillDirs passes through original skills", () => {
    const bundle = convertClaudeToQwen(fixturePlugin, defaultOptions)
    const skill = bundle.skillDirs.find((s) => s.name === "existing-skill")
    expect(skill).toBeDefined()
    expect(skill!.sourceDir).toBe("/tmp/plugin/skills/existing-skill")
  })

  test("normalizeModel prefixes claude models with anthropic/", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [{ name: "a", description: "d", model: "claude-opus-4-5", body: "b", sourcePath: "/tmp/a.md" }],
    }
    const bundle = convertClaudeToQwen(plugin, defaultOptions)
    const parsed = parseFrontmatter(bundle.agents[0].content)
    expect(parsed.data.model).toBe("anthropic/claude-opus-4-5")
  })

  test("normalizeModel passes through already-namespaced models unchanged", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [{ name: "a", description: "d", model: "google/gemini-2.0", body: "b", sourcePath: "/tmp/a.md" }],
    }
    const bundle = convertClaudeToQwen(plugin, defaultOptions)
    const parsed = parseFrontmatter(bundle.agents[0].content)
    expect(parsed.data.model).toBe("google/gemini-2.0")
  })
})
