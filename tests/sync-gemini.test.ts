import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { syncToGemini } from "../src/sync/gemini"
import type { ClaudeHomeConfig } from "../src/parsers/claude-home"

describe("syncToGemini", () => {
  test("symlinks skills and writes settings.json", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-gemini-"))
    const fixtureSkillDir = path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one")

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "skill-one",
          sourceDir: fixtureSkillDir,
          skillPath: path.join(fixtureSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {
        context7: { url: "https://mcp.context7.com/mcp" },
        local: { command: "echo", args: ["hello"], env: { FOO: "bar" } },
      },
    }

    await syncToGemini(config, tempRoot)

    // Check skill symlink
    const linkedSkillPath = path.join(tempRoot, "skills", "skill-one")
    const linkedStat = await fs.lstat(linkedSkillPath)
    expect(linkedStat.isSymbolicLink()).toBe(true)

    // Check settings.json
    const settingsPath = path.join(tempRoot, "settings.json")
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8")) as {
      mcpServers: Record<string, { url?: string; command?: string; args?: string[]; env?: Record<string, string> }>
    }

    expect(settings.mcpServers.context7?.url).toBe("https://mcp.context7.com/mcp")
    expect(settings.mcpServers.local?.command).toBe("echo")
    expect(settings.mcpServers.local?.args).toEqual(["hello"])
    expect(settings.mcpServers.local?.env).toEqual({ FOO: "bar" })
  })

  test("merges existing settings.json", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-gemini-merge-"))
    const settingsPath = path.join(tempRoot, "settings.json")

    await fs.writeFile(
      settingsPath,
      JSON.stringify({
        theme: "dark",
        mcpServers: { existing: { command: "node", args: ["server.js"] } },
      }, null, 2),
    )

    const config: ClaudeHomeConfig = {
      skills: [],
      mcpServers: {
        context7: { url: "https://mcp.context7.com/mcp" },
      },
    }

    await syncToGemini(config, tempRoot)

    const merged = JSON.parse(await fs.readFile(settingsPath, "utf8")) as {
      theme: string
      mcpServers: Record<string, { command?: string; url?: string }>
    }

    // Preserves existing settings
    expect(merged.theme).toBe("dark")
    // Preserves existing MCP servers
    expect(merged.mcpServers.existing?.command).toBe("node")
    // Adds new MCP servers
    expect(merged.mcpServers.context7?.url).toBe("https://mcp.context7.com/mcp")
  })

  test("writes personal commands as Gemini TOML prompts", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-gemini-cmd-"))

    const config: ClaudeHomeConfig = {
      skills: [],
      commands: [
        {
          name: "workflows:plan",
          description: "Planning command",
          argumentHint: "[goal]",
          body: "Plan the work carefully.",
          sourcePath: "/tmp/workflows/plan.md",
        },
      ],
      mcpServers: {},
    }

    await syncToGemini(config, tempRoot)

    const content = await fs.readFile(
      path.join(tempRoot, "commands", "workflows", "plan.toml"),
      "utf8",
    )
    expect(content).toContain("Planning command")
    expect(content).toContain("User request: {{args}}")
  })

  test("does not write settings.json when no MCP servers", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-gemini-nomcp-"))
    const fixtureSkillDir = path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one")

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "skill-one",
          sourceDir: fixtureSkillDir,
          skillPath: path.join(fixtureSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToGemini(config, tempRoot)

    // Skills should still be symlinked
    const linkedSkillPath = path.join(tempRoot, "skills", "skill-one")
    const linkedStat = await fs.lstat(linkedSkillPath)
    expect(linkedStat.isSymbolicLink()).toBe(true)

    // But settings.json should not exist
    const settingsExists = await fs.access(path.join(tempRoot, "settings.json")).then(() => true).catch(() => false)
    expect(settingsExists).toBe(false)
  })

  test("skips mirrored ~/.agents skills when syncing to ~/.gemini and removes stale duplicate symlinks", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "sync-gemini-home-"))
    const geminiRoot = path.join(tempHome, ".gemini")
    const agentsSkillDir = path.join(tempHome, ".agents", "skills", "skill-one")

    await fs.mkdir(path.join(agentsSkillDir), { recursive: true })
    await fs.writeFile(path.join(agentsSkillDir, "SKILL.md"), "# Skill One\n", "utf8")
    await fs.mkdir(path.join(geminiRoot, "skills"), { recursive: true })
    await fs.symlink(agentsSkillDir, path.join(geminiRoot, "skills", "skill-one"))

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "skill-one",
          sourceDir: agentsSkillDir,
          skillPath: path.join(agentsSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToGemini(config, geminiRoot)

    const duplicateExists = await fs.access(path.join(geminiRoot, "skills", "skill-one")).then(() => true).catch(() => false)
    expect(duplicateExists).toBe(false)
  })
})
