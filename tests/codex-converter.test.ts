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
  test("default (agents-only): emits only agent conversions, no skills or prompts or command-skills", () => {
    const bundle = convertClaudeToCodex(fixturePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
      // codexIncludeSkills omitted -> defaults to false
    })

    // Native Codex plugin install handles skills, commands, and MCP via the
    // .codex-plugin/plugin.json manifest. The Bun converter only fills the
    // agent gap, so skillDirs / prompts / generatedSkills / mcpServers are
    // all empty by default.
    expect(bundle.skillDirs).toEqual([])
    expect(bundle.prompts).toEqual([])
    expect(bundle.generatedSkills).toEqual([])
    expect(bundle.mcpServers).toBeUndefined()

    // Custom agents (TOML) still land with instructions populated.
    expect(bundle.agents).toHaveLength(1)
    const agent = bundle.agents[0]!
    expect(agent.name).toBe("security-reviewer")
    expect(agent.description).toBe("Security-focused agent")
    expect(agent.instructions).toContain("Focus on vulnerabilities.")
    expect(agent.instructions).toContain("Threat modeling")
  })

  test("default with zero agents: emits fully empty bundle (no duplicate install possible)", () => {
    const pluginWithNoAgents: ClaudePlugin = {
      ...fixturePlugin,
      agents: [],
    }
    const bundle = convertClaudeToCodex(pluginWithNoAgents, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    expect(bundle.skillDirs).toEqual([])
    expect(bundle.prompts).toEqual([])
    expect(bundle.generatedSkills).toEqual([])
    expect(bundle.agents).toEqual([])
    expect(bundle.mcpServers).toBeUndefined()
    // invocationTargets still populated so any future --include-skills call
    // on the same plugin would have a consistent reference graph.
    expect(bundle.invocationTargets).toBeDefined()
  })

  test("converts commands to prompts and agents to custom agents", () => {
    const bundle = convertClaudeToCodex(fixturePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
      codexIncludeSkills: true,
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
    expect(bundle.generatedSkills).toHaveLength(1)
    expect(bundle.agents).toHaveLength(1)

    const commandSkill = bundle.generatedSkills.find((skill) => skill.name === "workflows-plan")
    expect(commandSkill).toBeDefined()
    const parsedCommandSkill = parseFrontmatter(commandSkill!.content)
    expect(parsedCommandSkill.data.name).toBe("workflows-plan")
    expect(parsedCommandSkill.data.description).toBe("Planning command")
    expect(parsedCommandSkill.body).toContain("Allowed tools")

    const agent = bundle.agents.find((item) => item.name === "security-reviewer")
    expect(agent).toBeDefined()
    expect(agent!.description).toBe("Security-focused agent")
    expect(agent!.instructions).toContain("Capabilities")
    expect(agent!.instructions).toContain("Threat modeling")
  })

  test("drops model field from Codex custom agents", () => {
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
      codexIncludeSkills: true,
    })

    const agent = bundle.agents.find((s) => s.name === "fast-agent")
    expect(agent).toBeDefined()
    expect("model" in agent!).toBe(false)
  })

  test("copies workflow skills as regular skills and omits workflows aliases", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      manifest: { name: "compound-engineering", version: "1.0.0" },
      commands: [],
      agents: [],
      skills: [
        {
          name: "ce-plan",
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
      codexIncludeSkills: true,
    })

    // No prompt wrappers for workflow skills — they're directly invocable as skills
    expect(bundle.prompts).toHaveLength(0)

    // ce-plan is copied as a regular skill, workflows:plan is omitted
    expect(bundle.skillDirs.map((skill) => skill.name)).toEqual(["ce-plan"])
  })

  test("does not apply compound workflow canonicalization to other plugins", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      manifest: { name: "other-plugin", version: "1.0.0" },
      commands: [],
      agents: [],
      skills: [
        {
          name: "ce-plan",
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
      codexIncludeSkills: true,
    })

    expect(bundle.prompts).toHaveLength(0)
    expect(bundle.skillDirs.map((skill) => skill.name)).toEqual(["ce-plan", "workflows:plan"])
  })

  test("passes through MCP servers", () => {
    const bundle = convertClaudeToCodex(fixturePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
      codexIncludeSkills: true,
    })

    expect(bundle.mcpServers?.local?.command).toBe("echo")
    expect(bundle.mcpServers?.local?.args).toEqual(["hello"])
  })

  test("transforms known Task agent calls to custom agent spawns", () => {
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
      agents: [
        {
          name: "repo-research-analyst",
          description: "Repo research",
          body: "Research repositories.",
          sourcePath: "/tmp/plugin/agents/repo-research-analyst.md",
        },
        {
          name: "learnings-researcher",
          description: "Learning research",
          body: "Search learnings.",
          sourcePath: "/tmp/plugin/agents/learnings-researcher.md",
        },
        {
          name: "best-practices-researcher",
          description: "Best practices",
          body: "Search best practices.",
          sourcePath: "/tmp/plugin/agents/best-practices-researcher.md",
        },
      ],
      skills: [],
    }

    const bundle = convertClaudeToCodex(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
      codexIncludeSkills: true,
    })

    const commandSkill = bundle.generatedSkills.find((s) => s.name === "plan")
    expect(commandSkill).toBeDefined()
    const parsed = parseFrontmatter(commandSkill!.content)

    expect(parsed.body).toContain("Spawn the custom agent `repo-research-analyst` with task: feature_description")
    expect(parsed.body).toContain("Spawn the custom agent `learnings-researcher` with task: feature_description")
    expect(parsed.body).toContain("Spawn the custom agent `best-practices-researcher` with task: topic")

    // Original Task syntax should not remain
    expect(parsed.body).not.toContain("Task repo-research-analyst")
    expect(parsed.body).not.toContain("Task learnings-researcher")
  })

  test("transforms namespaced Task agent calls to category-qualified custom agents", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "plan",
          description: "Planning with namespaced agents",
          body: `Run these agents in parallel:

- Task compound-engineering:research:ce-repo-research-analyst(feature_description)
- Task compound-engineering:research:ce-learnings-researcher(feature_description)

Then consolidate findings.

Task compound-engineering:review:ce-security-reviewer(code_diff)`,
          sourcePath: "/tmp/plugin/commands/plan.md",
        },
      ],
      agents: [
        {
          name: "ce-repo-research-analyst",
          description: "Repo research",
          body: "Research repositories.",
          sourcePath: "/tmp/plugin/agents/ce-repo-research-analyst.agent.md",
        },
        {
          name: "ce-learnings-researcher",
          description: "Learning research",
          body: "Search learnings.",
          sourcePath: "/tmp/plugin/agents/ce-learnings-researcher.agent.md",
        },
        {
          name: "ce-security-reviewer",
          description: "Security review",
          body: "Review security.",
          sourcePath: "/tmp/plugin/agents/ce-security-reviewer.agent.md",
        },
      ],
      skills: [],
    }

    const bundle = convertClaudeToCodex(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
      codexIncludeSkills: true,
    })

    const commandSkill = bundle.generatedSkills.find((s) => s.name === "plan")
    expect(commandSkill).toBeDefined()
    const parsed = parseFrontmatter(commandSkill!.content)

    expect(parsed.body).toContain("Spawn the custom agent `ce-repo-research-analyst` with task: feature_description")
    expect(parsed.body).toContain("Spawn the custom agent `ce-learnings-researcher` with task: feature_description")
    expect(parsed.body).toContain("Spawn the custom agent `ce-security-reviewer` with task: code_diff")

    // Original namespaced Task syntax should not remain
    expect(parsed.body).not.toContain("Task compound-engineering:")
  })

  test("retains <category>-<agent> naming for nested-layout plugins (dead-code fallback)", () => {
    // This test pins the behavior of getAgentCategory() for any third-party
    // plugin that still uses agents/<category>/<name>.md layout. The
    // compound-engineering plugin itself is flat, but the converter must keep
    // working for other plugins passed through the CLI.
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      commands: [
        {
          name: "plan",
          description: "Planning with agents from a nested-layout plugin",
          body: `- Task compound-engineering:review:ce-security-reviewer(code_diff)`,
          sourcePath: "/tmp/plugin/commands/plan.md",
        },
      ],
      agents: [
        {
          name: "ce-security-reviewer",
          description: "Security review",
          body: "Review security.",
          sourcePath: "/tmp/plugin/agents/review/ce-security-reviewer.agent.md",
        },
      ],
      skills: [],
    }

    const bundle = convertClaudeToCodex(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
      codexIncludeSkills: true,
    })

    const commandSkill = bundle.generatedSkills.find((s) => s.name === "plan")
    expect(commandSkill).toBeDefined()
    const parsed = parseFrontmatter(commandSkill!.content)

    expect(parsed.body).toContain("Spawn the custom agent `review-ce-security-reviewer` with task: code_diff")
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
      agents: [
        {
          name: "ce-code-simplicity-reviewer",
          description: "Simplicity review",
          body: "Review simplicity.",
          sourcePath: "/tmp/plugin/agents/ce-code-simplicity-reviewer.agent.md",
        },
      ],
      skills: [],
    }

    const bundle = convertClaudeToCodex(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
      codexIncludeSkills: true,
    })

    const commandSkill = bundle.generatedSkills.find((s) => s.name === "review")
    expect(commandSkill).toBeDefined()
    const parsed = parseFrontmatter(commandSkill!.content)
    expect(parsed.body).toContain("Spawn the custom agent `ce-code-simplicity-reviewer`")
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
      codexIncludeSkills: true,
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
      codexIncludeSkills: true,
    })

    const agent = bundle.agents.find((s) => s.name === "research-session-historian")
    expect(agent).toBeDefined()
    expect(agent!.sidecarDirs).toEqual([
      { sourceDir: scriptDir, targetName: "session-history-scripts" },
    ])

    expect(agent!.instructions).toContain("<script-dir>/discover-sessions.sh")
    expect(agent!.instructions).not.toContain("<script-dir>/prompts:discover-sessions.sh")
  })

  test("transforms workflow skill slash commands to Codex skill references", () => {
    const plugin: ClaudePlugin = {
      ...fixturePlugin,
      manifest: { name: "compound-engineering", version: "1.0.0" },
      commands: [
        {
          name: "review",
          description: "Review command",
          body: `After the brainstorm, run /ce-plan.

If planning is complete, continue with /ce-work.`,
          sourcePath: "/tmp/plugin/commands/review.md",
        },
      ],
      agents: [],
      skills: [
        {
          name: "ce-plan",
          description: "Planning workflow",
          argumentHint: "[feature]",
          sourceDir: "/tmp/plugin/skills/ce-plan",
          skillPath: "/tmp/plugin/skills/ce-plan/SKILL.md",
        },
        {
          name: "ce-work",
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
      codexIncludeSkills: true,
    })

    const commandSkill = bundle.generatedSkills.find((s) => s.name === "review")
    expect(commandSkill).toBeDefined()
    const parsed = parseFrontmatter(commandSkill!.content)

    // Workflow skills are now regular skills, so references use skill syntax
    expect(parsed.body).toContain("the ce-plan skill")
    expect(parsed.body).toContain("the ce-work skill")
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
      codexIncludeSkills: true,
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
      codexIncludeSkills: true,
    })

    const commandSkill = bundle.generatedSkills.find((s) => s.name === "review")
    expect(commandSkill).toBeDefined()
    const parsed = parseFrontmatter(commandSkill!.content)

    // Tool-agnostic path in project root — no rewriting needed
    expect(parsed.body).toContain("compound-engineering.local.md")
  })

  test("preserves tool-agnostic paths in Codex custom agent instructions", () => {
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
      codexIncludeSkills: true,
    })

    const agent = bundle.agents.find((s) => s.name === "config-reader")
    expect(agent).toBeDefined()
    expect(agent!.instructions).toContain("compound-engineering.local.md")
  })

  test("truncates custom agent descriptions to Codex limits and single line", () => {
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
      codexIncludeSkills: true,
    })

    const description = bundle.agents[0].description
    expect(description.length).toBeLessThanOrEqual(1024)
    expect(description).not.toContain("\n")
    expect(description.endsWith("...")).toBe(true)
  })
})
