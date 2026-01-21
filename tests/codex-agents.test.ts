import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import {
  CODEX_AGENTS_BLOCK_END,
  CODEX_AGENTS_BLOCK_START,
  ensureCodexAgentsFile,
} from "../src/utils/codex-agents"

async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8")
}

describe("ensureCodexAgentsFile", () => {
  test("creates AGENTS.md with managed block when missing", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-agents-"))
    await ensureCodexAgentsFile(tempRoot)

    const agentsPath = path.join(tempRoot, "AGENTS.md")
    const content = await readFile(agentsPath)
    expect(content).toContain(CODEX_AGENTS_BLOCK_START)
    expect(content).toContain("Tool mapping")
    expect(content).toContain(CODEX_AGENTS_BLOCK_END)
  })

  test("appends block without touching existing content", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-agents-existing-"))
    const agentsPath = path.join(tempRoot, "AGENTS.md")
    await fs.writeFile(agentsPath, "# My Rules\n\nKeep this.")

    await ensureCodexAgentsFile(tempRoot)

    const content = await readFile(agentsPath)
    expect(content).toContain("# My Rules")
    expect(content).toContain("Keep this.")
    expect(content).toContain(CODEX_AGENTS_BLOCK_START)
    expect(content).toContain(CODEX_AGENTS_BLOCK_END)
  })

  test("replaces only the managed block when present", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-agents-update-"))
    const agentsPath = path.join(tempRoot, "AGENTS.md")
    const seed = [
      "Intro text",
      CODEX_AGENTS_BLOCK_START,
      "old content",
      CODEX_AGENTS_BLOCK_END,
      "Footer text",
    ].join("\n")
    await fs.writeFile(agentsPath, seed)

    await ensureCodexAgentsFile(tempRoot)

    const content = await readFile(agentsPath)
    expect(content).toContain("Intro text")
    expect(content).toContain("Footer text")
    expect(content).not.toContain("old content")
    expect(content).toContain(CODEX_AGENTS_BLOCK_START)
    expect(content).toContain(CODEX_AGENTS_BLOCK_END)
  })
})
