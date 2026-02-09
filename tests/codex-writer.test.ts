import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writeCodexBundle } from "../src/targets/codex"
import type { CodexBundle } from "../src/types/codex"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

describe("writeCodexBundle", () => {
  test("writes prompts, skills, and config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-test-"))
    const bundle: CodexBundle = {
      prompts: [{ name: "command-one", content: "Prompt content" }],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [{ name: "agent-skill", content: "Skill content" }],
      mcpServers: {
        local: { command: "echo", args: ["hello"], env: { KEY: "VALUE" } },
        remote: {
          url: "https://example.com/mcp",
          headers: { Authorization: "Bearer token" },
        },
      },
    }

    await writeCodexBundle(tempRoot, bundle)

    expect(await exists(path.join(tempRoot, ".codex", "prompts", "command-one.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".codex", "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".codex", "skills", "agent-skill", "SKILL.md"))).toBe(true)
    const configPath = path.join(tempRoot, ".codex", "config.toml")
    expect(await exists(configPath)).toBe(true)

    const config = await fs.readFile(configPath, "utf8")
    expect(config).toContain("[mcp_servers.local]")
    expect(config).toContain("command = \"echo\"")
    expect(config).toContain("args = [\"hello\"]")
    expect(config).toContain("[mcp_servers.local.env]")
    expect(config).toContain("KEY = \"VALUE\"")
    expect(config).toContain("[mcp_servers.remote]")
    expect(config).toContain("url = \"https://example.com/mcp\"")
    expect(config).toContain("http_headers")
  })

  test("writes directly into a .codex output root", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-home-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const bundle: CodexBundle = {
      prompts: [{ name: "command-one", content: "Prompt content" }],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [],
    }

    await writeCodexBundle(codexRoot, bundle)

    expect(await exists(path.join(codexRoot, "prompts", "command-one.md"))).toBe(true)
    expect(await exists(path.join(codexRoot, "skills", "skill-one", "SKILL.md"))).toBe(true)
  })

  test("backs up existing config.toml before overwriting", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-backup-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const configPath = path.join(codexRoot, "config.toml")

    // Create existing config
    await fs.mkdir(codexRoot, { recursive: true })
    const originalContent = "# My original config\n[custom]\nkey = \"value\"\n"
    await fs.writeFile(configPath, originalContent)

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      mcpServers: { test: { command: "echo" } },
    }

    await writeCodexBundle(codexRoot, bundle)

    // New config should be written
    const newConfig = await fs.readFile(configPath, "utf8")
    expect(newConfig).toContain("[mcp_servers.test]")

    // Backup should exist with original content
    const files = await fs.readdir(codexRoot)
    const backupFileName = files.find((f) => f.startsWith("config.toml.bak."))
    expect(backupFileName).toBeDefined()

    const backupContent = await fs.readFile(path.join(codexRoot, backupFileName!), "utf8")
    expect(backupContent).toBe(originalContent)
  })
})
