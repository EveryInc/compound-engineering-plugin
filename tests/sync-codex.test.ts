import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import type { ClaudeHomeConfig } from "../src/parsers/claude-home"
import { syncToCodex } from "../src/sync/codex"

describe("syncToCodex", () => {
  test("writes stdio and remote MCP servers into a managed block without clobbering user config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-codex-"))
    const fixtureSkillDir = path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one")
    const configPath = path.join(tempRoot, "config.toml")

    await fs.writeFile(
      configPath,
      [
        "[custom]",
        "enabled = true",
        "",
        "# BEGIN compound-plugin Claude Code MCP",
        "[mcp_servers.old]",
        "command = \"old\"",
        "# END compound-plugin Claude Code MCP",
        "",
        "[post]",
        "value = 2",
        "",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "skill-one",
          sourceDir: fixtureSkillDir,
          skillPath: path.join(fixtureSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {
        local: { command: "echo", args: ["hello"], env: { KEY: "VALUE" } },
        remote: { url: "https://example.com/mcp", headers: { Authorization: "Bearer token" } },
      },
    }

    await syncToCodex(config, tempRoot)

    const skillPath = path.join(tempRoot, "skills", "skill-one")
    expect((await fs.lstat(skillPath)).isSymbolicLink()).toBe(true)

    const content = await fs.readFile(configPath, "utf8")
    expect(content).toContain("[custom]")
    expect(content).toContain("[post]")
    expect(content).not.toContain("[mcp_servers.old]")
    expect(content).toContain("[mcp_servers.local]")
    expect(content).toContain("command = \"echo\"")
    expect(content).toContain("[mcp_servers.remote]")
    expect(content).toContain("url = \"https://example.com/mcp\"")
    expect(content).toContain("http_headers")
    // Old markers should be replaced with new ones
    expect(content).not.toContain("# BEGIN compound-plugin Claude Code MCP")
    expect(content.match(/# BEGIN Compound Engineering plugin MCP/g)?.length).toBe(1)

    const perms = (await fs.stat(configPath)).mode & 0o777
    expect(perms).toBe(0o600)
  })

  test("cleans up stale managed block when syncing with zero MCP servers", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-codex-zero-"))
    const fixtureSkillDir = path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one")
    const configPath = path.join(tempRoot, "config.toml")

    // First sync with MCP servers
    const configWithServers: ClaudeHomeConfig = {
      skills: [{ name: "skill-one", sourceDir: fixtureSkillDir, skillPath: path.join(fixtureSkillDir, "SKILL.md") }],
      mcpServers: { old: { command: "old-server" } },
    }
    await syncToCodex(configWithServers, tempRoot)
    expect(await fs.readFile(configPath, "utf8")).toContain("[mcp_servers.old]")

    // Second sync with zero MCP servers
    const configEmpty: ClaudeHomeConfig = {
      skills: [{ name: "skill-one", sourceDir: fixtureSkillDir, skillPath: path.join(fixtureSkillDir, "SKILL.md") }],
      mcpServers: {},
    }
    await syncToCodex(configEmpty, tempRoot)

    const content = await fs.readFile(configPath, "utf8")
    expect(content).not.toContain("[mcp_servers.old]")
    expect(content).not.toContain("# BEGIN")
  })
})
