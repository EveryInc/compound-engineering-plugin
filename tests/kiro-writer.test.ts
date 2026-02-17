import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writeKiroBundle } from "../src/targets/kiro"
import type { KiroBundle } from "../src/types/kiro"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

const emptyBundle: KiroBundle = {
  agents: [],
  generatedSkills: [],
  skillDirs: [],
  steeringFiles: [],
  mcpServers: {},
}

describe("writeKiroBundle", () => {
  test("writes agents, skills, steering, and mcp.json", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiro-test-"))
    const bundle: KiroBundle = {
      agents: [
        {
          name: "security-reviewer",
          config: {
            name: "security-reviewer",
            description: "Security-focused agent",
            prompt: "file://./prompts/security-reviewer.md",
            tools: ["*"],
            resources: ["file://.kiro/steering/**/*.md", "skill://.kiro/skills/**/SKILL.md"],
            includeMcpJson: true,
            welcomeMessage: "Switching to security-reviewer.",
          },
          promptContent: "Review code for vulnerabilities.",
        },
      ],
      generatedSkills: [
        {
          name: "workflows-plan",
          content: "---\nname: workflows-plan\ndescription: Planning\n---\n\nPlan the work.",
        },
      ],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      steeringFiles: [
        { name: "compound-engineering", content: "# Steering content\n\nFollow these guidelines." },
      ],
      mcpServers: {
        playwright: { command: "npx", args: ["-y", "@anthropic/mcp-playwright"] },
      },
    }

    await writeKiroBundle(tempRoot, bundle)

    // Agent JSON config
    const agentConfigPath = path.join(tempRoot, ".kiro", "agents", "security-reviewer.json")
    expect(await exists(agentConfigPath)).toBe(true)
    const agentConfig = JSON.parse(await fs.readFile(agentConfigPath, "utf8"))
    expect(agentConfig.name).toBe("security-reviewer")
    expect(agentConfig.includeMcpJson).toBe(true)
    expect(agentConfig.tools).toEqual(["*"])

    // Agent prompt file
    const promptPath = path.join(tempRoot, ".kiro", "agents", "prompts", "security-reviewer.md")
    expect(await exists(promptPath)).toBe(true)
    const promptContent = await fs.readFile(promptPath, "utf8")
    expect(promptContent).toContain("Review code for vulnerabilities.")

    // Generated skill
    const skillPath = path.join(tempRoot, ".kiro", "skills", "workflows-plan", "SKILL.md")
    expect(await exists(skillPath)).toBe(true)
    const skillContent = await fs.readFile(skillPath, "utf8")
    expect(skillContent).toContain("Plan the work.")

    // Copied skill
    expect(await exists(path.join(tempRoot, ".kiro", "skills", "skill-one", "SKILL.md"))).toBe(true)

    // Steering file
    const steeringPath = path.join(tempRoot, ".kiro", "steering", "compound-engineering.md")
    expect(await exists(steeringPath)).toBe(true)
    const steeringContent = await fs.readFile(steeringPath, "utf8")
    expect(steeringContent).toContain("Follow these guidelines.")

    // MCP config
    const mcpPath = path.join(tempRoot, ".kiro", "settings", "mcp.json")
    expect(await exists(mcpPath)).toBe(true)
    const mcpContent = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(mcpContent.mcpServers.playwright.command).toBe("npx")
  })

  test("does not double-nest when output root is .kiro", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiro-home-"))
    const kiroRoot = path.join(tempRoot, ".kiro")
    const bundle: KiroBundle = {
      ...emptyBundle,
      agents: [
        {
          name: "reviewer",
          config: {
            name: "reviewer",
            description: "A reviewer",
            prompt: "file://./prompts/reviewer.md",
            tools: ["*"],
            resources: [],
            includeMcpJson: true,
          },
          promptContent: "Review content.",
        },
      ],
    }

    await writeKiroBundle(kiroRoot, bundle)

    expect(await exists(path.join(kiroRoot, "agents", "reviewer.json"))).toBe(true)
    // Should NOT double-nest under .kiro/.kiro
    expect(await exists(path.join(kiroRoot, ".kiro"))).toBe(false)
  })

  test("handles empty bundles gracefully", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiro-empty-"))

    await writeKiroBundle(tempRoot, emptyBundle)
    expect(await exists(tempRoot)).toBe(true)
  })

  test("backs up existing mcp.json before overwrite", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiro-backup-"))
    const kiroRoot = path.join(tempRoot, ".kiro")
    const settingsDir = path.join(kiroRoot, "settings")
    await fs.mkdir(settingsDir, { recursive: true })

    // Write existing mcp.json
    const mcpPath = path.join(settingsDir, "mcp.json")
    await fs.writeFile(mcpPath, JSON.stringify({ mcpServers: { old: { command: "old-cmd" } } }))

    const bundle: KiroBundle = {
      ...emptyBundle,
      mcpServers: { newServer: { command: "new-cmd" } },
    }

    await writeKiroBundle(kiroRoot, bundle)

    // New mcp.json should have the new content
    const newContent = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(newContent.mcpServers.newServer.command).toBe("new-cmd")

    // A backup file should exist
    const files = await fs.readdir(settingsDir)
    const backupFiles = files.filter((f) => f.startsWith("mcp.json.bak."))
    expect(backupFiles.length).toBeGreaterThanOrEqual(1)
  })

  test("merges mcpServers into existing mcp.json without clobbering other keys", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiro-merge-"))
    const kiroRoot = path.join(tempRoot, ".kiro")
    const settingsDir = path.join(kiroRoot, "settings")
    await fs.mkdir(settingsDir, { recursive: true })

    // Write existing mcp.json with other keys
    const mcpPath = path.join(settingsDir, "mcp.json")
    await fs.writeFile(mcpPath, JSON.stringify({
      customKey: "preserve-me",
      mcpServers: { old: { command: "old-cmd" } },
    }))

    const bundle: KiroBundle = {
      ...emptyBundle,
      mcpServers: { newServer: { command: "new-cmd" } },
    }

    await writeKiroBundle(kiroRoot, bundle)

    const content = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(content.customKey).toBe("preserve-me")
    expect(content.mcpServers.old.command).toBe("old-cmd")
    expect(content.mcpServers.newServer.command).toBe("new-cmd")
  })

  test("mcp.json fresh write when no existing file", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiro-fresh-"))
    const bundle: KiroBundle = {
      ...emptyBundle,
      mcpServers: { myServer: { command: "my-cmd", args: ["--flag"] } },
    }

    await writeKiroBundle(tempRoot, bundle)

    const mcpPath = path.join(tempRoot, ".kiro", "settings", "mcp.json")
    expect(await exists(mcpPath)).toBe(true)
    const content = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(content.mcpServers.myServer.command).toBe("my-cmd")
    expect(content.mcpServers.myServer.args).toEqual(["--flag"])
  })

  test("agent JSON files are valid JSON with expected fields", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiro-json-"))
    const bundle: KiroBundle = {
      ...emptyBundle,
      agents: [
        {
          name: "test-agent",
          config: {
            name: "test-agent",
            description: "Test agent",
            prompt: "file://./prompts/test-agent.md",
            tools: ["*"],
            resources: ["file://.kiro/steering/**/*.md"],
            includeMcpJson: true,
            welcomeMessage: "Hello from test-agent.",
          },
          promptContent: "Do test things.",
        },
      ],
    }

    await writeKiroBundle(tempRoot, bundle)

    const configPath = path.join(tempRoot, ".kiro", "agents", "test-agent.json")
    const raw = await fs.readFile(configPath, "utf8")
    const parsed = JSON.parse(raw) // Should not throw
    expect(parsed.name).toBe("test-agent")
    expect(parsed.prompt).toBe("file://./prompts/test-agent.md")
    expect(parsed.tools).toEqual(["*"])
    expect(parsed.includeMcpJson).toBe(true)
    expect(parsed.welcomeMessage).toBe("Hello from test-agent.")
  })

  test("path traversal attempt in skill name is rejected", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiro-traversal-"))
    const bundle: KiroBundle = {
      ...emptyBundle,
      generatedSkills: [
        { name: "../escape", content: "Malicious content" },
      ],
    }

    expect(writeKiroBundle(tempRoot, bundle)).rejects.toThrow("unsafe path")
  })

  test("path traversal in agent name is rejected", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiro-traversal2-"))
    const bundle: KiroBundle = {
      ...emptyBundle,
      agents: [
        {
          name: "../escape",
          config: {
            name: "../escape",
            description: "Malicious",
            prompt: "file://./prompts/../escape.md",
            tools: ["*"],
            resources: [],
            includeMcpJson: true,
          },
          promptContent: "Bad.",
        },
      ],
    }

    expect(writeKiroBundle(tempRoot, bundle)).rejects.toThrow("unsafe path")
  })
})
