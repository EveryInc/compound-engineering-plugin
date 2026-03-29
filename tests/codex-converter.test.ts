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

  // -- Hook conversion tests --

  const defaultOpts = { agentMode: "subagent" as const, inferTemperature: false, permissions: "none" as const }

  function pluginWithHooks(hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command?: string; timeout?: number; prompt?: string; agent?: string }> }>>): ClaudePlugin {
    return {
      ...fixturePlugin,
      commands: [],
      agents: [],
      skills: [],
      hooks: { hooks: hooks as any },
    }
  }

  test("converts PreToolUse Bash hooks to Codex format", () => {
    const plugin = pluginWithHooks({
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo before", timeout: 30 }] }],
    })

    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)
    try {
      const bundle = convertClaudeToCodex(plugin, defaultOpts)
      expect(bundle.hooks?.PreToolUse).toHaveLength(1)
      expect(bundle.hooks!.PreToolUse![0].matcher).toBe("Bash")
      expect(bundle.hooks!.PreToolUse![0].hooks).toHaveLength(1)
      expect(bundle.hooks!.PreToolUse![0].hooks[0].command).toBe("echo before")
      expect(bundle.hooks!.PreToolUse![0].hooks[0].timeout).toBe(30)
    } finally {
      console.warn = originalWarn
    }
  })

  test("converts non-tool-scoped events without matcher", () => {
    const plugin = pluginWithHooks({
      UserPromptSubmit: [{ matcher: "*", hooks: [{ type: "command", command: "echo prompt" }] }],
    })

    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)
    try {
      const bundle = convertClaudeToCodex(plugin, defaultOpts)
      expect(bundle.hooks?.UserPromptSubmit).toHaveLength(1)
      expect(bundle.hooks!.UserPromptSubmit![0].matcher).toBeUndefined()
      expect(bundle.hooks!.UserPromptSubmit![0].hooks).toHaveLength(1)
      expect(bundle.hooks!.UserPromptSubmit![0].hooks[0].command).toBe("echo prompt")
    } finally {
      console.warn = originalWarn
    }
  })

  test("converts all 5 supported events", () => {
    const plugin = pluginWithHooks({
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo pre" }] }],
      PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo post" }] }],
      UserPromptSubmit: [{ hooks: [{ type: "command", command: "echo prompt" }] }],
      SessionStart: [{ hooks: [{ type: "command", command: "echo start" }] }],
      Stop: [{ hooks: [{ type: "command", command: "echo stop" }] }],
    })

    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)
    try {
      const bundle = convertClaudeToCodex(plugin, defaultOpts)
      expect(bundle.hooks?.PreToolUse).toBeDefined()
      expect(bundle.hooks?.PostToolUse).toBeDefined()
      expect(bundle.hooks?.UserPromptSubmit).toBeDefined()
      expect(bundle.hooks?.SessionStart).toBeDefined()
      expect(bundle.hooks?.Stop).toBeDefined()
    } finally {
      console.warn = originalWarn
    }
  })

  test("skips non-Bash matcher on tool-scoped event with warning", () => {
    const plugin = pluginWithHooks({
      PreToolUse: [{ matcher: "Write|Edit", hooks: [{ type: "command", command: "echo test" }] }],
    })

    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)
    try {
      const bundle = convertClaudeToCodex(plugin, defaultOpts)
      expect(bundle.hooks).toBeUndefined()
      expect(warnings.some((w) => w.includes("Write|Edit"))).toBe(true)
    } finally {
      console.warn = originalWarn
    }
  })

  test("skips prompt and agent type hooks with warnings", () => {
    const plugin = pluginWithHooks({
      PostToolUse: [{ matcher: "Bash", hooks: [
        { type: "prompt", prompt: "review" },
        { type: "agent", agent: "reviewer" },
        { type: "command", command: "echo test" },
      ] }],
    })

    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)
    try {
      const bundle = convertClaudeToCodex(plugin, defaultOpts)
      expect(bundle.hooks?.PostToolUse).toHaveLength(1)
      expect(bundle.hooks!.PostToolUse![0].hooks).toHaveLength(1)
      expect(bundle.hooks!.PostToolUse![0].hooks[0].command).toBe("echo test")
      expect(warnings.some((w) => w.includes("prompt"))).toBe(true)
      expect(warnings.some((w) => w.includes("agent"))).toBe(true)
    } finally {
      console.warn = originalWarn
    }
  })

  test("skips unsupported events with warnings", () => {
    const plugin = pluginWithHooks({
      PostToolUseFailure: [{ hooks: [{ type: "command", command: "echo fail" }] }],
      PermissionRequest: [{ hooks: [{ type: "command", command: "echo perm" }] }],
      Notification: [{ hooks: [{ type: "command", command: "echo notify" }] }],
    })

    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)
    try {
      const bundle = convertClaudeToCodex(plugin, defaultOpts)
      expect(bundle.hooks).toBeUndefined()
      const unsupportedWarnings = warnings.filter((w) => w.includes("does not support"))
      expect(unsupportedWarnings).toHaveLength(3)
    } finally {
      console.warn = originalWarn
    }
  })

  test("returns undefined hooks when plugin has no hooks", () => {
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)
    try {
      const bundle = convertClaudeToCodex(fixturePlugin, defaultOpts)
      expect(bundle.hooks).toBeUndefined()
      expect(warnings).toHaveLength(0)
    } finally {
      console.warn = originalWarn
    }
  })

  test("returns undefined hooks when all hooks are unconvertible", () => {
    const plugin = pluginWithHooks({
      Notification: [{ hooks: [{ type: "prompt", prompt: "notify" }] }],
      SubagentStart: [{ hooks: [{ type: "agent", agent: "sub" }] }],
    })

    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)
    try {
      const bundle = convertClaudeToCodex(plugin, defaultOpts)
      expect(bundle.hooks).toBeUndefined()
      expect(warnings.length).toBeGreaterThan(0)
    } finally {
      console.warn = originalWarn
    }
  })

  test("preserves timeout field", () => {
    const plugin = pluginWithHooks({
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo timed", timeout: 30 }] }],
    })

    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)
    try {
      const bundle = convertClaudeToCodex(plugin, defaultOpts)
      expect(bundle.hooks?.PreToolUse?.[0]?.hooks[0]?.timeout).toBe(30)
    } finally {
      console.warn = originalWarn
    }
  })

  test("converts wildcard matcher on tool-scoped event", () => {
    const plugin = pluginWithHooks({
      PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "echo test" }] }],
    })

    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)
    try {
      const bundle = convertClaudeToCodex(plugin, defaultOpts)
      expect(bundle.hooks?.PreToolUse).toBeDefined()
      expect(bundle.hooks!.PreToolUse![0].matcher).toBe("Bash")
    } finally {
      console.warn = originalWarn
    }
  })

  test("isBashCompatibleMatcher allows compatible matchers and rejects others", () => {
    const compatibleMatchers = [undefined, "*", "", "Bash", "^Bash$"]
    const incompatibleMatchers = ["Write|Edit", "Bash|Write", "Read"]

    for (const matcher of compatibleMatchers) {
      const plugin = pluginWithHooks({
        PreToolUse: [{ matcher, hooks: [{ type: "command", command: "echo test" }] }],
      })

      const warnings: string[] = []
      const originalWarn = console.warn
      console.warn = (msg: string) => warnings.push(msg)
      try {
        const bundle = convertClaudeToCodex(plugin, defaultOpts)
        expect(bundle.hooks?.PreToolUse).toBeDefined()
      } finally {
        console.warn = originalWarn
      }
    }

    for (const matcher of incompatibleMatchers) {
      const plugin = pluginWithHooks({
        PreToolUse: [{ matcher, hooks: [{ type: "command", command: "echo test" }] }],
      })

      const warnings: string[] = []
      const originalWarn = console.warn
      console.warn = (msg: string) => warnings.push(msg)
      try {
        const bundle = convertClaudeToCodex(plugin, defaultOpts)
        expect(bundle.hooks).toBeUndefined()
        expect(warnings.some((w) => w.includes(matcher))).toBe(true)
      } finally {
        console.warn = originalWarn
      }
    }
  })

  test("emits PreToolUse deny-only warning", () => {
    const plugin = pluginWithHooks({
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo check" }] }],
    })

    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)
    try {
      convertClaudeToCodex(plugin, defaultOpts)
      expect(warnings.some((w) => w.includes("deny decisions"))).toBe(true)
    } finally {
      console.warn = originalWarn
    }
  })
})
