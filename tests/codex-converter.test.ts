import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
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

  test("drops model field (Codex skill frontmatter does not support model)", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      agents: [
        {
          name: "fast-agent",
          description: "Fast agent",
          model: "sonnet",
          body: "Do things quickly.",
          sourcePath: "/tmp/plugin/agents/fast.md",
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

    const skill = bundle.generatedSkills.find((s) => s.name === "fast-agent")
    expect(parseFrontmatter(skill!.content).data.model).toBeUndefined()
  })

  test("generates prompt wrappers for canonical ce workflow skills and omits workflows aliases", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      manifest: { name: "compound-engineering", version: "1.0.0" },
      commands: [],
      agents: [],
      skills: [
        {
          name: "ce:plan",
          description: "Planning workflow",
          argumentHint: "[feature]",
          sourceDir: "/tmp/plugin/skills/ce-plan",
          skillPath: "/tmp/plugin/skills/ce-plan/SKILL.md",
        },
        {
          name: "workflows:plan",
          description: "Deprecated planning alias",
          argumentHint: "[feature]",
          sourceDir: "/tmp/plugin/skills/workflows-plan",
          skillPath: "/tmp/plugin/skills/workflows-plan/SKILL.md",
        },
      ],
    }

    const bundle = convertClaudeToCodex(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    expect(bundle.prompts).toHaveLength(1)
    expect(bundle.prompts[0]?.name).toBe("ce-plan")

    const parsedPrompt = parseFrontmatter(bundle.prompts[0]!.content)
    expect(parsedPrompt.data.description).toBe("Planning workflow")
    expect(parsedPrompt.data["argument-hint"]).toBe("[feature]")
    expect(parsedPrompt.body).toContain("Use the ce:plan skill")

    expect(bundle.skillDirs.map((skill) => skill.name)).toEqual(["ce:plan"])
  })

  test("does not apply compound workflow canonicalization to other plugins", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      manifest: { name: "other-plugin", version: "1.0.0" },
      commands: [],
      agents: [],
      skills: [
        {
          name: "ce:plan",
          description: "Custom CE-namespaced skill",
          argumentHint: "[feature]",
          sourceDir: "/tmp/plugin/skills/ce-plan",
          skillPath: "/tmp/plugin/skills/ce-plan/SKILL.md",
        },
        {
          name: "workflows:plan",
          description: "Custom workflows-namespaced skill",
          argumentHint: "[feature]",
          sourceDir: "/tmp/plugin/skills/workflows-plan",
          skillPath: "/tmp/plugin/skills/workflows-plan/SKILL.md",
        },
      ],
    }

    const bundle = convertClaudeToCodex(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    expect(bundle.prompts).toHaveLength(0)
    expect(bundle.skillDirs.map((skill) => skill.name)).toEqual(["ce:plan", "workflows:plan"])
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

  test("transforms namespaced Task agent calls to skill references using final segment", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "plan",
          description: "Planning with namespaced agents",
          body: `Run these agents in parallel:

- Task compound-engineering:research:repo-research-analyst(feature_description)
- Task compound-engineering:research:learnings-researcher(feature_description)

Then consolidate findings.

Task compound-engineering:review:security-reviewer(code_diff)`,
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

    // Namespaced Task calls should use only the final segment as the skill name
    expect(parsed.body).toContain("Use the $repo-research-analyst skill to: feature_description")
    expect(parsed.body).toContain("Use the $learnings-researcher skill to: feature_description")
    expect(parsed.body).toContain("Use the $security-reviewer skill to: code_diff")

    // Original namespaced Task syntax should not remain
    expect(parsed.body).not.toContain("Task compound-engineering:")
  })

  test("transforms zero-argument Task calls", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "review",
          description: "Review code",
          body: `- Task compound-engineering:review:code-simplicity-reviewer()`,
          sourcePath: "/tmp/plugin/commands/review.md",
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

    const commandSkill = bundle.generatedSkills.find((s) => s.name === "review")
    expect(commandSkill).toBeDefined()
    const parsed = parseFrontmatter(commandSkill!.content)
    expect(parsed.body).toContain("Use the $code-simplicity-reviewer skill")
    expect(parsed.body).not.toContain("compound-engineering:")
    expect(parsed.body).not.toContain("skill to:")
  })

  test("transforms slash commands to prompts syntax", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "plan",
          description: "Planning with commands",
          body: `After planning, you can:

1. Run /todo-resolve to enhance
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
    expect(parsed.body).toContain("/prompts:todo-resolve")
    expect(parsed.body).toContain("/prompts:plan_review")
    expect(parsed.body).toContain("/prompts:workflows-work")

    // File paths should NOT be transformed
    expect(parsed.body).toContain("/tmp/output.md")
    expect(parsed.body).toContain("/dev/null")
  })

  test("preserves agent script paths and tracks referenced sidecar directories", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-agent-sidecar-"))
    const agentDir = path.join(tempRoot, "agents", "research")
    const scriptDir = path.join(agentDir, "session-history-scripts")
    await fs.mkdir(scriptDir, { recursive: true })

    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [],
      skills: [],
      agents: [
        {
          name: "session-historian",
          description: "Session history research",
          body: [
            "Locate the `session-history-scripts/` directory.",
            "Run `bash <script-dir>/discover-sessions.sh repo 7`.",
          ].join("\n"),
          sourcePath: path.join(agentDir, "session-historian.md"),
        },
      ],
    }

    const bundle = convertClaudeToCodex(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const agentSkill = bundle.generatedSkills.find((s) => s.name === "session-historian")
    expect(agentSkill).toBeDefined()
    expect(agentSkill!.sidecarDirs).toEqual([
      { sourceDir: scriptDir, targetName: "session-history-scripts" },
    ])

    const parsed = parseFrontmatter(agentSkill!.content)
    expect(parsed.body).toContain("<script-dir>/discover-sessions.sh")
    expect(parsed.body).not.toContain("<script-dir>/prompts:discover-sessions.sh")
  })

  test("transforms canonical workflow slash commands to Codex prompt references", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      manifest: { name: "compound-engineering", version: "1.0.0" },
      commands: [
        {
          name: "review",
          description: "Review command",
          body: `After the brainstorm, run /ce:plan.

If planning is complete, continue with /ce:work.`,
          sourcePath: "/tmp/plugin/commands/review.md",
        },
      ],
      agents: [],
      skills: [
        {
          name: "ce:plan",
          description: "Planning workflow",
          argumentHint: "[feature]",
          sourceDir: "/tmp/plugin/skills/ce-plan",
          skillPath: "/tmp/plugin/skills/ce-plan/SKILL.md",
        },
        {
          name: "ce:work",
          description: "Implementation workflow",
          argumentHint: "[feature]",
          sourceDir: "/tmp/plugin/skills/ce-work",
          skillPath: "/tmp/plugin/skills/ce-work/SKILL.md",
        },
        {
          name: "workflows:work",
          description: "Deprecated implementation alias",
          argumentHint: "[feature]",
          sourceDir: "/tmp/plugin/skills/workflows-work",
          skillPath: "/tmp/plugin/skills/workflows-work/SKILL.md",
        },
      ],
    }

    const bundle = convertClaudeToCodex(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const commandSkill = bundle.generatedSkills.find((s) => s.name === "review")
    expect(commandSkill).toBeDefined()
    const parsed = parseFrontmatter(commandSkill!.content)

    expect(parsed.body).toContain("/prompts:ce-plan")
    expect(parsed.body).toContain("/prompts:ce-work")
    expect(parsed.body).not.toContain("the ce:plan skill")
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

  test("rewrites .claude/ paths to .codex/ in command skill bodies", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "review",
          description: "Review command",
          body: `Read \`compound-engineering.local.md\` in the project root.

If no settings file exists, auto-detect project type.

Run \`/compound-engineering-setup\` to create a settings file.`,
          sourcePath: "/tmp/plugin/commands/review.md",
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

    const commandSkill = bundle.generatedSkills.find((s) => s.name === "review")
    expect(commandSkill).toBeDefined()
    const parsed = parseFrontmatter(commandSkill!.content)

    // Tool-agnostic path in project root — no rewriting needed
    expect(parsed.body).toContain("compound-engineering.local.md")
  })

  test("rewrites .claude/ paths in agent skill bodies", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [],
      skills: [],
      agents: [
        {
          name: "config-reader",
          description: "Reads config",
          body: "Read `compound-engineering.local.md` for config.",
          sourcePath: "/tmp/plugin/agents/config-reader.md",
        },
      ],
    }

    const bundle = convertClaudeToCodex(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const agentSkill = bundle.generatedSkills.find((s) => s.name === "config-reader")
    expect(agentSkill).toBeDefined()
    const parsed = parseFrontmatter(agentSkill!.content)

    // Tool-agnostic path in project root — no rewriting needed
    expect(parsed.body).toContain("compound-engineering.local.md")
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
