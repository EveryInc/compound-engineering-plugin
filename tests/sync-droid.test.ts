import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { syncToDroid } from "../src/sync/droid"
import type { ClaudeHomeConfig } from "../src/parsers/claude-home"

describe("syncToDroid", () => {
  test("symlinks skills to factory skills dir and writes mcp.json", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-droid-"))
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
      },
    }

    await syncToDroid(config, tempRoot)

    const linkedSkillPath = path.join(tempRoot, "skills", "skill-one")
    const linkedStat = await fs.lstat(linkedSkillPath)
    expect(linkedStat.isSymbolicLink()).toBe(true)

    const mcpConfig = JSON.parse(
      await fs.readFile(path.join(tempRoot, "mcp.json"), "utf8"),
    ) as {
      mcpServers: Record<string, { type: string; url?: string; disabled: boolean }>
    }
    expect(mcpConfig.mcpServers.context7?.type).toBe("http")
    expect(mcpConfig.mcpServers.context7?.url).toBe("https://mcp.context7.com/mcp")
    expect(mcpConfig.mcpServers.context7?.disabled).toBe(false)
  })

  test("merges existing mcp.json and overwrites same-named servers from Claude", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-droid-merge-"))
    await fs.writeFile(
      path.join(tempRoot, "mcp.json"),
      JSON.stringify({
        theme: "dark",
        mcpServers: {
          shared: { type: "http", url: "https://old.example.com", disabled: true },
          existing: { type: "stdio", command: "node", disabled: false },
        },
      }, null, 2),
    )

    const config: ClaudeHomeConfig = {
      skills: [],
      mcpServers: {
        shared: { url: "https://new.example.com" },
      },
    }

    await syncToDroid(config, tempRoot)

    const mcpConfig = JSON.parse(
      await fs.readFile(path.join(tempRoot, "mcp.json"), "utf8"),
    ) as {
      theme: string
      mcpServers: Record<string, { type: string; url?: string; command?: string; disabled: boolean }>
    }

    expect(mcpConfig.theme).toBe("dark")
    expect(mcpConfig.mcpServers.existing?.command).toBe("node")
    expect(mcpConfig.mcpServers.shared?.url).toBe("https://new.example.com")
    expect(mcpConfig.mcpServers.shared?.disabled).toBe(false)
  })

  test("skips skills with invalid names", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-droid-invalid-"))
    const fixtureSkillDir = path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one")

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "../escape",
          sourceDir: fixtureSkillDir,
          skillPath: path.join(fixtureSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToDroid(config, tempRoot)

    const entries = await fs.readdir(path.join(tempRoot, "skills"))
    expect(entries).toHaveLength(0)
  })
})
