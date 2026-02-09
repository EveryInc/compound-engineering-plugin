import { describe, expect, test } from "bun:test"
import path from "path"
import { loadClaudePlugin } from "../src/parsers/claude"

const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")
const mcpFixtureRoot = path.join(import.meta.dir, "fixtures", "mcp-file")
const customPathsRoot = path.join(import.meta.dir, "fixtures", "custom-paths")
const invalidCommandPathRoot = path.join(import.meta.dir, "fixtures", "invalid-command-path")
const invalidHooksPathRoot = path.join(import.meta.dir, "fixtures", "invalid-hooks-path")
const invalidMcpPathRoot = path.join(import.meta.dir, "fixtures", "invalid-mcp-path")

describe("loadClaudePlugin", () => {
  test("loads manifest, agents, commands, skills, hooks", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)

    expect(plugin.manifest.name).toBe("compound-engineering")
    expect(plugin.agents.length).toBe(2)
    expect(plugin.commands.length).toBe(7)
    expect(plugin.skills.length).toBe(2)
    expect(plugin.hooks).toBeDefined()
    expect(plugin.mcpServers).toBeDefined()

    const researchAgent = plugin.agents.find((agent) => agent.name === "repo-research-analyst")
    expect(researchAgent?.capabilities).toEqual(["Capability A", "Capability B"])

    const reviewCommand = plugin.commands.find((command) => command.name === "workflows:review")
    expect(reviewCommand?.allowedTools).toEqual([
      "Read",
      "Write",
      "Edit",
      "Bash(ls:*)",
      "Bash(git:*)",
      "Grep",
      "Glob",
      "List",
      "Patch",
      "Task",
    ])

    const planReview = plugin.commands.find((command) => command.name === "plan_review")
    expect(planReview?.allowedTools).toEqual(["Read", "Edit"])

    const skillCommand = plugin.commands.find((command) => command.name === "create-agent-skill")
    expect(skillCommand?.allowedTools).toEqual(["Skill(create-agent-skills)"])

    const modelCommand = plugin.commands.find((command) => command.name === "workflows:work")
    expect(modelCommand?.allowedTools).toEqual(["WebFetch"])

    const patternCommand = plugin.commands.find((command) => command.name === "report-bug")
    expect(patternCommand?.allowedTools).toEqual(["Read(.env)", "Bash(git:*)"])

    const planCommand = plugin.commands.find((command) => command.name === "workflows:plan")
    expect(planCommand?.allowedTools).toEqual(["Question", "TodoWrite", "TodoRead"])

    expect(plugin.mcpServers?.context7?.url).toBe("https://mcp.context7.com/mcp")
  })

  test("parses disable-model-invocation from commands", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)

    const disabledCommand = plugin.commands.find((command) => command.name === "deploy-docs")
    expect(disabledCommand).toBeDefined()
    expect(disabledCommand?.disableModelInvocation).toBe(true)

    const normalCommand = plugin.commands.find((command) => command.name === "workflows:review")
    expect(normalCommand?.disableModelInvocation).toBeUndefined()
  })

  test("parses disable-model-invocation from skills", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)

    const disabledSkill = plugin.skills.find((skill) => skill.name === "disabled-skill")
    expect(disabledSkill).toBeDefined()
    expect(disabledSkill?.disableModelInvocation).toBe(true)

    const normalSkill = plugin.skills.find((skill) => skill.name === "skill-one")
    expect(normalSkill?.disableModelInvocation).toBeUndefined()
  })

  test("loads MCP servers from .mcp.json when manifest is empty", async () => {
    const plugin = await loadClaudePlugin(mcpFixtureRoot)
    expect(plugin.mcpServers?.remote?.url).toBe("https://example.com/stream")
  })

  test("merges default and custom component paths", async () => {
    const plugin = await loadClaudePlugin(customPathsRoot)
    expect(plugin.agents.map((agent) => agent.name).sort()).toEqual(["custom-agent", "default-agent"])
    expect(plugin.commands.map((command) => command.name).sort()).toEqual(["custom-command", "default-command"])
    expect(plugin.skills.map((skill) => skill.name).sort()).toEqual(["custom-skill", "default-skill"])
    expect(plugin.hooks?.hooks.PreToolUse?.[0]?.hooks[0]?.command).toBe("echo default")
    expect(plugin.hooks?.hooks.PostToolUse?.[0]?.hooks[0]?.command).toBe("echo custom")
  })

  test("rejects custom component paths that escape the plugin root", async () => {
    await expect(loadClaudePlugin(invalidCommandPathRoot)).rejects.toThrow(
      "Invalid commands path: ../outside-commands. Paths must stay within the plugin root.",
    )
  })

  test("rejects hook paths that escape the plugin root", async () => {
    await expect(loadClaudePlugin(invalidHooksPathRoot)).rejects.toThrow(
      "Invalid hooks path: ../outside-hooks.json. Paths must stay within the plugin root.",
    )
  })

  test("rejects MCP paths that escape the plugin root", async () => {
    await expect(loadClaudePlugin(invalidMcpPathRoot)).rejects.toThrow(
      "Invalid mcpServers path: ../outside-mcp.json. Paths must stay within the plugin root.",
    )
  })
})
