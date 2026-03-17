import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { syncToCopilot } from "../src/sync/copilot"
import type { ClaudeHomeConfig } from "../src/parsers/claude-home"

describe("syncToCopilot", () => {
  test("symlinks skills to .github/skills/", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-copilot-"))
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

    await syncToCopilot(config, tempRoot)

    const linkedSkillPath = path.join(tempRoot, "skills", "skill-one")
    const linkedStat = await fs.lstat(linkedSkillPath)
    expect(linkedStat.isSymbolicLink()).toBe(true)
  })

  test("converts personal commands into Copilot skills", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-copilot-cmd-"))

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

    await syncToCopilot(config, tempRoot)

    const skillContent = await fs.readFile(
      path.join(tempRoot, "skills", "workflows-plan", "SKILL.md"),
      "utf8",
    )
    expect(skillContent).toContain("name: workflows-plan")
    expect(skillContent).toContain("Planning command")
    expect(skillContent).toContain("## Arguments")
  })

  test("skips skills with invalid names", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-copilot-invalid-"))

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "../escape-attempt",
          sourceDir: "/tmp/bad-skill",
          skillPath: "/tmp/bad-skill/SKILL.md",
        },
      ],
      mcpServers: {},
    }

    await syncToCopilot(config, tempRoot)

    const skillsDir = path.join(tempRoot, "skills")
    const entries = await fs.readdir(skillsDir).catch(() => [])
    expect(entries).toHaveLength(0)
  })

  test("merges MCP config with existing file", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-copilot-merge-"))
    const mcpPath = path.join(tempRoot, "mcp-config.json")

    await fs.writeFile(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          existing: { type: "local", command: "node", args: ["server.js"], tools: ["*"] },
        },
      }, null, 2),
    )

    const config: ClaudeHomeConfig = {
      skills: [],
      mcpServers: {
        context7: { url: "https://mcp.context7.com/mcp" },
      },
    }

    await syncToCopilot(config, tempRoot)

    const merged = JSON.parse(await fs.readFile(mcpPath, "utf8")) as {
      mcpServers: Record<string, { command?: string; url?: string; type: string }>
    }

    expect(merged.mcpServers.existing?.command).toBe("node")
    expect(merged.mcpServers.context7?.url).toBe("https://mcp.context7.com/mcp")
    expect(merged.mcpServers.context7?.type).toBe("http")
  })

  test("transforms MCP env var names to COPILOT_MCP_ prefix", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-copilot-env-"))

    const config: ClaudeHomeConfig = {
      skills: [],
      mcpServers: {
        server: {
          command: "echo",
          args: ["hello"],
          env: { API_KEY: "secret", COPILOT_MCP_TOKEN: "already-prefixed" },
        },
      },
    }

    await syncToCopilot(config, tempRoot)

    const mcpPath = path.join(tempRoot, "mcp-config.json")
    const mcpConfig = JSON.parse(await fs.readFile(mcpPath, "utf8")) as {
      mcpServers: Record<string, { env?: Record<string, string> }>
    }

    expect(mcpConfig.mcpServers.server?.env).toEqual({
      COPILOT_MCP_API_KEY: "secret",
      COPILOT_MCP_TOKEN: "already-prefixed",
    })
  })

  test("writes MCP config with restricted permissions", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-copilot-perms-"))

    const config: ClaudeHomeConfig = {
      skills: [],
      mcpServers: {
        server: { command: "echo", args: ["hello"] },
      },
    }

    await syncToCopilot(config, tempRoot)

    const mcpPath = path.join(tempRoot, "mcp-config.json")
    const stat = await fs.stat(mcpPath)
    // Check owner read+write permission (0o600 = 33216 in decimal, masked to file perms)
    const perms = stat.mode & 0o777
    expect(perms).toBe(0o600)
  })

  test("does not write MCP config when no MCP servers", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-copilot-nomcp-"))
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

    await syncToCopilot(config, tempRoot)

    const mcpExists = await fs.access(path.join(tempRoot, "mcp-config.json")).then(() => true).catch(() => false)
    expect(mcpExists).toBe(false)
  })

  test("preserves explicit SSE transport for legacy remote servers", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-copilot-sse-"))

    const config: ClaudeHomeConfig = {
      skills: [],
      mcpServers: {
        legacy: {
          type: "sse",
          url: "https://example.com/sse",
        },
      },
    }

    await syncToCopilot(config, tempRoot)

    const mcpPath = path.join(tempRoot, "mcp-config.json")
    const mcpConfig = JSON.parse(await fs.readFile(mcpPath, "utf8")) as {
      mcpServers: Record<string, { type?: string; url?: string }>
    }

    expect(mcpConfig.mcpServers.legacy).toEqual({
      type: "sse",
      tools: ["*"],
      url: "https://example.com/sse",
    })
  })
})
