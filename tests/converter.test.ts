import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import { loadClaudePlugin } from "../src/parsers/claude"
import { convertClaudeToOpenCode, transformSkillContentForOpenCode } from "../src/converters/claude-to-opencode"
import { parseFrontmatter } from "../src/utils/frontmatter"
import type { ClaudePlugin } from "../src/types/claude"

const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")
const compoundEngineeringRoot = path.join(import.meta.dir, "..")

describe("convertClaudeToOpenCode", () => {
  test("current compound-engineering output is skills only, no standalone agents, with one command stub per skill", async () => {
    const plugin = await loadClaudePlugin(compoundEngineeringRoot)
    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: true,
      permissions: "none",
    })

    expect(bundle.agents).toHaveLength(0)
    expect(bundle.skillDirs.length).toBeGreaterThan(0)
    // Each user-invocable skill now also generates a slash-command stub
    // (skills with disable-model-invocation or user-invocable: false are excluded).
    expect(bundle.commandFiles.length).toBeGreaterThan(0)
    expect(bundle.commandFiles.length).toBeLessThanOrEqual(bundle.skillDirs.length)
    expect(bundle.plugins).toHaveLength(0)
    expect(bundle.config.tools).toBeUndefined()
  })

  test("skills generate slash-command stubs with description and argument-hint frontmatter", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)
    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const cmd = bundle.commandFiles.find((f) => f.name === "skill-one")
    expect(cmd).toBeDefined()
    const parsed = parseFrontmatter(cmd!.content)
    expect(parsed.data.description).toBe("Sample skill")
    expect(parsed.body.trim()).toContain("skill-one")
    expect(parsed.body.trim()).toContain("$ARGUMENTS")

    // disabled-skill (disable-model-invocation) is user-invocation-only, so it
    // still gets a slash command -- that's its only entry point.
    expect(bundle.commandFiles.find((f) => f.name === "disabled-skill")).toBeDefined()
    // claude-only-skill is platform-filtered before convertSkillsToCommands -- absent
    expect(bundle.commandFiles.find((f) => f.name === "claude-only-skill")).toBeUndefined()
    // agent-only-skill has user-invocable: false -- must not be exposed as a slash command
    expect(bundle.commandFiles.find((f) => f.name === "agent-only-skill")).toBeUndefined()
  })

  test("no command name is emitted more than once", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)
    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const names = bundle.commandFiles.map((f) => f.name)
    const uniqueNames = new Set(names)
    expect(names.length).toBe(uniqueNames.size)
  })

  test("explicit command foo:bar blocks skill stub foo/bar from being emitted", async () => {
    // "foo:bar" (explicit command) and "foo/bar" (skill name) both normalize to
    // the same on-disk path commands/foo/bar.md -- the skill stub must be dropped.
    const plugin: ClaudePlugin = {
      root: "/tmp/fake-plugin",
      manifest: { name: "test-plugin", version: "1.0.0", description: "" },
      agents: [],
      commands: [{ name: "foo:bar", description: "explicit", body: "explicit body", sourcePath: "/tmp/fake-plugin/commands/foo/bar.md" }],
      skills: [
        {
          name: "foo/bar",
          description: "skill",
          sourceDir: "/tmp/fake-plugin/skills/foo-bar",
          skillPath: "/tmp/fake-plugin/skills/foo-bar/SKILL.md",
        },
      ],
      mcpServers: undefined,
      hooks: undefined,
    }
    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const fooBarCommands = bundle.commandFiles.filter((f) =>
      f.name === "foo:bar" || f.name === "foo/bar",
    )
    // Only the explicit command should survive
    expect(fooBarCommands).toHaveLength(1)
    expect(fooBarCommands[0].name).toBe("foo:bar")
    expect(fooBarCommands[0].content).toContain("explicit body")
  })

  test("from-commands mode: skill tool is allowed when skill stubs are emitted", async () => {
    // Regression: applyPermissions only scanned plugin.commands for allowedTools,
    // so a plugin with no explicit commands (or none listing "skill") would get
    // permission.skill = "deny", causing every generated stub to fail immediately.
    const plugin = await loadClaudePlugin(fixtureRoot)
    // Build a minimal plugin with skills but no explicit commands.
    const skillOnlyPlugin: ClaudePlugin = {
      ...plugin,
      commands: [],
    }
    const bundle = convertClaudeToOpenCode(skillOnlyPlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "from-commands",
    })

    // Skill stubs should be emitted (skill-one is opencode-eligible)
    expect(bundle.commandFiles.some((f) => f.name === "skill-one")).toBe(true)

    // The skill tool must be allowed so the stubs can actually load the skill
    const permission = bundle.config.permission as Record<string, string>
    expect(permission.skill).toBe("allow")
  })

  test("from-commands mode: patterned skill(...) rule does not block other skill stubs", async () => {
    // Regression: when a command uses skill(foo-*), patterns["skill"] is populated,
    // causing the permission build to emit { "*": "deny", "foo-*": "allow" }.
    // That blocks all stubs for skills outside the pattern even though hasSkillStubs
    // forces enabled.add("skill"). The fix clears patterns["skill"] when hasSkillStubs is true.
    const plugin = await loadClaudePlugin(fixtureRoot)
    // The fixture has skill-command.md with allowed-tools: Skill(create-agent-skills).
    // skill-one is the stub-eligible skill -- it is NOT in the patterned subset.
    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "from-commands",
    })

    expect(bundle.commandFiles.some((f) => f.name === "skill-one")).toBe(true)

    // skill must be a flat "allow", not a pattern object that would deny skill-one
    const permission = bundle.config.permission as Record<string, string | Record<string, string>>
    expect(permission.skill).toBe("allow")
  })

  test("from-command mode: map allowedTools to global permission block", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)
    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "from-commands",
    })

    expect(bundle.config.command).toBeUndefined()
    expect(bundle.config.tools).toBeUndefined()
    expect(bundle.commandFiles.find((f) => f.name === "workflows:review")).toBeDefined()
    expect(bundle.commandFiles.find((f) => f.name === "plan_review")).toBeDefined()

    const permission = bundle.config.permission as Record<string, string | Record<string, string>>
    expect(Object.keys(permission).sort()).toEqual([
      "bash",
      "edit",
      "glob",
      "grep",
      "list",
      "patch",
      "question",
      "read",
      "skill",
      "task",
      "todoread",
      "todowrite",
      "webfetch",
      "write",
    ])
    expect(permission.edit).toBe("allow")
    expect(permission.write).toBe("allow")
    const bashPermission = permission.bash as Record<string, string>
    expect(bashPermission["ls *"]).toBe("allow")
    expect(bashPermission["git *"]).toBe("allow")
    expect(permission.webfetch).toBe("allow")

    const readPermission = permission.read as Record<string, string>
    expect(readPermission["*"]).toBe("deny")
    expect(readPermission[".env"]).toBe("allow")

    expect(permission.question).toBe("allow")
    expect(permission.todowrite).toBe("allow")
    expect(permission.todoread).toBe("allow")

    const agentFile = bundle.agents.find((agent) => agent.name === "repo-research-analyst")
    expect(agentFile).toBeDefined()
    const parsed = parseFrontmatter(agentFile!.content)
    expect(parsed.data.mode).toBe("subagent")
  })

  test("normalizes models and infers temperature", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)
    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "primary",
      inferTemperature: true,
      permissions: "none",
    })

    const securityAgent = bundle.agents.find((agent) => agent.name === "security-sentinel")
    expect(securityAgent).toBeDefined()
    const parsed = parseFrontmatter(securityAgent!.content)
    expect(parsed.data.model).toBe("anthropic/claude-sonnet-4-20250514")
    expect(parsed.data.temperature).toBe(0.1)

    const modelCommand = bundle.commandFiles.find((f) => f.name === "workflows:work")
    expect(modelCommand).toBeDefined()
    const commandParsed = parseFrontmatter(modelCommand!.content)
    expect(commandParsed.data.model).toBe("openai/gpt-4o")
  })

  test("resolves bare Claude model aliases for primary agents", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/plugin",
      manifest: { name: "fixture", version: "1.0.0" },
      agents: [
        {
          name: "cheap-agent",
          description: "Agent using bare alias",
          body: "Test agent.",
          sourcePath: "/tmp/plugin/agents/cheap-agent.md",
          model: "haiku",
        },
      ],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "primary",
      inferTemperature: false,
      permissions: "none",
    })

    const agent = bundle.agents.find((a) => a.name === "cheap-agent")
    expect(agent).toBeDefined()
    const parsed = parseFrontmatter(agent!.content)
    expect(parsed.data.model).toBe("anthropic/claude-haiku-4-5")
  })

  test("suppresses inferred temperature for primary agents on sampling-param-rejecting models", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/plugin",
      manifest: { name: "fixture", version: "1.0.0" },
      agents: [
        {
          name: "security-guardian",
          description: "Reviews code for security issues",
          body: "Test agent.",
          sourcePath: "/tmp/plugin/agents/security-guardian.md",
          model: "sonnet",
        },
        {
          name: "haiku-guardian",
          description: "Reviews code cheaply",
          body: "Test agent.",
          sourcePath: "/tmp/plugin/agents/haiku-guardian.md",
          model: "haiku",
        },
      ],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "primary",
      inferTemperature: true,
      permissions: "none",
    })

    // Sonnet 5 rejects non-default temperature with HTTP 400, so the converter
    // must write the model but omit the inferred temperature.
    const sonnetAgent = parseFrontmatter(bundle.agents.find((a) => a.name === "security-guardian")!.content)
    expect(sonnetAgent.data.model).toBe("anthropic/claude-sonnet-5")
    expect(sonnetAgent.data.temperature).toBeUndefined()

    // Haiku still accepts sampling params, so temperature is inferred as usual.
    const haikuAgent = parseFrontmatter(bundle.agents.find((a) => a.name === "haiku-guardian")!.content)
    expect(haikuAgent.data.model).toBe("anthropic/claude-haiku-4-5")
    expect(haikuAgent.data.temperature).toBe(0.1)
  })

  test("omits model for subagents to allow provider inheritance (#477)", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/plugin",
      manifest: { name: "fixture", version: "1.0.0" },
      agents: [
        {
          name: "cheap-agent",
          description: "Agent using bare alias",
          body: "Test agent.",
          sourcePath: "/tmp/plugin/agents/cheap-agent.md",
          model: "haiku",
        },
      ],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const agent = bundle.agents.find((a) => a.name === "cheap-agent")
    expect(agent).toBeDefined()
    const parsed = parseFrontmatter(agent!.content)
    expect(parsed.data.model).toBeUndefined()
  })

  test("omits model when agent has no model field regardless of mode", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/plugin",
      manifest: { name: "fixture", version: "1.0.0" },
      agents: [
        {
          name: "no-model-agent",
          description: "Agent without model",
          body: "Test agent.",
          sourcePath: "/tmp/plugin/agents/no-model-agent.md",
        },
      ],
      commands: [],
      skills: [],
    }

    for (const mode of ["primary", "subagent"] as const) {
      const bundle = convertClaudeToOpenCode(plugin, {
        agentMode: mode,
        inferTemperature: false,
        permissions: "none",
      })
      const agent = bundle.agents.find((a) => a.name === "no-model-agent")
      const parsed = parseFrontmatter(agent!.content)
      expect(parsed.data.model).toBeUndefined()
    }
  })

  test("omits model: inherit even in primary mode", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/plugin",
      manifest: { name: "fixture", version: "1.0.0" },
      agents: [
        {
          name: "inherit-agent",
          description: "Agent with inherit model",
          body: "Test agent.",
          sourcePath: "/tmp/plugin/agents/inherit-agent.md",
          model: "inherit",
        },
      ],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "primary",
      inferTemperature: false,
      permissions: "none",
    })

    const agent = bundle.agents.find((a) => a.name === "inherit-agent")
    const parsed = parseFrontmatter(agent!.content)
    expect(parsed.data.model).toBeUndefined()
  })

  test("converts hooks into plugin file", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)
    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const hookFile = bundle.plugins.find((file) => file.name === "converted-hooks.ts")
    expect(hookFile).toBeDefined()
    expect(hookFile!.content).toContain("\"tool.execute.before\"")
    expect(hookFile!.content).toContain("\"tool.execute.after\"")
    expect(hookFile!.content).toContain("\"session.created\"")
    expect(hookFile!.content).toContain("\"session.deleted\"")
    expect(hookFile!.content).toContain("\"session.idle\"")
    expect(hookFile!.content).toContain("\"experimental.session.compacting\"")
    expect(hookFile!.content).toContain("\"permission.requested\"")
    expect(hookFile!.content).toContain("\"permission.replied\"")
    expect(hookFile!.content).toContain("\"message.created\"")
    expect(hookFile!.content).toContain("\"message.updated\"")
    expect(hookFile!.content).toContain("echo before")
    expect(hookFile!.content).toContain("echo before two")
    expect(hookFile!.content).toContain("// timeout: 30s")
    expect(hookFile!.content).toContain("// Prompt hook for Write|Edit")
    expect(hookFile!.content).toContain("// Agent hook for Write|Edit: security-sentinel")

    // PreToolUse (tool.execute.before) handlers are wrapped in try-catch
    // to prevent hook failures from crashing parallel tool call batches (#85)
    const beforeIdx = hookFile!.content.indexOf('"tool.execute.before"')
    const afterIdx = hookFile!.content.indexOf('"tool.execute.after"')
    const beforeBlock = hookFile!.content.slice(beforeIdx, afterIdx)
    expect(beforeBlock).toContain("try {")
    expect(beforeBlock).toContain("} catch (err) {")

    // PostToolUse (tool.execute.after) handlers are NOT wrapped in try-catch
    const afterBlock = hookFile!.content.slice(afterIdx, hookFile!.content.indexOf('"session.created"'))
    expect(afterBlock).not.toContain("try {")
  })

  test("converts MCP servers", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)
    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const mcp = bundle.config.mcp ?? {}
    expect(mcp["local-tooling"]).toEqual({
      type: "local",
      command: ["echo", "fixture"],
      environment: undefined,
      enabled: true,
    })
    expect(mcp.context7).toEqual({
      type: "remote",
      url: "https://mcp.context7.com/mcp",
      headers: undefined,
      enabled: true,
    })
  })

  test("permission modes set expected keys", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)
    const noneBundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })
    expect(noneBundle.config.permission).toBeUndefined()

    const broadBundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "broad",
    })
    expect(broadBundle.config.tools).toBeUndefined()
    expect(broadBundle.config.permission).toEqual({
      read: "allow",
      write: "allow",
      edit: "allow",
      bash: "allow",
      grep: "allow",
      glob: "allow",
      list: "allow",
      webfetch: "allow",
      skill: "allow",
      patch: "allow",
      task: "allow",
      question: "allow",
      todowrite: "allow",
      todoread: "allow",
    })
  })

  test("supports primary agent mode", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)
    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "primary",
      inferTemperature: false,
      permissions: "none",
    })

    const agentFile = bundle.agents.find((agent) => agent.name === "repo-research-analyst")
    const parsed = parseFrontmatter(agentFile!.content)
    expect(parsed.data.mode).toBe("primary")
  })

  test("excludes commands with disable-model-invocation from commandFiles", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)
    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    // deploy-docs has disable-model-invocation: true, should be excluded
    expect(bundle.commandFiles.find((f) => f.name === "deploy-docs")).toBeUndefined()

    // Normal commands should still be present
    expect(bundle.commandFiles.find((f) => f.name === "workflows:review")).toBeDefined()
  })

  test("rewrites .claude/ paths to .opencode/ in command bodies", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/plugin",
      manifest: { name: "fixture", version: "1.0.0" },
      agents: [],
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
      skills: [],
    }

    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const commandFile = bundle.commandFiles.find((f) => f.name === "review")
    expect(commandFile).toBeDefined()

    // Tool-agnostic path in project root — no rewriting needed
    expect(commandFile!.content).toContain("compound-engineering.local.md")
  })

  test("rewrites .claude/ paths in agent bodies", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/plugin",
      manifest: { name: "fixture", version: "1.0.0" },
      agents: [
        {
          name: "test-agent",
          description: "Test agent",
          body: "Read `compound-engineering.local.md` for config.",
          sourcePath: "/tmp/plugin/agents/test-agent.md",
        },
      ],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const agentFile = bundle.agents.find((a) => a.name === "test-agent")
    expect(agentFile).toBeDefined()
    // Tool-agnostic path in project root — no rewriting needed
    expect(agentFile!.content).toContain("compound-engineering.local.md")
  })

  test("command .md files include description in frontmatter", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/plugin",
      manifest: { name: "fixture", version: "1.0.0" },
      agents: [],
      commands: [
        {
          name: "test-cmd",
          description: "Test description",
          body: "Do the thing",
          sourcePath: "/tmp/plugin/commands/test-cmd.md",
        },
      ],
      skills: [],
    }

    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const commandFile = bundle.commandFiles.find((f) => f.name === "test-cmd")
    expect(commandFile).toBeDefined()
    const parsed = parseFrontmatter(commandFile!.content)
    expect(parsed.data.description).toBe("Test description")
    expect(parsed.body).toContain("Do the thing")
  })
})

