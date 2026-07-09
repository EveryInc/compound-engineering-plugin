import { describe, expect, test } from "bun:test"
import { convertClaudeToCodeBuddy } from "../src/converters/claude-to-codebuddy"
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
      argumentHint: "[ITEM]",
      sourceDir: "/tmp/plugin/skills/existing-skill",
      skillPath: "/tmp/plugin/skills/existing-skill/SKILL.md",
    },
  ],
  hooks: undefined,
  mcpServers: {
    local: { command: "echo", args: ["hello"] },
  },
}

describe("convertClaudeToCodeBuddy", () => {
  test("default (agents-only): emits only agent conversions, no skills or prompts or command-skills", () => {
    const bundle = convertClaudeToCodeBuddy(fixturePlugin, {
      codexIncludeSkills: false,
    })

    expect(bundle.agents).toHaveLength(1)
    expect(bundle.agents![0].name).toBe("security-reviewer")
    expect(bundle.agents![0].description).toBe("Security-focused agent")
    expect(bundle.agents![0].instructions).toContain("## Capabilities")
    expect(bundle.agents![0].instructions).toContain("Threat modeling")

    expect(bundle.prompts).toHaveLength(0)
    expect(bundle.skillDirs).toHaveLength(0)
    expect(bundle.generatedSkills).toHaveLength(0)
    expect(bundle.mcpServers).toBeUndefined()
  })

  test("agents-only: passes through hooks", () => {
    const pluginWithHooks: ClaudePlugin = {
      ...fixturePlugin,
      hooks: {
        hooks: {
          PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hello" }] }],
        },
      },
    }

    const bundle = convertClaudeToCodeBuddy(pluginWithHooks, {
      codexIncludeSkills: false,
    })

    expect(bundle.hooks).toBeDefined()
    expect(bundle.hooks!.hooks!.PreToolUse).toHaveLength(1)
  })

  test("agents-only: includes externallyManagedSkillNames for cleanup", () => {
    const bundle = convertClaudeToCodeBuddy(fixturePlugin, {
      codexIncludeSkills: false,
    })

    expect(bundle.externallyManagedSkillNames).toEqual(["existing-skill"])
  })

  test("full mode: includes skills, prompts, command-skills, and MCP", () => {
    const bundle = convertClaudeToCodeBuddy(fixturePlugin, {
      codexIncludeSkills: true,
    })

    expect(bundle.agents).toHaveLength(1)
    expect(bundle.skillDirs).toHaveLength(1)
    expect(bundle.skillDirs[0].name).toBe("existing-skill")
    expect(bundle.prompts).toHaveLength(1)
    expect(bundle.prompts[0].name).toBe("workflows-plan")
    expect(bundle.generatedSkills).toHaveLength(1)
    expect(bundle.generatedSkills[0].name).toBe("workflows-plan")
    expect(bundle.mcpServers).toBeDefined()
    expect(bundle.mcpServers!.local.command).toBe("echo")
  })

  test("agent description is sanitized and truncated if too long", () => {
    const longDesc = "A".repeat(2000)
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        {
          name: "LongDescAgent",
          description: longDesc,
          model: "claude-sonnet-4-20250514",
          body: "Do things.",
          sourcePath: "/tmp/plugin/agents/long-desc.md",
        },
      ],
    }

    const bundle = convertClaudeToCodeBuddy(plugin, {
      codexIncludeSkills: false,
    })

    expect(bundle.agents![0].description.length).toBeLessThanOrEqual(1024)
    expect(bundle.agents![0].description.endsWith("...")).toBe(true)
  })

  test("agent without description gets a fallback", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        {
          name: "NoDescAgent",
          model: "claude-sonnet-4-20250514",
          body: "Do things.",
          sourcePath: "/tmp/plugin/agents/no-desc.md",
        },
      ],
    }

    const bundle = convertClaudeToCodeBuddy(plugin, {
      codexIncludeSkills: false,
    })

    expect(bundle.agents![0].description).toContain("Converted from Claude agent")
  })

  test("agent name is normalized to lowercase kebab-case", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        {
          name: "My Cool Agent!",
          model: "claude-sonnet-4-20250514",
          body: "Be cool.",
          sourcePath: "/tmp/plugin/agents/my-cool-agent.md",
        },
      ],
    }

    const bundle = convertClaudeToCodeBuddy(plugin, {
      codexIncludeSkills: false,
    })

    expect(bundle.agents![0].name).toBe("my-cool-agent")
  })

  test("command skill renders with frontmatter", () => {
    const bundle = convertClaudeToCodeBuddy(fixturePlugin, {
      codexIncludeSkills: true,
    })

    const skill = bundle.generatedSkills[0]
    expect(skill.content).toContain("---")
    expect(skill.content).toContain("name:")
    expect(skill.content).toContain("description:")
  })

  test("prompt renders with instructions to use skill", () => {
    const bundle = convertClaudeToCodeBuddy(fixturePlugin, {
      codexIncludeSkills: true,
    })

    const prompt = bundle.prompts[0]
    expect(prompt.content).toContain("/workflows-plan")
    expect(prompt.content).toContain("Use the /")
  })

  test("empty agents array returns empty agents", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [],
    }

    const bundle = convertClaudeToCodeBuddy(plugin, {
      codexIncludeSkills: false,
    })

    expect(bundle.agents).toHaveLength(0)
  })

  test("skills with codebuddy platform filter are included", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      skills: [
        ...fixturePlugin.skills,
        {
          name: "codebuddy-only",
          description: "Only for CodeBuddy",
          sourceDir: "/tmp/plugin/skills/codebuddy-only",
          skillPath: "/tmp/plugin/skills/codebuddy-only/SKILL.md",
          platforms: ["codebuddy"],
        },
      ],
    }

    const bundle = convertClaudeToCodeBuddy(plugin, {
      codexIncludeSkills: true,
    })

    expect(bundle.skillDirs).toHaveLength(2)
  })
})
