import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { loadClaudePlugin } from "../src/parsers/claude"
import { filterSkillsByPlatform } from "../src/types/claude"

const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")
const compoundPluginRoot = path.join(import.meta.dir, "..", "plugins", "compound-engineering")
const mcpFixtureRoot = path.join(import.meta.dir, "fixtures", "mcp-file")
const customPathsRoot = path.join(import.meta.dir, "fixtures", "custom-paths")
const invalidCommandPathRoot = path.join(import.meta.dir, "fixtures", "invalid-command-path")
const invalidHooksPathRoot = path.join(import.meta.dir, "fixtures", "invalid-hooks-path")
const invalidMcpPathRoot = path.join(import.meta.dir, "fixtures", "invalid-mcp-path")
const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    await fs.rm(root, { recursive: true, force: true })
  }
})

async function makeMinimalPluginRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claude-parser-agent-md-"))
  tempRoots.push(root)
  await fs.mkdir(path.join(root, ".claude-plugin"), { recursive: true })
  await fs.mkdir(path.join(root, "agents"), { recursive: true })
  await fs.writeFile(
    path.join(root, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "test-plugin", version: "1.0.0" }, null, 2),
  )
  return root
}

describe("loadClaudePlugin", () => {
  test("current compound-engineering plugin ships skills and agents but no source commands", async () => {
    const plugin = await loadClaudePlugin(compoundPluginRoot)

    expect(plugin.commands).toHaveLength(0)
    expect(plugin.skills.length).toBeGreaterThan(0)
    expect(plugin.agents.length).toBeGreaterThan(0)
  })

  test("loads manifest, agents, commands, skills, hooks", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)

    expect(plugin.manifest.name).toBe("compound-engineering")
    expect(plugin.agents.length).toBe(2)
    expect(plugin.commands.length).toBe(7)
    expect(plugin.skills.length).toBe(3)
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

  test("parses ce_platforms from skills", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)

    const claudeOnly = plugin.skills.find((skill) => skill.name === "claude-only-skill")
    expect(claudeOnly).toBeDefined()
    expect(claudeOnly?.ce_platforms).toEqual(["claude"])

    const normalSkill = plugin.skills.find((skill) => skill.name === "skill-one")
    expect(normalSkill?.ce_platforms).toBeUndefined()
  })

  test("filterSkillsByPlatform includes skills without platforms field", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)
    const codexSkills = filterSkillsByPlatform(plugin.skills, "codex")

    expect(codexSkills.find((s) => s.name === "skill-one")).toBeDefined()
    expect(codexSkills.find((s) => s.name === "disabled-skill")).toBeDefined()
    expect(codexSkills.find((s) => s.name === "claude-only-skill")).toBeUndefined()
  })

  test("filterSkillsByPlatform includes skills matching the platform", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)
    const claudeSkills = filterSkillsByPlatform(plugin.skills, "claude")

    expect(claudeSkills.find((s) => s.name === "skill-one")).toBeDefined()
    expect(claudeSkills.find((s) => s.name === "claude-only-skill")).toBeDefined()
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

  test("loads .agent.md files with explicit frontmatter names", async () => {
    const root = await makeMinimalPluginRoot()
    await fs.writeFile(
      path.join(root, "agents", "repo-research-analyst.agent.md"),
      `---
name: repo-research-analyst
description: Research helper
---

Research prompt.
`,
    )

    const plugin = await loadClaudePlugin(root)

    expect(plugin.agents).toHaveLength(1)
    expect(plugin.agents[0]?.name).toBe("repo-research-analyst")
    expect(plugin.agents[0]?.sourcePath.endsWith("repo-research-analyst.agent.md")).toBe(true)
  })

  test("falls back to the filename stem for .agent.md files without name frontmatter", async () => {
    const root = await makeMinimalPluginRoot()
    await fs.writeFile(
      path.join(root, "agents", "cleanup-specialist.agent.md"),
      `---
description: Cleanup helper
---

Cleanup prompt.
`,
    )

    const plugin = await loadClaudePlugin(root)

    expect(plugin.agents).toHaveLength(1)
    expect(plugin.agents[0]?.name).toBe("cleanup-specialist")
  })
})
