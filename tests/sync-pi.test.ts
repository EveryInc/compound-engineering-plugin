import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { syncToPi } from "../src/sync/pi"
import type { ClaudeHomeConfig } from "../src/parsers/claude-home"

describe("syncToPi", () => {
  test("symlinks skills and writes MCPorter config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-"))
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
        local: { command: "echo", args: ["hello"] },
      },
    }

    await syncToPi(config, tempRoot)

    const linkedSkillPath = path.join(tempRoot, "skills", "skill-one")
    const linkedStat = await fs.lstat(linkedSkillPath)
    expect(linkedStat.isSymbolicLink()).toBe(true)

    const mcporterPath = path.join(tempRoot, "compound-engineering", "mcporter.json")
    const mcporterConfig = JSON.parse(await fs.readFile(mcporterPath, "utf8")) as {
      mcpServers: Record<string, { baseUrl?: string; command?: string }>
    }

    expect(mcporterConfig.mcpServers.context7?.baseUrl).toBe("https://mcp.context7.com/mcp")
    expect(mcporterConfig.mcpServers.local?.command).toBe("echo")
  })

  test("merges existing MCPorter config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-merge-"))
    const mcporterPath = path.join(tempRoot, "compound-engineering", "mcporter.json")
    await fs.mkdir(path.dirname(mcporterPath), { recursive: true })

    await fs.writeFile(
      mcporterPath,
      JSON.stringify({ mcpServers: { existing: { baseUrl: "https://example.com/mcp" } } }, null, 2),
    )

    const config: ClaudeHomeConfig = {
      skills: [],
      mcpServers: {
        context7: { url: "https://mcp.context7.com/mcp" },
      },
    }

    await syncToPi(config, tempRoot)

    const merged = JSON.parse(await fs.readFile(mcporterPath, "utf8")) as {
      mcpServers: Record<string, { baseUrl?: string }>
    }

    expect(merged.mcpServers.existing?.baseUrl).toBe("https://example.com/mcp")
    expect(merged.mcpServers.context7?.baseUrl).toBe("https://mcp.context7.com/mcp")
  })
})
