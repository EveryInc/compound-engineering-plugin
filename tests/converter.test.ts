import { describe, expect, test } from "bun:test"
import path from "path"
import { loadClaudePlugin } from "../src/parsers/claude"
import { convertClaudeToOpenCode } from "../src/converters/claude-to-opencode"
import { parseFrontmatter } from "../src/utils/frontmatter"

const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")

describe("convertClaudeToOpenCode", () => {
  test("maps commands, permissions, and agents", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)
    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "from-commands",
    })

    expect(bundle.config.command?.["workflows:review"]).toBeDefined()
    expect(bundle.config.command?.["plan_review"]).toBeDefined()

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
      agentMode: "subagent",
      inferTemperature: true,
      permissions: "none",
    })

    const securityAgent = bundle.agents.find((agent) => agent.name === "security-sentinel")
    expect(securityAgent).toBeDefined()
    const parsed = parseFrontmatter(securityAgent!.content)
    expect(parsed.data.model).toBe("anthropic/claude-sonnet-4-20250514")
    expect(parsed.data.temperature).toBe(0.1)

    const modelCommand = bundle.config.command?.["workflows:work"]
    expect(modelCommand?.model).toBe("openai/gpt-4o")
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

  test("excludes commands with disable-model-invocation from command map", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)
    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    // deploy-docs has disable-model-invocation: true, should be excluded
    expect(bundle.config.command?.["deploy-docs"]).toBeUndefined()

    // Normal commands should still be present
    expect(bundle.config.command?.["workflows:review"]).toBeDefined()
  })
})
