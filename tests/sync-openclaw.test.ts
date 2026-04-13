import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import type { ClaudeHomeConfig } from "../src/parsers/claude-home"
import { syncToOpenClaw } from "../src/sync/openclaw"

describe("syncToOpenClaw", () => {
  test("symlinks skills and warns instead of writing unvalidated MCP config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-openclaw-"))
    const fixtureSkillDir = path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one")
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (message?: unknown) => {
      warnings.push(String(message))
    }

    try {
      const config: ClaudeHomeConfig = {
        skills: [
          {
            name: "skill-one",
            sourceDir: fixtureSkillDir,
            skillPath: path.join(fixtureSkillDir, "SKILL.md"),
          },
        ],
        commands: [
          {
            name: "workflows:plan",
            description: "Planning command",
            body: "Plan the work.",
            sourcePath: "/tmp/workflows/plan.md",
          },
        ],
        mcpServers: {
          remote: { url: "https://example.com/mcp" },
        },
      }

      await syncToOpenClaw(config, tempRoot)
    } finally {
      console.warn = originalWarn
    }

    expect((await fs.lstat(path.join(tempRoot, "skills", "skill-one"))).isSymbolicLink()).toBe(true)
    const openclawConfigExists = await fs.access(path.join(tempRoot, "openclaw.json")).then(() => true).catch(() => false)
    expect(openclawConfigExists).toBe(false)
    expect(warnings.some((warning) => warning.includes("OpenClaw personal command sync is skipped"))).toBe(true)
    expect(warnings.some((warning) => warning.includes("OpenClaw MCP sync is skipped"))).toBe(true)
  })
})
