import { readFile, access } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const REPO_ROOT = path.join(import.meta.dir, "..")
const PLUGIN_ROOT = path.join(REPO_ROOT, "skills")
const FIXTURE = path.join(REPO_ROOT, "tests", "fixtures", "knowledge-layout-rule.md")

// The knowledge-layout resolution rule is byte-duplicated into every skill that
// files, moves, or promotes a knowledge artifact (no cross-skill imports — see
// AGENTS.md "File References in Skills"). The canonical text lives once in the
// fixture; each consumer must contain it verbatim. The block is delimited by
// <!-- ce-knowledge-layout:start --> / <!-- ce-knowledge-layout:end -->.
//
// The block lives in the consumer's SKILL.md unless that skill relocated it to
// a reference it requires before composing any knowledge path. CONSUMER_FILES
// records the exception.
const CONSUMER_FILES: Record<string, string> = {
  // ce-setup owns the canonical statement inside the reference its `knowledge`
  // argument routes to; SKILL.md sits at the Codex 8000-byte bound.
  "ce-setup": "references/knowledge-layout.md",
  // ce-compound composes the learnings-role path only in assembly's destination
  // step, a required read at step 3; SKILL.md sits at the Codex bound.
  "ce-compound": "references/assembly.md",
}
const CONSUMER_SKILLS = ["ce-setup", "ce-capture", "ce-dream", "ce-experiment", "ce-compound"]

const START = "<!-- ce-knowledge-layout:start -->"
const END = "<!-- ce-knowledge-layout:end -->"

async function canonicalBlock(): Promise<string> {
  const fixture = await readFile(FIXTURE, "utf8")
  const start = fixture.indexOf(START)
  const end = fixture.indexOf(END)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return fixture.slice(start, end + END.length)
}

describe("knowledge-layout rule shared-asset parity", () => {
  test("the fixture defines a single delimited block", async () => {
    const block = await canonicalBlock()
    expect(block.startsWith(START)).toBe(true)
    expect(block.endsWith(END)).toBe(true)
    const fixture = await readFile(FIXTURE, "utf8")
    expect(fixture.split(START).length).toBe(2)
    expect(fixture.split(END).length).toBe(2)
  })

  test("every consumer skill contains the canonical block verbatim", async () => {
    const block = await canonicalBlock()
    for (const skill of CONSUMER_SKILLS) {
      const rel = CONSUMER_FILES[skill] ?? "SKILL.md"
      const p = path.join(PLUGIN_ROOT, skill, rel)
      await access(p)
      const content = await readFile(p, "utf8")
      expect(content, `${skill}/${rel} is missing the knowledge-layout block`).toContain(block)
    }
  })

  test("the canonical block pins its load-bearing clauses", async () => {
    const block = await canonicalBlock()
    // Read from the tracked file only; local never supplies a layout.
    expect(block).toContain("`config.local.yaml` never supplies it")
    // Unset means no layout, never a guessed folder.
    expect(block).toContain("do not guess a folder")
    // Fail-closed clause.
    expect(block).toContain("never fall back to a default folder")
    // The fixed role enum and the three roles every layout must set.
    expect(block).toContain("inbox, sources, ideas, themes, projects, notes, learnings, writing, memory, scratch, archive, templates")
    expect(block).toContain("at least `inbox`, `learnings`, and `memory`")
    // Reserved index key accepts only `none` in this release.
    expect(block).toContain("`index` is `none`")
    // Write authority is data: git.allow + non-none mode, else proposals.
    expect(block).toContain("`git.allow`")
    expect(block).toContain("everything else is a proposal")
    // An unset role is a prohibition, not a default.
    expect(block).toContain("do not create it, do not file there")
  })
})
