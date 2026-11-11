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
    expect(body).toMatch(/prefer a built-in browser over the `agent-browser` CLI/i)
    expect(body).toMatch(/one browser for the whole run/i)
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

  test("asks a person only for what the run cannot continue without", () => {
    expect(body).toMatch(/run cannot continue without something only the user has/i)
    expect(body).toMatch(/handed back once, at the end/i)
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
    "paper cut",
    "Decisions for a human",
    "one logical fix per commit",
    "references/agent-browser-driver.md",
    "find every browser this environment offers",
    "the app hosting this session",
    "local stand-in",
  ]) {
    test(`phases.md keeps: ${invariant.slice(0, 48)}`, () => {
      expect(phases.toLowerCase()).toContain(invariant.toLowerCase())
    })
  }

  test("phase 0 isolates and resumes without asking", () => {
    expect(phases).toMatch(/Isolate it without asking/)
    expect(phases).toMatch(/resume it without asking/)
    expect(phases).not.toMatch(/Offer isolation/)
  })
})

describe("ce-dogfood agent-browser driver reference", () => {
  const driver = readFileSync(path.join(SKILL_DIR, "references", "agent-browser-driver.md"), "utf8")

  for (const command of [
    "command -v agent-browser",
    "agent-browser skills get core",
    "agent-browser snapshot -i",
    "agent-browser errors",
    "agent-browser --headed open",
    "agent-browser --session viewer open",
  ]) {
    test(`driver reference keeps: ${command}`, () => {
      expect(driver).toContain(command)
    })
  }
})
