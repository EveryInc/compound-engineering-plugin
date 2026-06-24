import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-code-review manifest scope", () => {
  test("documents manifest argument parsing for mode:agent", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")

    expect(content).toContain("manifest:<path>")
    expect(content).toContain("Recognized only in `mode:agent`")
    expect(content).toContain("manifest-scoped review")
    expect(content).toContain("Missing manifest fails in `mode:agent`")
    expect(content).toContain("Default review behavior without manifest remains unchanged")
  })

  test("manifest scope restricts files, findings, and untracked coverage", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")
    const diffScope = await readRepoFile("skills/ce-code-review/references/diff-scope.md")

    expect(content).toContain("Build `FILES:` and `DIFF:` by intersecting")
    expect(content).toContain("stable `base:<ref>` diff with manifest entries")
    expect(content).toContain("generated create-file diff snippets")
    expect(content).toContain("full file content")
    expect(content).toContain("without changing the git index")
    expect(content).toContain("Out-of-manifest findings are never added to `actionable_findings`")
    expect(content).toContain("reported in `coverage.out_of_scope_findings`")

    expect(diffScope).toContain("Manifest-scoped review")
    expect(diffScope).toContain("Inspect only manifest paths")
    expect(diffScope).toContain("Do not Read/Grep out-of-manifest paths")
  })
})
