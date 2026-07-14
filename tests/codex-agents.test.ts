import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import {
  CODEX_AGENTS_BLOCK_END,
  CODEX_AGENTS_BLOCK_START,
  removeCodexAgentsToolMapBlock,
  stripCodexAgentsToolMap,
} from "../src/utils/codex-agents"

async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8")
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

describe("removeCodexAgentsToolMapBlock", () => {
  test("returns content unchanged when sentinels are absent", () => {
    const input = "# My Rules\n\nKeep this.\n"
    expect(removeCodexAgentsToolMapBlock(input)).toBe(input)
  })

  test("strips only the managed sentinel block", () => {
    const input = [
      "Intro text",
      "",
      CODEX_AGENTS_BLOCK_START,
      "old managed content",
      CODEX_AGENTS_BLOCK_END,
      "",
      "Footer text",
      "",
    ].join("\n")

    const result = removeCodexAgentsToolMapBlock(input)
    expect(result).toContain("Intro text")
    expect(result).toContain("Footer text")
    expect(result).not.toContain(CODEX_AGENTS_BLOCK_START)
    expect(result).not.toContain(CODEX_AGENTS_BLOCK_END)
    expect(result).not.toContain("old managed content")
  })

  test("returns empty string when the file is only the managed block", () => {
    const input = [CODEX_AGENTS_BLOCK_START, "only this", CODEX_AGENTS_BLOCK_END].join("\n")
    expect(removeCodexAgentsToolMapBlock(input)).toBe("")
  })
})

describe("stripCodexAgentsToolMap", () => {
  test("no-ops when AGENTS.md is missing", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-agents-missing-"))
    await stripCodexAgentsToolMap(tempRoot)
    expect(await exists(path.join(tempRoot, "AGENTS.md"))).toBe(false)
  })

  test("preserves user content and removes the managed block", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-agents-strip-"))
    const agentsPath = path.join(tempRoot, "AGENTS.md")
    await fs.writeFile(
      agentsPath,
      ["# My Rules", "", "Keep this.", "", CODEX_AGENTS_BLOCK_START, "legacy map", CODEX_AGENTS_BLOCK_END, ""].join("\n"),
    )

    await stripCodexAgentsToolMap(tempRoot)

    const content = await readFile(agentsPath)
    expect(content).toContain("# My Rules")
    expect(content).toContain("Keep this.")
    expect(content).not.toContain(CODEX_AGENTS_BLOCK_START)
    expect(content).not.toContain("legacy map")
  })

  test("deletes AGENTS.md when it only contained the managed block", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-agents-delete-"))
    const agentsPath = path.join(tempRoot, "AGENTS.md")
    await fs.writeFile(
      agentsPath,
      [CODEX_AGENTS_BLOCK_START, "legacy map", CODEX_AGENTS_BLOCK_END, ""].join("\n"),
    )

    await stripCodexAgentsToolMap(tempRoot)

    expect(await exists(agentsPath)).toBe(false)
  })

  test("leaves AGENTS.md alone when the managed block is already gone", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-agents-clean-"))
    const agentsPath = path.join(tempRoot, "AGENTS.md")
    await fs.writeFile(agentsPath, "# My Rules\n\nKeep this.\n")

    await stripCodexAgentsToolMap(tempRoot)

    expect(await readFile(agentsPath)).toBe("# My Rules\n\nKeep this.\n")
  })
})
