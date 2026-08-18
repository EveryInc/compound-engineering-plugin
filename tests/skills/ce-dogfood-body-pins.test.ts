import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import path from "path"

// ce-dogfood's body was cut to fit Codex's 8000-byte skill prompt budget, with
// the per-phase procedure relocated to references/phases.md. Guards split by
// load-time: rules that must fire before any reference is read are pinned
// against SKILL.md; relocated procedure is pinned against phases.md, the file
// that now owns it.
const SKILL_DIR = path.join(import.meta.dir, "..", "..", "skills", "ce-dogfood")
const body = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8")

describe("ce-dogfood always-loaded body pins", () => {
  test("states the outcome and a done bar a red suite resolves to not-ready", () => {
    expect(body).toContain("**Outcome:**")
    expect(body).toContain("**Done:**")
    expect(body).toMatch(/green matrix over a red suite/i)
    // The run still finalizes a report; it does not stay open chasing the suite.
    expect(body).toMatch(/not-ready verdict rather than a ready one/i)
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

// The phase procedure moved to exactly one file, so pin it there rather than to
// the corpus: several of these strings also occur in the report template, where
// they are descriptive rather than operative, and a corpus grep would stay green
// after the operative instruction was deleted.
describe("ce-dogfood relocated procedure stays in references/phases.md", () => {
  const phases = readFileSync(path.join(SKILL_DIR, "references", "phases.md"), "utf8")

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
    test(`phases.md keeps: ${invariant.slice(0, 48)}`, () => {
      expect(phases.toLowerCase()).toContain(invariant.toLowerCase())
    })
  }
})
