import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-commit-push-pr contract", () => {
  test("existing PR rewrites carry the old body into composition", async () => {
    const content = await readRepoFile("skills/ce-commit-push-pr/SKILL.md")

    expect(content).toContain("gh pr view --json url,title,body,state")
    expect(content).toContain("Note the existing PR URL and body from the PR check")
    expect(content).toContain("If Step 1 found an existing PR, pass its URL to Step 4")
    expect(content).toContain("existing body")
    expect(content).toMatch(/preserve.+Related.+Fixes/is)
  })

  test("requires related work references to use tracker-specific closing semantics", async () => {
    const content = await readRepoFile(
      "skills/ce-commit-push-pr/references/pr-description-writing.md",
    )

    expect(content).toContain("## Step B1: Resolve related work references")
    expect(content).toContain("closing reference")
    expect(content).toContain("non-closing reference")
    expect(content).toContain("Do not invent a closing keyword")
    expect(content).toMatch(/git log\s+--format=fuller/)
    expect(content).toContain("full commit messages")
    expect(content).toContain("Do not put a non-closing reference next to close/fix/resolve/address/report wording")
    expect(content).toContain("Use the table's non-closing reference labels exactly")
    expect(content).toContain("Non-closing references always get their own sentence or `## Related` block")
    expect(content).toContain("For a non-closing reference, the tracker ID appears only in that related-reference sentence or block, never in the summary/opening/body prose")
    expect(content).toContain('Bad: "closing one corruption path from #123"')
    expect(content).toContain('Bad: "This addresses the retry-related corruption path reported in #123."')
    expect(content).toContain('Good: "This covers the duplicate-row retry path; concurrent cancellation remains follow-up work."')

    expect(content).toContain("GitHub Issues")
    expect(content).toContain("Fixes #123")
    expect(content).toContain("Fixes owner/repo#123")
    expect(content).toMatch(/target.+default branch/i)

    expect(content).toContain("Linear")
    expect(content).toContain("Fixes ENG-123")
    expect(content).toContain("Related to ENG-123")
    expect(content).toMatch(/PR description.+not.+comment/i)
  })
})

describe("PR concept teaching contract", () => {
  test("SKILL.md wires the teaching gate, pipeline mode, and trailer", async () => {
    const content = await readRepoFile("skills/ce-commit-push-pr/SKILL.md")

    // Non-interactive modifier for orchestrated callers
    expect(content).toContain("mode:pipeline")
    expect(content).toContain("suppress every blocking ask")

    // Config gate: both keys, active-key-only resolution, single-gate semantics
    expect(content).toContain("pr_teaching_section")
    expect(content).toContain("pr_teaching_archive")
    expect(content).toContain("active (non-commented)")
    expect(content).toContain("Step B2")

    // Machine-readable trailer + interactive offer
    expect(content).toContain("New concepts:")
    expect(content).toContain("Run /ce-explain")
  })

  test("SKILL.md archival transition guards ordering, gitignore, and modes", async () => {
    const content = await readRepoFile("skills/ce-commit-push-pr/SKILL.md")

    expect(content).toContain("docs/explainers/")
    expect(content).toContain("input_shape: concept")
    expect(content).toContain("docs(explainer): teach")
    // Declined rewrite must not leave a stray committed-but-unlinked doc
    expect(content).toContain("declined rewrite skips archival")
    // Never force-add an ignored path
    expect(content).toContain("never `git add -f`")
  })

  test("reference composes the section via Step B2 with base-ref novelty checks", async () => {
    const content = await readRepoFile(
      "skills/ce-commit-push-pr/references/pr-description-writing.md",
    )

    expect(content).toContain("## Step B2: Judge new concepts")
    // Self-detection trap: novelty is judged against the base ref
    expect(content).toContain("never the working tree")
    expect(content).toMatch(/git grep[^\n]*<base-remote>\/<base>/)
    // Negative constraint keeps absence the common case
    expect(content).toContain("absence is the common case")
    // Section heading and its slot in Step C's assembly order
    expect(content).toContain("## New concepts")
    expect(content).toContain("New concepts section when Step B2 produced one")
    // Rewrite preservation mirrors the Demo/Screenshots rule
    expect(content).toMatch(/preserve an existing `## New concepts` section/i)
  })

  test("config template documents both teaching keys", async () => {
    const template = await readRepoFile("skills/ce-setup/references/config-template.yaml")

    expect(template).toContain("pr_teaching_section")
    expect(template).toContain("pr_teaching_archive")
  })
})
