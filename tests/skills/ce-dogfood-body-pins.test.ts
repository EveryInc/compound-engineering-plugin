import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "fs"
import path from "path"

// ce-dogfood's body was cut to fit Codex's 8000-byte skill prompt budget, with
// the per-phase procedure relocated to references/phases.md. Guards split by
// load-time: rules that must fire before any reference is read are pinned
// against SKILL.md; relocated procedure is pinned against the skill corpus.
const SKILL_DIR = path.join(import.meta.dir, "..", "..", "skills", "ce-dogfood")
const body = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8")
const corpus = [
  body,
  ...readdirSync(path.join(SKILL_DIR, "references")).map((f) =>
    readFileSync(path.join(SKILL_DIR, "references", f), "utf8"),
  ),
].join("\n")

describe("ce-dogfood always-loaded body pins", () => {
  test("states the outcome and a done bar that a red suite cannot satisfy", () => {
    expect(body).toContain("**Outcome:**")
    expect(body).toContain("**Done:**")
    expect(body).toMatch(/green matrix over a red suite/i)
  })

  test("keeps the boundaries that decide mutations and tooling", () => {
    expect(body).toContain("agent-browser")
    expect(body).toContain("mcp__claude-in-chrome__*")
    expect(body).toContain("npx agent-browser")
    expect(body).toMatch(/never dogfood the trunk/i)
    // A PR target is diffable even when its head branch is named main.
    expect(body).toMatch(/PR identity/i)
    expect(body).toMatch(/ce-worktree/)
    expect(body).toContain("ce-dogfood-XXXXXX")
    expect(body).toMatch(/auto-fix only what is small/i)
  })

  test("keeps the ordering invariant and the required read", () => {
    expect(body).toContain("references/phases.md")
    expect(body).toMatch(/flow model precedes the matrix/i)
    expect(body.indexOf("references/phases.md")).toBeLessThan(body.indexOf("## Boundaries"))
  })

  test("keeps the checkpoint, slug, and terminal-state rules", () => {
    expect(body).toContain("dogfood-report-template.md")
    expect(body).toContain("<branch-slug>")
    expect(body).toContain("Blocked (needs human verify)")
    expect(body).toContain("Blocked (human decision)")
    expect(body).toMatch(/ends that scenario, not the run/i)
  })
})

describe("ce-dogfood relocated procedure stays greppable in the corpus", () => {
  for (const invariant of [
    "refs/remotes/origin/HEAD",
    'git diff --name-only "$TRUNK...HEAD"',
    "gh pr view <number> --json headRefName,isCrossRepository",
    "flowchart TD",
    "STRATEGY.md",
    "agent-browser snapshot -i",
    "agent-browser errors",
    "paper cut",
    "Decisions for a human",
    "one logical fix per commit",
  ]) {
    test(`corpus keeps: ${invariant.slice(0, 48)}`, () => {
      expect(corpus.toLowerCase()).toContain(invariant.toLowerCase())
    })
  }
})
