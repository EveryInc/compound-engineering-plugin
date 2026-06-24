import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-work implementation-only mode", () => {
  test("documents explicit opt-in argument parsing and bare prompt rejection", async () => {
    const content = await readRepoFile("skills/ce-work/SKILL.md")
    const mode = await readRepoFile("skills/ce-work/references/implementation-only-mode.md")

    expect(content).toContain("mode:implementation-only")
    expect(content).toContain("references/implementation-only-mode.md")
    expect(mode).toContain("valid only with a plan-file input")
    expect(mode).toContain("Reject bare prompts")
    expect(mode).toContain("Strip `mode:implementation-only`")
  })

  test("skips branch, commit, simplify, review, and shipping behavior only in the new mode", async () => {
    const content = await readRepoFile("skills/ce-work/SKILL.md")
    const mode = await readRepoFile("skills/ce-work/references/implementation-only-mode.md")

    expect(mode).toContain("Do not create or switch branches")
    expect(mode).toContain("Do not create commits")
    expect(mode).toContain("Do not invoke `ce-simplify-code`")
    expect(mode).toContain("Do not invoke `ce-code-review`")
    expect(mode).toContain("Do not load `references/shipping-workflow.md`")
    expect(mode).toContain("Do not push, create or edit a PR, watch CI, or run release automation")
    expect(content).toContain("Default behavior is unchanged")
  })

  test("defines structured result statuses and file lists", async () => {
    const mode = await readRepoFile("skills/ce-work/references/implementation-only-mode.md")

    for (const status of ["completed", "already_satisfied", "partial", "failed"]) {
      expect(mode).toContain(status)
    }
    for (const field of [
      "files",
      "created",
      "modified",
      "deleted",
      "verification",
      "issues",
      "already_satisfied_proof",
    ]) {
      expect(mode).toContain(field)
    }
    expect(mode).toContain("`already_satisfied` is valid only with proof")
    expect(mode).toContain("identified files")
  })
})
