import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import { loadClaudePlugin } from "../src/parsers/claude"
import { convertClaudeToOpenCode, transformSkillContentForOpenCode } from "../src/converters/claude-to-opencode"
import { parseFrontmatter } from "../src/utils/frontmatter"
import type { ClaudePlugin } from "../src/types/claude"

const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")
const compoundEngineeringRoot = path.join(
  import.meta.dir,
  "..",
  "plugins",
  "compound-engineering",
)

describe("convertClaudeToOpenCode", () => {
  test("from-command mode: map allowedTools to global permission block", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)
    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "from-commands",
    })

    expect(bundle.config.command).toBeUndefined()
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

  test("preserves 2-segment plugin:agent names (no category)", () => {
    const input = "Spawn `compound-engineering:coherence-reviewer` as subagent."
    // 2-segment names could be skill refs or flat agent refs — not rewritten
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
