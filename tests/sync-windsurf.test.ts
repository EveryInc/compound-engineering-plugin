import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import type { ClaudeHomeConfig } from "../src/parsers/claude-home"
import { syncToWindsurf } from "../src/sync/windsurf"

describe("syncToWindsurf", () => {
  test("writes stdio, http, and sse MCP servers", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-windsurf-"))
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
        local: { command: "npx", args: ["serve"], env: { FOO: "bar" } },
        remoteHttp: { url: "https://example.com/mcp", headers: { Authorization: "Bearer a" } },
        remoteSse: { type: "sse", url: "https://example.com/sse" },
      },
    }

    await syncToWindsurf(config, tempRoot)

    expect((await fs.lstat(path.join(tempRoot, "skills", "skill-one"))).isSymbolicLink()).toBe(true)

    const content = JSON.parse(
      await fs.readFile(path.join(tempRoot, "mcp_config.json"), "utf8"),
    ) as {
      mcpServers: Record<string, {
        command?: string
        args?: string[]
        env?: Record<string, string>
        serverUrl?: string
        url?: string
      }>
    }

    expect(content.mcpServers.local).toEqual({
      command: "npx",
      args: ["serve"],
      env: { FOO: "bar" },
    })
    expect(content.mcpServers.remoteHttp?.serverUrl).toBe("https://example.com/mcp")
    expect(content.mcpServers.remoteSse?.url).toBe("https://example.com/sse")

    const perms = (await fs.stat(path.join(tempRoot, "mcp_config.json"))).mode & 0o777
    expect(perms).toBe(0o600)
  })

  test("merges existing config and overwrites same-named servers", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-windsurf-merge-"))
    await fs.writeFile(
      path.join(tempRoot, "mcp_config.json"),
      JSON.stringify({
        theme: "dark",
        mcpServers: {
          existing: { command: "node" },
          shared: { serverUrl: "https://old.example.com" },
        },
      }, null, 2),
    )

    const config: ClaudeHomeConfig = {
      skills: [],
      mcpServers: {
        shared: { url: "https://new.example.com" },
      },
    }

    await syncToWindsurf(config, tempRoot)

    const content = JSON.parse(
      await fs.readFile(path.join(tempRoot, "mcp_config.json"), "utf8"),
    ) as {
      theme: string
      mcpServers: Record<string, { command?: string; serverUrl?: string }>
    }

    expect(content.theme).toBe("dark")
    expect(content.mcpServers.existing?.command).toBe("node")
    expect(content.mcpServers.shared?.serverUrl).toBe("https://new.example.com")
  })
})
