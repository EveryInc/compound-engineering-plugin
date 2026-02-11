import { describe, expect, test } from "bun:test"
import { convertClaudeToDroid } from "../src/converters/claude-to-droid"
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
  mcpServers: undefined,
}

describe("convertClaudeToDroid", () => {
  test("flattens namespaced command names", () => {
    const bundle = convertClaudeToDroid(fixturePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    expect(bundle.commands).toHaveLength(1)
    const command = bundle.commands[0]
    expect(command.name).toBe("plan")

    const parsed = parseFrontmatter(command.content)
    expect(parsed.data.description).toBe("Planning command")
    expect(parsed.data["argument-hint"]).toBe("[FOCUS]")
    expect(parsed.body).toContain("Plan the work.")
  })

  test("converts agents to droids with frontmatter", () => {
    const bundle = convertClaudeToDroid(fixturePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    expect(bundle.droids).toHaveLength(1)
    const droid = bundle.droids[0]
    expect(droid.name).toBe("security-reviewer")

    const parsed = parseFrontmatter(droid.content)
    expect(parsed.data.name).toBe("security-reviewer")
    expect(parsed.data.description).toBe("Security-focused agent")
    expect(parsed.data.model).toBe("claude-sonnet-4-20250514")
    expect(parsed.body).toContain("Capabilities")
    expect(parsed.body).toContain("Threat modeling")
    expect(parsed.body).toContain("Focus on vulnerabilities.")
  })

  test("passes through skill directories", () => {
    const bundle = convertClaudeToDroid(fixturePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    expect(bundle.skillDirs).toHaveLength(1)
    expect(bundle.skillDirs[0].name).toBe("existing-skill")
    expect(bundle.skillDirs[0].sourceDir).toBe("/tmp/plugin/skills/existing-skill")
  })

  test("sets model to inherit when not specified", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        {
          name: "basic-agent",
          description: "Basic agent",
          model: "inherit",
          body: "Do things.",
          sourcePath: "/tmp/plugin/agents/basic.md",
        },
      ],
    }

    const bundle = convertClaudeToDroid(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const parsed = parseFrontmatter(bundle.droids[0].content)
    expect(parsed.data.model).toBe("inherit")
  })

  test("transforms Task agent calls to droid-compatible syntax", () => {
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

    const bundle = convertClaudeToDroid(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const parsed = parseFrontmatter(bundle.commands[0].content)
    expect(parsed.body).toContain("Task repo-research-analyst: feature_description")
    expect(parsed.body).toContain("Task learnings-researcher: feature_description")
    expect(parsed.body).toContain("Task best-practices-researcher: topic")
    expect(parsed.body).not.toContain("Task repo-research-analyst(")
  })

  test("transforms slash commands by flattening namespaces", () => {
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

    const bundle = convertClaudeToDroid(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const parsed = parseFrontmatter(bundle.commands[0].content)
    expect(parsed.body).toContain("/deepen-plan")
    expect(parsed.body).toContain("/plan_review")
    expect(parsed.body).toContain("/work")
    expect(parsed.body).not.toContain("/workflows:work")
    // File paths should NOT be transformed
    expect(parsed.body).toContain("/tmp/output.md")
    expect(parsed.body).toContain("/dev/null")
  })

  test("transforms @agent references to droid references", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "review",
          description: "Review command",
          body: "Have @agent-dhh-rails-reviewer and @agent-security-sentinel review the code.",
          sourcePath: "/tmp/plugin/commands/review.md",
        },
      ],
      agents: [],
      skills: [],
    }

    const bundle = convertClaudeToDroid(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const parsed = parseFrontmatter(bundle.commands[0].content)
    expect(parsed.body).toContain("the dhh-rails-reviewer droid")
    expect(parsed.body).toContain("the security-sentinel droid")
    expect(parsed.body).not.toContain("@agent-")
  })

  test("preserves disable-model-invocation on commands", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "disabled-cmd",
          description: "Disabled command",
          disableModelInvocation: true,
          body: "Body.",
          sourcePath: "/tmp/plugin/commands/disabled.md",
        },
      ],
      agents: [],
      skills: [],
    }

    const bundle = convertClaudeToDroid(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const parsed = parseFrontmatter(bundle.commands[0].content)
    expect(parsed.data["disable-model-invocation"]).toBe(true)
  })

  test("handles multiple commands including nested and top-level", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "workflows:plan",
          description: "Plan",
          body: "Plan body.",
          sourcePath: "/tmp/plugin/commands/workflows/plan.md",
        },
        {
          name: "workflows:work",
          description: "Work",
          body: "Work body.",
          sourcePath: "/tmp/plugin/commands/workflows/work.md",
        },
        {
          name: "changelog",
          description: "Changelog",
          body: "Changelog body.",
          sourcePath: "/tmp/plugin/commands/changelog.md",
        },
      ],
      agents: [],
      skills: [],
    }

    const bundle = convertClaudeToDroid(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const names = bundle.commands.map((c) => c.name)
    expect(names).toEqual(["plan", "work", "changelog"])
  })
})
