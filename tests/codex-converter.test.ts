import { describe, expect, test } from "bun:test"
import { convertClaudeToCodex } from "../src/converters/claude-to-codex"
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

describe("convertClaudeToCodex", () => {
  test("converts commands to prompts and agents to skills", () => {
    const bundle = convertClaudeToCodex(fixturePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    expect(bundle.prompts).toHaveLength(1)
    const prompt = bundle.prompts[0]
    expect(prompt.name).toBe("workflows-plan")

    const parsedPrompt = parseFrontmatter(prompt.content)
    expect(parsedPrompt.data.description).toBe("Planning command")
    expect(parsedPrompt.data["argument-hint"]).toBe("[FOCUS]")
    expect(parsedPrompt.body).toContain("$workflows-plan")
    expect(parsedPrompt.body).toContain("Plan the work.")

    expect(bundle.skillDirs[0]?.name).toBe("existing-skill")
    expect(bundle.generatedSkills).toHaveLength(2)

    const commandSkill = bundle.generatedSkills.find((skill) => skill.name === "workflows-plan")
    expect(commandSkill).toBeDefined()
    const parsedCommandSkill = parseFrontmatter(commandSkill!.content)
    expect(parsedCommandSkill.data.name).toBe("workflows-plan")
    expect(parsedCommandSkill.data.description).toBe("Planning command")
    expect(parsedCommandSkill.body).toContain("Allowed tools")

    const agentSkill = bundle.generatedSkills.find((skill) => skill.name === "security-reviewer")
    expect(agentSkill).toBeDefined()
    const parsedSkill = parseFrontmatter(agentSkill!.content)
    expect(parsedSkill.data.name).toBe("security-reviewer")
    expect(parsedSkill.data.description).toBe("Security-focused agent")
    expect(parsedSkill.body).toContain("Capabilities")
    expect(parsedSkill.body).toContain("Threat modeling")
  })

  test("passes through MCP servers", () => {
    const bundle = convertClaudeToCodex(fixturePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    expect(bundle.mcpServers?.local?.command).toBe("echo")
    expect(bundle.mcpServers?.local?.args).toEqual(["hello"])
  })

  test("transforms Task agent calls to skill references", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "plan",
          description: "Planning with agents",
          body: `Run these agents in parallel:

- Task repo-research-analyst(feature_description)
- Task learnings-researcher(feature_description)

Then consolidate findings.

Task best-practices-researcher(topic)`,
          sourcePath: "/tmp/plugin/commands/plan.md",
        },
      ],
      agents: [],
      skills: [],
    }

    const bundle = convertClaudeToCodex(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const commandSkill = bundle.generatedSkills.find((s) => s.name === "plan")
    expect(commandSkill).toBeDefined()
    const parsed = parseFrontmatter(commandSkill!.content)

    // Task calls should be transformed to skill references
    expect(parsed.body).toContain("Use the $repo-research-analyst skill to: feature_description")
    expect(parsed.body).toContain("Use the $learnings-researcher skill to: feature_description")
    expect(parsed.body).toContain("Use the $best-practices-researcher skill to: topic")

    // Original Task syntax should not remain
    expect(parsed.body).not.toContain("Task repo-research-analyst")
    expect(parsed.body).not.toContain("Task learnings-researcher")
  })

  test("transforms slash commands to prompts syntax", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "plan",
          description: "Planning with commands",
          body: `After planning, you can:

1. Run /deepen-plan to enhance
2. Run /plan_review for feedback
3. Start /workflows:work to implement

Don't confuse with file paths like /tmp/output.md or /dev/null.`,
          sourcePath: "/tmp/plugin/commands/plan.md",
        },
      ],
      agents: [],
      skills: [],
    }

    const bundle = convertClaudeToCodex(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const commandSkill = bundle.generatedSkills.find((s) => s.name === "plan")
    expect(commandSkill).toBeDefined()
    const parsed = parseFrontmatter(commandSkill!.content)

    // Slash commands should be transformed to /prompts: syntax
    expect(parsed.body).toContain("/prompts:deepen-plan")
    expect(parsed.body).toContain("/prompts:plan_review")
    expect(parsed.body).toContain("/prompts:workflows-work")

    // File paths should NOT be transformed
    expect(parsed.body).toContain("/tmp/output.md")
    expect(parsed.body).toContain("/dev/null")
  })

  test("excludes commands with disable-model-invocation from prompts and skills", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "normal-command",
          description: "Normal command",
          body: "Normal body.",
          sourcePath: "/tmp/plugin/commands/normal.md",
        },
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

    const bundle = convertClaudeToCodex(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    // Only normal command should produce a prompt
    expect(bundle.prompts).toHaveLength(1)
    expect(bundle.prompts[0].name).toBe("normal-command")

    // Only normal command should produce a generated skill
    const commandSkills = bundle.generatedSkills.filter((s) => s.name === "normal-command" || s.name === "disabled-command")
    expect(commandSkills).toHaveLength(1)
    expect(commandSkills[0].name).toBe("normal-command")
  })

  test("truncates generated skill descriptions to Codex limits and single line", () => {
    const longDescription = `Line one\nLine two ${"a".repeat(2000)}`
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        {
          name: "Long Description Agent",
          description: longDescription,
          body: "Body",
          sourcePath: "/tmp/plugin/agents/long.md",
        },
      ],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToCodex(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const generated = bundle.generatedSkills[0]
    const parsed = parseFrontmatter(generated.content)
    const description = String(parsed.data.description ?? "")
    expect(description.length).toBeLessThanOrEqual(1024)
    expect(description).not.toContain("\n")
    expect(description.endsWith("...")).toBe(true)
  })
})
