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
          content: "---\ndescription: Security\ntools:\n  - '*'\ninfer: true\n---\n\nReview code.",
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
