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
    expect(content).toContain("## Planned Scope")
    expect(content).toContain('"test_paths": []')
    expect(content).toContain("Create, Modify, Delete, Test")
    expect(content).toContain("Staged and unstaged tracked edits")
    expect(content).toContain("planned Create paths")
    expect(content).toContain("fails closed before mutation")
  })

  test("orchestrator refreshes manifest after each mutating stage", async () => {
    const content = await readRepoFile("skills/ce-codex-loop/SKILL.md")

    expect(content).toContain("Refresh the manifest after implementation, simplification, each fix wave, and each repair-or-revert pass")
    expect(content).toContain("created, modified, deleted, and temporarily_indexed")
    expect(content).toContain("precise planned scope")
    expect(content).toContain("stage structured file lists")
    expect(content).toContain("working-tree delta")
  })

  test("terminal report separates reviewed manifest, compound outputs, and final delta", async () => {
    const content = await readRepoFile("skills/ce-codex-loop/references/working-tree-manifest.md")

    expect(content).toContain("## Terminal Deltas")
    expect(content).toContain("reviewed_manifest")
    expect(content).toContain("compound_outputs")
    expect(content).toContain("final_repository_delta")
    expect(content).toContain("must never be folded into `reviewed_manifest`")
  })
})
