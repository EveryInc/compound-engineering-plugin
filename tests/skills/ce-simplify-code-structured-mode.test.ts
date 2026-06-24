import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-simplify-code structured manifest mode", () => {
  test("documents explicit structured manifest mode", async () => {
    const content = await readRepoFile("skills/ce-simplify-code/SKILL.md")
    const schema = await readRepoFile("skills/ce-simplify-code/references/structured-result-schema.md")

    expect(content).toContain("## Composition Mode")
    expect(content).toContain("mode:structured")
    expect(content).toContain("manifest:<path>")
    expect(content).toContain("references/structured-result-schema.md")
    expect(schema).toContain("manifest-scoped structured-result mode")
  })

  test("manifest scope is authoritative and disables branch-diff fallback", async () => {
    const content = await readRepoFile("skills/ce-simplify-code/SKILL.md")

    expect(content).toContain("manifest is authoritative")
    expect(content).toContain("branch-diff fallback is disabled")
    expect(content).toContain("Missing, unreadable, or empty manifest fails closed")
    expect(content).not.toContain("structured mode may widen")
  })

  test("schema includes status, file lists, verification, and issues", async () => {
    const schema = await readRepoFile("skills/ce-simplify-code/references/structured-result-schema.md")

    for (const field of [
      "status",
      "files",
      "created",
      "modified",
      "deleted",
      "applied_simplifications",
      "skipped_simplifications",
      "verification",
      "issues",
    ]) {
      expect(schema).toContain(field)
    }
    expect(schema).toContain("Failed verification reports `failed`")
    expect(schema).toContain("does not claim behavior preservation")
    expect(schema).toContain("Orchestrators must refresh their manifest after this stage even when every list is empty")
    expect(schema).toContain("downstream verification and review must receive the refreshed post-simplification manifest")
  })
})
