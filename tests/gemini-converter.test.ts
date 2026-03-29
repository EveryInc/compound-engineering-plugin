import { describe, expect, test } from "bun:test"
import { convertClaudeToGemini, toToml, transformContentForGemini } from "../src/converters/claude-to-gemini"
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
      tools: ["Read", "Grep", "Glob", "Bash"],
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

describe("convertClaudeToGemini", () => {
  test("converts agents to skills with SKILL.md frontmatter", () => {
    const bundle = convertClaudeToGemini(fixturePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const skill = bundle.generatedSkills.find((s) => s.name === "security-reviewer")
    expect(skill).toBeDefined()
    const parsed = parseFrontmatter(skill!.content)
    expect(parsed.data.name).toBe("security-reviewer")
    expect(parsed.data.description).toBe("Security-focused agent")
    expect(parsed.body).toContain("Focus on vulnerabilities.")
  })

  test("agent with capabilities prepended to body", () => {
    const bundle = convertClaudeToGemini(fixturePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const skill = bundle.generatedSkills.find((s) => s.name === "security-reviewer")
    expect(skill).toBeDefined()
    const parsed = parseFrontmatter(skill!.content)
    expect(parsed.body).toContain("## Capabilities")
    expect(parsed.body).toContain("- Threat modeling")
    expect(parsed.body).toContain("- OWASP")
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

    const bundle = convertClaudeToGemini(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const parsed = parseFrontmatter(bundle.generatedSkills[0].content)
    expect(parsed.data.description).toBe("Use this skill for my-agent tasks")
  })

  test("agent model field silently dropped", () => {
    const bundle = convertClaudeToGemini(fixturePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const skill = bundle.generatedSkills.find((s) => s.name === "security-reviewer")
    const parsed = parseFrontmatter(skill!.content)
    expect(parsed.data.model).toBeUndefined()
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

    const bundle = convertClaudeToGemini(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const parsed = parseFrontmatter(bundle.generatedSkills[0].content)
    expect(parsed.body).toContain("Instructions converted from the Empty Agent agent.")
  })

  test("converts commands to TOML with prompt and description", () => {
    const bundle = convertClaudeToGemini(fixturePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    expect(bundle.commands).toHaveLength(1)
    const command = bundle.commands[0]
    expect(command.name).toBe("workflows/plan")
    expect(command.content).toContain('description = "Planning command"')
    expect(command.content).toContain('prompt = """')
    expect(command.content).toContain("Plan the work.")
  })

  test("namespaced command creates correct path", () => {
    const bundle = convertClaudeToGemini(fixturePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const command = bundle.commands.find((c) => c.name === "workflows/plan")
    expect(command).toBeDefined()
  })

  test("command with argument-hint gets {{args}} placeholder", () => {
    const bundle = convertClaudeToGemini(fixturePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const command = bundle.commands[0]
    expect(command.content).toContain("{{args}}")
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

    const bundle = convertClaudeToGemini(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    // Gemini TOML commands are prompts, not code — always include
    expect(bundle.commands).toHaveLength(1)
    expect(bundle.commands[0].name).toBe("disabled-command")
  })

  test("command allowedTools silently dropped", () => {
    const bundle = convertClaudeToGemini(fixturePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const command = bundle.commands[0]
    expect(command.content).not.toContain("allowedTools")
    expect(command.content).not.toContain("Read")
  })

  test("skills pass through as directory references", () => {
    const bundle = convertClaudeToGemini(fixturePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    expect(bundle.skillDirs).toHaveLength(1)
    expect(bundle.skillDirs[0].name).toBe("existing-skill")
    expect(bundle.skillDirs[0].sourceDir).toBe("/tmp/plugin/skills/existing-skill")
  })

  test("MCP servers convert to settings.json-compatible config", () => {
    const bundle = convertClaudeToGemini(fixturePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    expect(bundle.mcpServers?.local?.command).toBe("echo")
    expect(bundle.mcpServers?.local?.args).toEqual(["hello"])
  })

  test("plugin with zero agents produces empty generatedSkills", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToGemini(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    expect(bundle.generatedSkills).toHaveLength(0)
  })

  test("plugin with only skills works correctly", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [],
      commands: [],
    }

    const bundle = convertClaudeToGemini(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    expect(bundle.generatedSkills).toHaveLength(0)
    expect(bundle.skillDirs).toHaveLength(1)
    expect(bundle.commands).toHaveLength(0)
  })

  test("agent name colliding with skill name gets deduplicated", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      skills: [{ name: "security-reviewer", description: "Existing skill", sourceDir: "/tmp/skill", skillPath: "/tmp/skill/SKILL.md" }],
      agents: [{ name: "Security Reviewer", description: "Agent version", body: "Body.", sourcePath: "/tmp/agents/sr.md" }],
      commands: [],
    }

    const bundle = convertClaudeToGemini(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    // Agent should be deduplicated since skill already has "security-reviewer"
    expect(bundle.generatedSkills[0].name).toBe("security-reviewer-2")
    expect(bundle.skillDirs[0].name).toBe("security-reviewer")
  })

  test("hooks present emits console.warn", () => {
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)

    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      hooks: { hooks: { PreToolUse: [{ matcher: "*", body: "hook body" }] } },
      agents: [],
      commands: [],
      skills: [],
    }

    convertClaudeToGemini(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    console.warn = originalWarn
    expect(warnings.some((w) => w.includes("Gemini"))).toBe(true)
  })
})

describe("transformContentForGemini", () => {
  test("transforms .claude/ paths to .gemini/", () => {
    const result = transformContentForGemini("Read .claude/settings.json for config.")
    expect(result).toContain(".gemini/settings.json")
    expect(result).not.toContain(".claude/")
  })

  test("transforms ~/.claude/ paths to ~/.gemini/", () => {
    const result = transformContentForGemini("Check ~/.claude/config for settings.")
    expect(result).toContain("~/.gemini/config")
    expect(result).not.toContain("~/.claude/")
  })

  test("transforms Task agent(args) to natural language skill reference", () => {
    const input = `Run these:

- Task repo-research-analyst(feature_description)
- Task learnings-researcher(feature_description)

Task best-practices-researcher(topic)`

    const result = transformContentForGemini(input)
    expect(result).toContain("Use the repo-research-analyst skill to: feature_description")
    expect(result).toContain("Use the learnings-researcher skill to: feature_description")
    expect(result).toContain("Use the best-practices-researcher skill to: topic")
    expect(result).not.toContain("Task repo-research-analyst")
  })

  test("transforms namespaced Task agent calls using final segment", () => {
    const input = `Run agents:

- Task compound-engineering:research:repo-research-analyst(feature_description)
- Task compound-engineering:review:security-reviewer(code_diff)`

    const result = transformContentForGemini(input)
    expect(result).toContain("Use the repo-research-analyst skill to: feature_description")
    expect(result).toContain("Use the security-reviewer skill to: code_diff")
    expect(result).not.toContain("compound-engineering:")
  })

  test("transforms zero-argument Task calls", () => {
    const input = `- Task compound-engineering:review:code-simplicity-reviewer()`

    const result = transformContentForGemini(input)
    expect(result).toContain("Use the code-simplicity-reviewer skill")
    expect(result).not.toContain("compound-engineering:")
    expect(result).not.toContain("skill to:")
  })

  test("transforms @agent references to skill references", () => {
    const result = transformContentForGemini("Ask @security-sentinel for a review.")
    expect(result).toContain("the security-sentinel skill")
    expect(result).not.toContain("@security-sentinel")
  })
})

describe("toToml", () => {
  test("produces valid TOML with description and prompt", () => {
    const result = toToml("A description", "The prompt content")
    expect(result).toContain('description = "A description"')
    expect(result).toContain('prompt = """')
    expect(result).toContain("The prompt content")
    expect(result).toContain('"""')
  })

  test("escapes quotes in description", () => {
    const result = toToml('Say "hello"', "Prompt")
    expect(result).toContain('description = "Say \\"hello\\""')
  })

  test("escapes triple quotes in prompt", () => {
    const result = toToml("A command", 'Content with """ inside it')
    // Should not contain an unescaped """ that would close the TOML multi-line string prematurely
    // The prompt section should have the escaped version
    expect(result).toContain('description = "A command"')
    expect(result).toContain('prompt = """')
    // The inner """ should be escaped
    expect(result).not.toMatch(/""".*""".*"""/s) // Should not have 3 separate triple-quote sequences (open, content, close would make 3)
    // Verify it contains the escaped form
    expect(result).toContain('\\"\\"\\"')
  })
})