describe("transformSkillContentForOpenCode", () => {
  test("rewrites 3-segment FQ agent names to flat names", () => {
    const input = "- `compound-engineering:document-review:coherence-reviewer`"
    expect(transformSkillContentForOpenCode(input)).toBe("- `coherence-reviewer`")
  })

  test("rewrites multiple FQ agent refs in one block", () => {
    const input = [
      "- `compound-engineering:document-review:coherence-reviewer`",
      "- `compound-engineering:document-review:feasibility-reviewer`",
      "- `compound-engineering:review:security-sentinel`",
    ].join("\n")
    const result = transformSkillContentForOpenCode(input)
    expect(result).toContain("- `coherence-reviewer`")
    expect(result).toContain("- `feasibility-reviewer`")
    expect(result).toContain("- `security-sentinel`")
    expect(result).not.toContain("compound-engineering:")
  })

  test("preserves 2-segment skill references", () => {
    const input = 'load the `compound-engineering:document-review` skill'
    // 2-segment refs are skill names, not agent names — left unchanged
    expect(transformSkillContentForOpenCode(input)).toBe(input)
  })

  test("rewrites .claude/ paths to .opencode/", () => {
    const input = "Read `.claude/config.json`"
    expect(transformSkillContentForOpenCode(input)).toBe("Read `.opencode/config.json`")
  })

  test("rewrites ~/. claude/ paths to ~/.config/opencode/", () => {
    const input = "Look in `~/.claude/plugins/`"
    expect(transformSkillContentForOpenCode(input)).toBe("Look in `~/.config/opencode/plugins/`")
  })

  test("handles FQ names in JSON-like contexts", () => {
    const input = '  subagent_type: "compound-engineering:review:security-sentinel",'
    expect(transformSkillContentForOpenCode(input)).toBe(
      '  subagent_type: "security-sentinel",'
    )
  })

  test("does not match URLs or non-agent colon patterns", () => {
    const cases = [
      "Visit https://example.com/path",
      "Use http://localhost:8080/api",
      "Set font-size: 12px; color: red;",
      "Time is 10:30:45 UTC",
      'key: "value"',
    ]
    for (const input of cases) {
      expect(transformSkillContentForOpenCode(input)).toBe(input)
    }
  })

  test("rewrites FQ names from any plugin namespace", () => {
    const input = "- `other-plugin:category:my-agent`"
    expect(transformSkillContentForOpenCode(input)).toBe("- `my-agent`")
  })

  test("preserves bare agent names (no namespace)", () => {
    const input = "Use `coherence-reviewer` for review."
    expect(transformSkillContentForOpenCode(input)).toBe(input)
  })

  test("rewrites 2-segment category:ce-agent refs to flat names", () => {
    const input = "Dispatch `review:ce-correctness-reviewer` for logic checks."
    expect(transformSkillContentForOpenCode(input)).toBe(
      "Dispatch `ce-correctness-reviewer` for logic checks.",
    )
  })

  test("preserves 2-segment refs without ce- prefix", () => {
    const input = "Spawn `compound-engineering:coherence-reviewer` as subagent."
    // 2-segment names without ce- prefix could be skill refs — not rewritten
    expect(transformSkillContentForOpenCode(input)).toBe(input)
  })

  test("does not partially rewrite 4-segment colon patterns", () => {
    const input = "`a:b:c:d`"
    // Without the lookahead, this would become `c:d` — a broken partial rewrite
    expect(transformSkillContentForOpenCode(input)).toBe(input)
  })

  test("preserves 3-segment slash commands", () => {
    const cases = [
      "Run `/team:ops:deploy` to deploy.",
      "Use /compound-engineering:review:check after changes.",
    ]
    for (const input of cases) {
      expect(transformSkillContentForOpenCode(input)).toBe(input)
    }
  })
})
