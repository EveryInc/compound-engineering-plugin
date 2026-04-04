import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writeCopilotBundle } from "../src/targets/copilot"
import type { CopilotBundle } from "../src/types/copilot"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

describe("writeCopilotBundle", () => {
  test("writes agents, generated skills, copied skills, and MCP config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-test-"))
    const bundle: CopilotBundle = {
      agents: [
        {
          name: "security-reviewer",
          content: "---\ndescription: Security\nuser-invocable: true\n---\n\nReview code.",
        },
      ],
      generatedSkills: [
        {
          name: "plan",
          content: "---\nname: plan\ndescription: Planning\n---\n\nPlan the work.",
        },
      ],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      mcpConfig: {
        playwright: {
          type: "local",
          command: "npx",
          args: ["-y", "@anthropic/mcp-playwright"],
          tools: ["*"],
        },
      },
    }

    await writeCopilotBundle(tempRoot, bundle)

    expect(await exists(path.join(tempRoot, ".github", "agents", "security-reviewer.agent.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".github", "skills", "plan", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".github", "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".github", "copilot-mcp-config.json"))).toBe(true)

    const agentContent = await fs.readFile(
      path.join(tempRoot, ".github", "agents", "security-reviewer.agent.md"),
      "utf8",
    )
    expect(agentContent).toContain("Review code.")

    const skillContent = await fs.readFile(
      path.join(tempRoot, ".github", "skills", "plan", "SKILL.md"),
      "utf8",
    )
    expect(skillContent).toContain("Plan the work.")

    const mcpContent = JSON.parse(
      await fs.readFile(path.join(tempRoot, ".github", "copilot-mcp-config.json"), "utf8"),
    )
    expect(mcpContent.mcpServers.playwright.command).toBe("npx")
  })

  test("agents use .agent.md file extension", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-ext-"))
    const bundle: CopilotBundle = {
      agents: [{ name: "test-agent", content: "Agent content" }],
      generatedSkills: [],
      skillDirs: [],
    }

    await writeCopilotBundle(tempRoot, bundle)

    expect(await exists(path.join(tempRoot, ".github", "agents", "test-agent.agent.md"))).toBe(true)
    // Should NOT create a plain .md file
    expect(await exists(path.join(tempRoot, ".github", "agents", "test-agent.md"))).toBe(false)
  })

  test("writes directly into .github output root without double-nesting", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-home-"))
    const githubRoot = path.join(tempRoot, ".github")
    const bundle: CopilotBundle = {
      agents: [{ name: "reviewer", content: "Reviewer agent content" }],
      generatedSkills: [{ name: "plan", content: "Plan content" }],
      skillDirs: [],
    }

    await writeCopilotBundle(githubRoot, bundle)

    expect(await exists(path.join(githubRoot, "agents", "reviewer.agent.md"))).toBe(true)
    expect(await exists(path.join(githubRoot, "skills", "plan", "SKILL.md"))).toBe(true)
    // Should NOT double-nest under .github/.github
    expect(await exists(path.join(githubRoot, ".github"))).toBe(false)
  })

  test("handles empty bundles gracefully", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-empty-"))
    const bundle: CopilotBundle = {
      agents: [],
      generatedSkills: [],
      skillDirs: [],
    }

    await writeCopilotBundle(tempRoot, bundle)
    expect(await exists(tempRoot)).toBe(true)
  })

  test("writes multiple agents as separate .agent.md files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-multi-"))
    const githubRoot = path.join(tempRoot, ".github")
    const bundle: CopilotBundle = {
      agents: [
        { name: "security-sentinel", content: "Security rules" },
        { name: "performance-oracle", content: "Performance rules" },
        { name: "code-simplicity-reviewer", content: "Simplicity rules" },
      ],
      generatedSkills: [],
      skillDirs: [],
    }

    await writeCopilotBundle(githubRoot, bundle)

    expect(await exists(path.join(githubRoot, "agents", "security-sentinel.agent.md"))).toBe(true)
    expect(await exists(path.join(githubRoot, "agents", "performance-oracle.agent.md"))).toBe(true)
    expect(await exists(path.join(githubRoot, "agents", "code-simplicity-reviewer.agent.md"))).toBe(true)
  })

  test("backs up existing copilot-mcp-config.json before overwriting", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-backup-"))
    const githubRoot = path.join(tempRoot, ".github")
    await fs.mkdir(githubRoot, { recursive: true })

    // Write an existing config
    const mcpPath = path.join(githubRoot, "copilot-mcp-config.json")
    await fs.writeFile(mcpPath, JSON.stringify({ mcpServers: { old: { type: "local", command: "old-cmd", tools: ["*"] } } }))

    const bundle: CopilotBundle = {
      agents: [],
      generatedSkills: [],
      skillDirs: [],
      mcpConfig: {
        newServer: { type: "local", command: "new-cmd", tools: ["*"] },
      },
    }

    await writeCopilotBundle(githubRoot, bundle)

    // New config should have the new content
    const newContent = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(newContent.mcpServers.newServer.command).toBe("new-cmd")

    // A backup file should exist
    const files = await fs.readdir(githubRoot)
    const backupFiles = files.filter((f) => f.startsWith("copilot-mcp-config.json.bak."))
    expect(backupFiles.length).toBeGreaterThanOrEqual(1)
  })

  test("transforms Task calls in copied SKILL.md files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-skill-transform-"))
    const sourceSkillDir = path.join(tempRoot, "source-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      `---
name: ce-plan
description: Planning workflow
---

Run these research agents:

- Task compound-engineering:research:repo-research-analyst(feature_description)
- Task compound-engineering:research:learnings-researcher(feature_description)
- Task compound-engineering:review:code-simplicity-reviewer()
`,
    )

    const bundle: CopilotBundle = {
      agents: [],
      generatedSkills: [],
      skillDirs: [{ name: "ce-plan", sourceDir: sourceSkillDir }],
    }

    await writeCopilotBundle(tempRoot, bundle)

    const installedSkill = await fs.readFile(
      path.join(tempRoot, ".github", "skills", "ce-plan", "SKILL.md"),
      "utf8",
    )

    expect(installedSkill).toContain("Use the repo-research-analyst skill to: feature_description")
    expect(installedSkill).toContain("Use the learnings-researcher skill to: feature_description")
    expect(installedSkill).toContain("Use the code-simplicity-reviewer skill")
    expect(installedSkill).not.toContain("Task compound-engineering:")
  })

  test("removes stale plugin MCP servers on re-install", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-converge-"))
    const githubRoot = path.join(tempRoot, ".github")

    const bundle1: CopilotBundle = {
      agents: [],
      generatedSkills: [],
      skillDirs: [],
      mcpConfig: { old: { type: "local", command: "old-server", tools: ["*"] } },
    }
    const bundle2: CopilotBundle = {
      agents: [],
      generatedSkills: [],
      skillDirs: [],
      mcpConfig: { fresh: { type: "local", command: "new-server", tools: ["*"] } },
    }

    await writeCopilotBundle(tempRoot, bundle1)
    await writeCopilotBundle(tempRoot, bundle2)

    const result = JSON.parse(await fs.readFile(path.join(githubRoot, "copilot-mcp-config.json"), "utf8"))
    expect(result.mcpServers.fresh).toBeDefined()
    expect(result.mcpServers.old).toBeUndefined()
  })

  test("cleans up all plugin MCP servers when bundle has none", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-zero-"))
    const githubRoot = path.join(tempRoot, ".github")

    const bundle1: CopilotBundle = {
      agents: [],
      generatedSkills: [],
      skillDirs: [],
      mcpConfig: { old: { type: "local", command: "old-server", tools: ["*"] } },
    }
    const bundle2: CopilotBundle = {
      agents: [],
      generatedSkills: [],
      skillDirs: [],
      // No mcpConfig
    }

    await writeCopilotBundle(tempRoot, bundle1)
    await writeCopilotBundle(tempRoot, bundle2)

    const result = JSON.parse(await fs.readFile(path.join(githubRoot, "copilot-mcp-config.json"), "utf8"))
    expect(result.mcpServers.old).toBeUndefined()
    expect(result._compound_managed_mcp).toEqual([])
  })

  test("does not prune untracked user config when plugin has zero MCP servers", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-untracked-"))
    const githubRoot = path.join(tempRoot, ".github")
    await fs.mkdir(githubRoot, { recursive: true })

    // Pre-existing user config with no tracking key (never had the plugin before)
    await fs.writeFile(
      path.join(githubRoot, "copilot-mcp-config.json"),
      JSON.stringify({
        mcpServers: { "user-tool": { type: "local", command: "my-tool", tools: ["*"] } },
      }),
    )

    // Plugin installs with zero MCP servers
    await writeCopilotBundle(githubRoot, {
      agents: [],
      generatedSkills: [],
      skillDirs: [],
    })

    const result = JSON.parse(await fs.readFile(path.join(githubRoot, "copilot-mcp-config.json"), "utf8"))
    expect(result.mcpServers["user-tool"]).toBeDefined()
    expect(result._compound_managed_mcp).toEqual([])
  })

  test("preserves user servers across zero-MCP-then-MCP round trip", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-roundtrip-"))
    const githubRoot = path.join(tempRoot, ".github")
    const mcpPath = path.join(githubRoot, "copilot-mcp-config.json")

    // 1. Install with plugin MCP
    await writeCopilotBundle(tempRoot, {
      agents: [], generatedSkills: [], skillDirs: [],
      mcpConfig: { plugin: { type: "local", command: "plugin-server", tools: ["*"] } },
    })

    // 2. User adds their own server
    const afterInstall = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    afterInstall.mcpServers["user-tool"] = { type: "local", command: "my-tool", tools: ["*"] }
    await fs.writeFile(mcpPath, JSON.stringify(afterInstall))

    // 3. Install with zero plugin MCP
    await writeCopilotBundle(tempRoot, {
      agents: [], generatedSkills: [], skillDirs: [],
    })

    // 4. Install with plugin MCP again
    await writeCopilotBundle(tempRoot, {
      agents: [], generatedSkills: [], skillDirs: [],
      mcpConfig: { new_plugin: { type: "local", command: "new-plugin", tools: ["*"] } },
    })

    const result = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(result.mcpServers["user-tool"]).toBeDefined()
    expect(result.mcpServers.new_plugin).toBeDefined()
    expect(result.mcpServers.plugin).toBeUndefined()
  })

  test("preserves user-added MCP servers across re-installs", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-user-mcp-"))
    const githubRoot = path.join(tempRoot, ".github")
    await fs.mkdir(githubRoot, { recursive: true })

    // User has their own MCP server alongside plugin-managed ones (tracking key present)
    await fs.writeFile(
      path.join(githubRoot, "copilot-mcp-config.json"),
      JSON.stringify({
        mcpServers: { "user-tool": { type: "local", command: "my-tool", tools: ["*"] } },
        _compound_managed_mcp: [],
      }),
    )

    const bundle: CopilotBundle = {
      agents: [],
      generatedSkills: [],
      skillDirs: [],
      mcpConfig: { plugin: { type: "local", command: "plugin-server", tools: ["*"] } },
    }

    await writeCopilotBundle(githubRoot, bundle)

    const result = JSON.parse(await fs.readFile(path.join(githubRoot, "copilot-mcp-config.json"), "utf8"))
    expect(result.mcpServers["user-tool"]).toBeDefined()
    expect(result.mcpServers.plugin).toBeDefined()
  })

  test("prunes stale servers from legacy config without tracking key", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-legacy-"))
    const githubRoot = path.join(tempRoot, ".github")
    await fs.mkdir(githubRoot, { recursive: true })

    // Simulate old writer output: has mcpServers but no _compound_managed_mcp
    await fs.writeFile(
      path.join(githubRoot, "copilot-mcp-config.json"),
      JSON.stringify({
        mcpServers: {
          old: { type: "local", command: "old-server", tools: ["*"] },
          renamed: { type: "local", command: "renamed-server", tools: ["*"] },
        },
      }),
    )

    const bundle: CopilotBundle = {
      agents: [],
      generatedSkills: [],
      skillDirs: [],
      mcpConfig: { fresh: { type: "local", command: "new-server", tools: ["*"] } },
    }

    await writeCopilotBundle(githubRoot, bundle)

    const result = JSON.parse(await fs.readFile(path.join(githubRoot, "copilot-mcp-config.json"), "utf8"))
    expect(result.mcpServers.fresh).toBeDefined()
    expect(result.mcpServers.old).toBeUndefined()
    expect(result.mcpServers.renamed).toBeUndefined()
    expect(result._compound_managed_mcp).toEqual(["fresh"])
  })

  test("creates skill directories with SKILL.md", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-genskill-"))
    const bundle: CopilotBundle = {
      agents: [],
      generatedSkills: [
        {
          name: "deploy",
          content: "---\nname: deploy\ndescription: Deploy skill\n---\n\nDeploy steps.",
        },
      ],
      skillDirs: [],
    }

    await writeCopilotBundle(tempRoot, bundle)

    const skillPath = path.join(tempRoot, ".github", "skills", "deploy", "SKILL.md")
    expect(await exists(skillPath)).toBe(true)

    const content = await fs.readFile(skillPath, "utf8")
    expect(content).toContain("Deploy steps.")
  })
})
