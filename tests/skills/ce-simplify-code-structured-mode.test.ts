import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

async function readStructuredManifestSafetyFixture(): Promise<{
  valid_manifest: {
    normalized_paths: string[]
    allowed: boolean
  }
  unsafe_entries: Array<{ value: unknown; reason: string; allowed: boolean }>
  duplicate_entries: {
    normalized: string[]
    reason: string
    allowed: boolean
  }
  failure_boundary: {
    fails_before: string[]
    branch_diff_fallback: boolean
    stages_untracked_files: boolean
  }
}> {
  return JSON.parse(
    await readRepoFile("tests/fixtures/ce-simplify-code/structured-manifest-safety.json"),
  )
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
    expect(content).toContain("Before Step 1 or any agent dispatch")
    expect(content).toContain("non-string values")
    expect(content).toContain("absolute paths")
    expect(content).toContain("repo escapes after normalization")
    expect(content).toContain("duplicate normalized paths")
    expect(content).toContain("Do not stage untracked files")
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
    expect(schema).toContain("validate every manifest entry")
    expect(schema).toContain("Absolute paths, repo escapes, duplicate normalized paths, and non-string entries are unsafe")
    expect(schema).toContain("must fail before Step 1 or agent dispatch")
    expect(schema).toContain("Orchestrators must refresh their manifest after this stage even when every list is empty")
    expect(schema).toContain("downstream verification and review must receive the refreshed post-simplification manifest")
  })

  test("structured manifest validation fails closed for unsafe entries before simplification", async () => {
    const fixture = await readStructuredManifestSafetyFixture()

    expect(fixture.valid_manifest.allowed).toBe(true)
    expect(fixture.valid_manifest.normalized_paths).toEqual([
      "src/new-helper.ts",
      "src/math.ts",
      "src/old-helper.ts",
      "tests/math.test.ts",
    ])
    expect(fixture.unsafe_entries.map((entry) => entry.reason)).toEqual([
      "absolute_path",
      "repo_escape",
      "dot_segment",
      "empty_string",
      "non_string",
      "non_string",
    ])
    expect(fixture.unsafe_entries.every((entry) => entry.allowed === false)).toBe(true)
    expect(fixture.duplicate_entries).toMatchObject({
      normalized: ["src/math.ts", "src/math.ts"],
      reason: "duplicate_normalized_path",
      allowed: false,
    })
    expect(fixture.failure_boundary).toEqual({
      fails_before: ["Step 1", "agent_dispatch"],
      branch_diff_fallback: false,
      stages_untracked_files: false,
    })
  })
})
