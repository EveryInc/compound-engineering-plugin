import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-codex-loop manifest contract", () => {
  test("defines snapshot, overlap, and loop-owned manifest behavior", async () => {
    const content = await readRepoFile("skills/ce-codex-loop/references/working-tree-manifest.md")

    expect(content).toContain("head_sha")
    expect(content).toContain("staged")
    expect(content).toContain("unstaged")
    expect(content).toContain("untracked")
    expect(content).toContain("stable_review_base")
    expect(content).toContain("created")
    expect(content).toContain("modified")
    expect(content).toContain("deleted")
    expect(content).toContain("temporarily_indexed")
    expect(content).toContain("v1 keeps `temporarily_indexed` empty")

    expect(content).toContain("Pre-existing overlapping tracked edit")
    expect(content).toContain("stop before mutation")
    expect(content).toContain("Pre-existing unrelated edits remain excluded")
    expect(content).toContain("Loop-created untracked files")
    expect(content).toContain("without staging")
    expect(content).toContain("original staged state must be unchanged")
  })

  test("orchestrator refreshes manifest after each mutating stage", async () => {
    const content = await readRepoFile("skills/ce-codex-loop/SKILL.md")

    expect(content).toContain("Refresh the manifest after implementation, simplification, each fix wave, and each repair-or-revert pass")
    expect(content).toContain("created, modified, deleted, and temporarily_indexed")
    expect(content).toContain("Plan file scope")
    expect(content).toContain("stage structured file lists")
    expect(content).toContain("working-tree delta")
  })
})
