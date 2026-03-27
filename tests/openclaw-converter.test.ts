import { describe, expect, test } from "bun:test"
import { convertClaudeToOpenClaw } from "../src/converters/claude-to-openclaw"
import { parseFrontmatter } from "../src/utils/frontmatter"
import type { ClaudePlugin } from "../src/types/claude"

const fixturePlugin: ClaudePlugin = {
  root: "/tmp/plugin",
  manifest: { name: "compound-engineering", version: "1.0.0", description: "A plugin" },
  agents: [
    {
      name: "security-reviewer",
      description: "Security-focused agent",
      capabilities: ["Threat modeling", "OWASP"],
      model: "claude-sonnet-4-20250514",
      body: "Focus on vulnerabilities in ~/.claude/settings.",
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
      body: "Plan the work. See ~/.claude/settings for config.",
      sourcePath: "/tmp/plugin/commands/workflows/plan.md",
    },
    {
      name: "disabled-cmd",
      description: "Disabled command",
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
    local: { command: "npx", args: ["-y", "some-mcp-server"] },
    remote: { url: "https://mcp.example.com/api", headers: { Authorization: "Bearer token" } },
  },
}

const defaultOptions = {
  agentMode: "subagent" as const,
  inferTemperature: false,
  permissions: "none" as const,
}

describe("convertClaudeToOpenClaw", () => {
  test("converts agents to skill files with SKILL.md content", () => {
    const bundle = convertClaudeToOpenClaw(fixturePlugin, defaultOptions)

    const skill = bundle.skills.find((s) => s.name === "security-reviewer")
    expect(skill).toBeDefined()
    expect(skill!.dir).toBe("agent-security-reviewer")
    const parsed = parseFrontmatter(skill!.content)
    expect(parsed.data.name).toBe("security-reviewer")
    expect(parsed.data.description).toBe("Security-focused agent")
    expect(parsed.data.model).toBe("claude-sonnet-4-20250514")
    expect(parsed.body).toContain("Focus on vulnerabilities")
  })

  test("converts commands to skill files (excluding disableModelInvocation)", () => {
    const bundle = convertClaudeToOpenClaw(fixturePlugin, defaultOptions)

    const cmdSkill = bundle.skills.find((s) => s.name === "workflows:plan")
    expect(cmdSkill).toBeDefined()
    expect(cmdSkill!.dir).toBe("cmd-workflows:plan")

    const disabledSkill = bundle.skills.find((s) => s.name === "disabled-cmd")
    expect(disabledSkill).toBeUndefined()
  })

  test("commands list excludes disableModelInvocation commands", () => {
    const bundle = convertClaudeToOpenClaw(fixturePlugin, defaultOptions)

    const cmd = bundle.commands.find((c) => c.name === "workflows-plan")
    expect(cmd).toBeDefined()
    expect(cmd!.description).toBe("Planning command")
    expect(cmd!.acceptsArgs).toBe(true)

    const disabled = bundle.commands.find((c) => c.name === "disabled-cmd")
    expect(disabled).toBeUndefined()
  })

  test("command colons are replaced with dashes in command registrations", () => {
    const bundle = convertClaudeToOpenClaw(fixturePlugin, defaultOptions)

    const cmd = bundle.commands.find((c) => c.name === "workflows-plan")
    expect(cmd).toBeDefined()
    expect(cmd!.name).not.toContain(":")
  })

  test("manifest includes plugin id, display name, and skills list", () => {
    const bundle = convertClaudeToOpenClaw(fixturePlugin, defaultOptions)

    expect(bundle.manifest.id).toBe("compound-engineering")
    expect(bundle.manifest.name).toBe("Compound Engineering")
    expect(bundle.manifest.kind).toBe("tool")
    expect(bundle.manifest.configSchema).toEqual({
      type: "object",
      properties: {},
    })
    expect(bundle.manifest.skills).toContain("skills/agent-security-reviewer")
    expect(bundle.manifest.skills).toContain("skills/cmd-workflows-plan")
    expect(bundle.manifest.skills).toContain("skills/existing-skill")
  })

  test("package.json uses plugin name and version", () => {
    const bundle = convertClaudeToOpenClaw(fixturePlugin, defaultOptions)

    expect(bundle.packageJson.name).toBe("openclaw-compound-engineering")
    expect(bundle.packageJson.version).toBe("1.0.0")
    expect(bundle.packageJson.type).toBe("module")
  })

  test("skillDirCopies includes original skill directories", () => {
    const bundle = convertClaudeToOpenClaw(fixturePlugin, defaultOptions)

    const copy = bundle.skillDirCopies.find((s) => s.name === "existing-skill")
    expect(copy).toBeDefined()
    expect(copy!.sourceDir).toBe("/tmp/plugin/skills/existing-skill")
  })

  test("stdio MCP servers included in openclaw config", () => {
    const bundle = convertClaudeToOpenClaw(fixturePlugin, defaultOptions)

    expect(bundle.openclawConfig).toBeDefined()
    const mcp = (bundle.openclawConfig!.mcpServers as Record<string, unknown>)
    expect(mcp.local).toBeDefined()
    expect((mcp.local as any).type).toBe("stdio")
    expect((mcp.local as any).command).toBe("npx")
  })

  test("HTTP MCP servers included as http type in openclaw config", () => {
    const bundle = convertClaudeToOpenClaw(fixturePlugin, defaultOptions)

    const mcp = (bundle.openclawConfig!.mcpServers as Record<string, unknown>)
    expect(mcp.remote).toBeDefined()
    expect((mcp.remote as any).type).toBe("http")
    expect((mcp.remote as any).url).toBe("https://mcp.example.com/api")
  })

  test("paths are rewritten from .claude/ to .openclaw/ in skill content", () => {
    const bundle = convertClaudeToOpenClaw(fixturePlugin, defaultOptions)

    const agentSkill = bundle.skills.find((s) => s.name === "security-reviewer")
    expect(agentSkill!.content).toContain("~/.openclaw/settings")
    expect(agentSkill!.content).not.toContain("~/.claude/settings")

    const cmdSkill = bundle.skills.find((s) => s.name === "workflows:plan")
    expect(cmdSkill!.content).toContain("~/.openclaw/settings")
    expect(cmdSkill!.content).not.toContain("~/.claude/settings")
  })

  test("generateEntryPoint uses JSON.stringify for safe string escaping", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "tricky-cmd",
          description: 'Has "quotes" and \\backslashes\\ and\nnewlines',
          model: "inherit",
          allowedTools: [],
          body: "body",
          sourcePath: "/tmp/cmd.md",
        },
      ],
    }
    const bundle = convertClaudeToOpenClaw(plugin, defaultOptions)

    // Entry point must be valid JS/TS — JSON.stringify handles all special chars
    expect(bundle.entryPoint).toContain('"tricky-cmd"')
    expect(bundle.entryPoint).toContain('\\"quotes\\"')
    expect(bundle.entryPoint).toContain("\\\\backslashes\\\\")
    expect(bundle.entryPoint).toContain("\\n")
    // No raw unescaped newline inside a string literal
    const lines = bundle.entryPoint.split("\n")
    const nameLine = lines.find((l) => l.includes("tricky-cmd") && l.includes("name:"))
    expect(nameLine).toBeDefined()
  })

  test("generateEntryPoint emits typed skills record", () => {
    const bundle = convertClaudeToOpenClaw(fixturePlugin, defaultOptions)
    expect(bundle.entryPoint).toContain("const skills: Record<string, string> = {}")
  })

  test("plugin without MCP servers has no openclawConfig", () => {
    const plugin: ClaudePlugin = { ...fixturePlugin, mcpServers: undefined }
    const bundle = convertClaudeToOpenClaw(plugin, defaultOptions)
    expect(bundle.openclawConfig).toBeUndefined()
  })

  test("manifest skill paths use sanitized names matching filesystem output", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      skills: [
        {
          name: "ce:plan",
          description: "Planning skill",
          sourceDir: "/tmp/plugin/skills/ce-plan",
          skillPath: "/tmp/plugin/skills/ce-plan/SKILL.md",
        },
      ],
    }

    const bundle = convertClaudeToOpenClaw(plugin, defaultOptions)

    // Manifest paths must not contain colons
    for (const skillPath of bundle.manifest.skills) {
      expect(skillPath).not.toContain(":")
    }
    expect(bundle.manifest.skills).toContain("skills/ce-plan")
    expect(bundle.manifest.skills).toContain("skills/cmd-workflows-plan")
  })
})
