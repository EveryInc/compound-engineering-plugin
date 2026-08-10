import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL = readFileSync(
  path.join(process.cwd(), "skills", "ce-brainstorm", "SKILL.md"),
  "utf8",
)

describe("ce-brainstorm domain tripwire", () => {
  test("declares all five falsifiable triggers", () => {
    // The tripwire is only useful if it names the conditions that fire it.
    // A vaguer "watch the vocabulary" instruction is what this replaces.
    expect(SKILL).toContain("contradicts a definition in the vocabulary you loaded")
    expect(SKILL).toContain("carrying a decision")
    expect(SKILL).toContain("a new entity, named process, or status concept appears")
    expect(SKILL).toContain("a relation or invariant between existing terms changes")
    expect(SKILL).toContain("a term crosses a declared context boundary")
  })

  test("requires surfacing the conflict on the turn it is noticed", () => {
    expect(SKILL).toContain("in the same turn you notice it")
  })

  test("requires scenario pressure and code confrontation", () => {
    expect(SKILL).toContain("one concrete scenario or edge case")
    expect(SKILL).toContain("verify that against the code")
  })

  test("carries the restraint condition", () => {
    // Guarding both directions: a tripwire that always fires is a regression,
    // not a feature. The eval suite covers behavior; this pins the rule's
    // presence so it cannot be dropped as redundant prose.
    expect(SKILL).toContain("**Do not fire**")
    expect(SKILL).toContain("no decision riding on it")
  })

  test("defers writes to Vocabulary Capture rather than mid-dialogue", () => {
    expect(SKILL).toContain("written only at Vocabulary Capture")
  })

  test("fires before Vocabulary Capture in document order", () => {
    const tripwire = SKILL.indexOf("**Domain tripwire")
    const capture = SKILL.indexOf("#### Vocabulary Capture")
    expect(tripwire).toBeGreaterThan(-1)
    expect(capture).toBeGreaterThan(-1)
    expect(capture).toBeGreaterThan(tripwire)
  })
})

describe("ce-brainstorm ADR gate", () => {
  test("names all three conditions and the skip rule", () => {
    expect(SKILL).toMatch(/hard to reverse[^\n]+surprising without context[^\n]+real trade-off/i)
    expect(SKILL).toContain("If any one is missing, skip it")
  })

  test("uses the project's own ADR conventions", () => {
    expect(SKILL).toContain("do not impose one")
  })
})

describe("ce-brainstorm vocabulary capture routing", () => {
  test("routes the write target through the shared contract", () => {
    expect(SKILL).toContain("references/domain-vocabulary.md")
  })

  test("asks rather than creating a missing context glossary", () => {
    expect(SKILL).toContain("ask rather than guessing or creating it")
  })

  test("keeps a boundary-crossing capture atomic", () => {
    expect(SKILL).toContain("all-or-nothing")
  })

  test("does not instruct writing vocabulary before the Product Contract", () => {
    const capture = SKILL.indexOf("#### Vocabulary Capture")
    const heading = SKILL.slice(capture, capture + 200)
    expect(heading).toContain("after the requirements-only unified plan")
  })

  test("reads context glossaries when the root is an index", () => {
    expect(SKILL).toContain("parseable `## Contexts` index")
  })
})
