import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL = readFileSync(
  path.join(process.cwd(), "skills", "ce-plan", "SKILL.md"),
  "utf8",
)

const GAP_FILL_START = SKILL.indexOf("**CONCEPTS.md gap-fill")
const GAP_FILL = SKILL.slice(GAP_FILL_START, GAP_FILL_START + 1400)

describe("ce-plan vocabulary reading", () => {
  test("reads context glossaries when the root is an index", () => {
    expect(SKILL).toContain("parseable `## Contexts` index")
    expect(SKILL).toContain("qualify a term by its context")
  })
})

describe("ce-plan gap-fill routing", () => {
  test("resolves the write target through the shared contract", () => {
    expect(GAP_FILL_START).toBeGreaterThan(-1)
    expect(GAP_FILL).toContain("references/domain-vocabulary.md")
  })

  test("skips the write when ownership is ambiguous", () => {
    // Gap-fill is a silent path -- it must degrade to an open question rather
    // than asking mid-flow or guessing an owner.
    expect(GAP_FILL).toContain("never asks and never creates")
    expect(GAP_FILL).toContain("Open Questions")
  })

  test("skips the write when the owning glossary does not exist", () => {
    expect(GAP_FILL).toContain("does not exist yet")
  })

  test("stops entirely on a blocked state", () => {
    expect(GAP_FILL).toContain("stops gap-fill entirely")
  })

  test("no longer fills terms into the root unconditionally", () => {
    // The pre-change instruction added the entry to CONCEPTS.md with no target
    // resolution at all; the routing sentence must follow it in the same block.
    const addEntry = GAP_FILL.indexOf("add the entry")
    const resolve = GAP_FILL.indexOf("Resolve the write target")
    expect(addEntry).toBeGreaterThan(-1)
    expect(resolve).toBeGreaterThan(addEntry)
  })
})
