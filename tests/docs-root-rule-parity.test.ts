import { readFile, access } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const REPO_ROOT = path.join(import.meta.dir, "..")
const PLUGIN_ROOT = path.join(REPO_ROOT, "skills")
const FIXTURE = path.join(REPO_ROOT, "tests", "fixtures", "docs-root-rule.md")

// The docs_root resolution rule is byte-duplicated into every skill that
// resolves a CE artifact path (the plugin has no cross-skill import mechanism —
// see AGENTS.md "File References in Skills"). The canonical text lives once in
// the fixture below; each consumer must contain it verbatim. Propagating the
// rule to a new skill is one line here plus the block pasted into that skill.
//
// The block is delimited by <!-- ce-docs-root:start --> / <!-- ce-docs-root:end -->
// so the literal-path guard (docs-root-literals) can allowlist its default
// clauses and this test can locate it precisely.
const CONSUMER_SKILLS = [
  "ce-setup",
  "ce-compound",
  "ce-compound-refresh",
  "ce-plan",
  "ce-brainstorm",
  "ce-ideate",
  "ce-work",
  "ce-pov",
  "ce-optimize",
  "ce-explain",
  "ce-debug",
  "lfg",
  "ce-sweep",
  "ce-dogfood",
  "ce-product-pulse",
  "ce-commit-push-pr",
  "ce-code-review",
  "ce-doc-review",
]

const START = "<!-- ce-docs-root:start -->"
const END = "<!-- ce-docs-root:end -->"

async function canonicalBlock(): Promise<string> {
  const fixture = await readFile(FIXTURE, "utf8")
  const start = fixture.indexOf(START)
  const end = fixture.indexOf(END)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return fixture.slice(start, end + END.length)
}

describe("docs-root rule shared-asset parity", () => {
  test("the fixture defines a single delimited block", async () => {
    const block = await canonicalBlock()
    expect(block.startsWith(START)).toBe(true)
    expect(block.endsWith(END)).toBe(true)
    // Exactly one block in the fixture.
    const fixture = await readFile(FIXTURE, "utf8")
    expect(fixture.split(START).length).toBe(2)
    expect(fixture.split(END).length).toBe(2)
  })

  test("every consumer skill contains the canonical block verbatim", async () => {
    const block = await canonicalBlock()
    for (const skill of CONSUMER_SKILLS) {
      const p = path.join(PLUGIN_ROOT, skill, "SKILL.md")
      await access(p) // fails the test if a consumer is missing the file
      const content = await readFile(p, "utf8")
      expect(content, `${skill}/SKILL.md is missing the docs-root block`).toContain(block)
    }
  })

  test("the canonical block pins its load-bearing clauses", async () => {
    const block = await canonicalBlock()
    // Default clause: unset docs_root falls to the `docs` root.
    expect(block).toContain("`<root>` is `docs`")
    // Fail-closed clause: a rejected value must never silently default.
    expect(block).toContain("never fall back to `docs`")
    // Sole-namespace clause: a configured root suppresses legacy reads.
    expect(block).toContain("never also read `docs`")
    // Byte-parity alone would let every copy drift together to a legacy-read
    // fallback — the exact defect this feature removes.
    expect(block).not.toContain("union")
    // The block is subdir-agnostic: it must not re-enumerate the artifact
    // subdirectories (that list lives in the literal-path guard, not 18× here).
    expect(block).not.toContain("pulse-reports")
    expect(block).not.toContain("feedback-sweep")
  })
})
