import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writeCursorBundle } from "../src/targets/cursor"
import type { CursorBundle } from "../src/types/cursor"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

describe("writeCursorBundle", () => {
  test("writes rules, commands, skills, and mcp.json", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-test-"))
    const bundle: CursorBundle = {
      rules: [{ name: "security-reviewer", content: "---\ndescription: Security\nglobs: \"\"\nalwaysApply: false\n---\n\nReview code." }],
      commands: [{ name: "plan", content: "<!-- Planning -->\n\nPlan the work." }],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      mcpServers: {
        playwright: { command: "npx", args: ["-y", "@anthropic/mcp-playwright"] },
      },
    }

    await writeCursorBundle(tempRoot, bundle)

    expect(await exists(path.join(tempRoot, ".cursor", "rules", "security-reviewer.mdc"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".cursor", "commands", "plan.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".cursor", "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".cursor", "mcp.json"))).toBe(true)

    const ruleContent = await fs.readFile(
      path.join(tempRoot, ".cursor", "rules", "security-reviewer.mdc"),
      "utf8",
    )
    expect(ruleContent).toContain("Review code.")

    const commandContent = await fs.readFile(
      path.join(tempRoot, ".cursor", "commands", "plan.md"),
      "utf8",
    )
    expect(commandContent).toContain("Plan the work.")

    const mcpContent = JSON.parse(
      await fs.readFile(path.join(tempRoot, ".cursor", "mcp.json"), "utf8"),
    )
    expect(mcpContent.mcpServers.playwright.command).toBe("npx")
  })

  test("writes directly into a .cursor output root without double-nesting", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-home-"))
    const cursorRoot = path.join(tempRoot, ".cursor")
    const bundle: CursorBundle = {
      rules: [{ name: "reviewer", content: "Reviewer rule content" }],
      commands: [{ name: "plan", content: "Plan content" }],
      skillDirs: [],
    }

    await writeCursorBundle(cursorRoot, bundle)

    expect(await exists(path.join(cursorRoot, "rules", "reviewer.mdc"))).toBe(true)
    expect(await exists(path.join(cursorRoot, "commands", "plan.md"))).toBe(true)
    // Should NOT double-nest under .cursor/.cursor
    expect(await exists(path.join(cursorRoot, ".cursor"))).toBe(false)
  })

  test("handles empty bundles gracefully", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-empty-"))
    const bundle: CursorBundle = {
      rules: [],
      commands: [],
      skillDirs: [],
    }

    await writeCursorBundle(tempRoot, bundle)
    expect(await exists(tempRoot)).toBe(true)
  })

  test("writes multiple rules as separate .mdc files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-multi-"))
    const cursorRoot = path.join(tempRoot, ".cursor")
    const bundle: CursorBundle = {
      rules: [
        { name: "security-sentinel", content: "Security rules" },
        { name: "performance-oracle", content: "Performance rules" },
        { name: "code-simplicity-reviewer", content: "Simplicity rules" },
      ],
      commands: [],
      skillDirs: [],
    }

    await writeCursorBundle(cursorRoot, bundle)

    expect(await exists(path.join(cursorRoot, "rules", "security-sentinel.mdc"))).toBe(true)
    expect(await exists(path.join(cursorRoot, "rules", "performance-oracle.mdc"))).toBe(true)
    expect(await exists(path.join(cursorRoot, "rules", "code-simplicity-reviewer.mdc"))).toBe(true)
  })

  test("backs up existing mcp.json before overwriting", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-backup-"))
    const cursorRoot = path.join(tempRoot, ".cursor")
    await fs.mkdir(cursorRoot, { recursive: true })

    // Write an existing mcp.json
    const mcpPath = path.join(cursorRoot, "mcp.json")
    await fs.writeFile(mcpPath, JSON.stringify({ mcpServers: { old: { command: "old-cmd" } } }))

    const bundle: CursorBundle = {
      rules: [],
      commands: [],
      skillDirs: [],
      mcpServers: {
        newServer: { command: "new-cmd" },
      },
    }

    await writeCursorBundle(cursorRoot, bundle)

    // New mcp.json should have the new content
    const newContent = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(newContent.mcpServers.newServer.command).toBe("new-cmd")

    // A backup file should exist
    const files = await fs.readdir(cursorRoot)
    const backupFiles = files.filter((f) => f.startsWith("mcp.json.bak."))
    expect(backupFiles.length).toBeGreaterThanOrEqual(1)
  })
})
