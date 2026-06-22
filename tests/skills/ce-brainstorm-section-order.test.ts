import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const BODY = readFileSync(
  path.join(
    process.cwd(),
    "skills/ce-brainstorm/references/brainstorm-sections.md",
  ),
  "utf8",
)

const DOC_BODY = readFileSync(
  path.join(process.cwd(), "docs/skills/ce-brainstorm.md"),
  "utf8",
)

// The 2026-05-13 cloakbrowser brainstorm dogfood put Key Decisions late in
// the artifact, where it got lost in the details. The decisions in that doc
// were framing choices that constrained Requirements / Flows / Scope — they
// belong near the top so the reader encounters them as the doc's narrative
// spine, not as bottom-of-doc reference material. Under the agency-driven
// section contract, "Include when material" lists Key Decisions early in
// the catalog (right after Problem Frame) and the catalog item's prose
// states the placement rationale.
describe("ce-brainstorm Key Decisions placement", () => {
  test("Key Decisions appears early in the Include-when-material catalog (after Problem Frame, before Actors / Key Flows / Scope)", () => {
    const catalogStart = BODY.indexOf("## Include when material")
    expect(catalogStart).toBeGreaterThan(-1)
    const catalogEnd = BODY.indexOf("\n## ", catalogStart + 5)
    const catalog = BODY.slice(catalogStart, catalogEnd)

    const problemFrame = catalog.indexOf("**Problem Frame**")
    const keyDecisions = catalog.indexOf("**Key Decisions**")
    const actors = catalog.indexOf("**Actors**")
    const keyFlows = catalog.indexOf("**Key Flows**")
    const scopeBoundaries = catalog.indexOf("**Scope Boundaries**")

    expect(problemFrame).toBeGreaterThan(-1)
    expect(keyDecisions).toBeGreaterThan(-1)
    expect(actors).toBeGreaterThan(-1)
    expect(keyFlows).toBeGreaterThan(-1)
    expect(scopeBoundaries).toBeGreaterThan(-1)

    // Key Decisions must sit AFTER Problem Frame and BEFORE Actors / Key
    // Flows / Scope Boundaries in the catalog.
    expect(keyDecisions).toBeGreaterThan(problemFrame)
    expect(keyDecisions).toBeLessThan(actors)
    expect(keyDecisions).toBeLessThan(keyFlows)
    expect(keyDecisions).toBeLessThan(scopeBoundaries)
  })

  test("Key Decisions catalog item explains its placement to the agent", () => {
    // The placement rationale must be visible at the catalog item itself
    // so the agent reading the contract sees the why inline. Defends
    // against a future edit that drops Key Decisions to a later catalog
    // position because "audit content typically goes at the end."
    const keyDecIdx = BODY.indexOf("**Key Decisions**")
    expect(keyDecIdx).toBeGreaterThan(-1)
    const itemRegion = BODY.slice(keyDecIdx, keyDecIdx + 700)
    expect(
      /constrain Requirements|sits high|sits here|near the top|opinionated|framing choices/i.test(itemRegion),
      "Key Decisions catalog item must include placement rationale (constrains Requirements / Flows / Scope; sits near the top; opinionated framing choices).",
    ).toBe(true)
  })
})

// Mirror of the plan-sections.md metadata test on the ce-plan side
// (`plan-sections.md enumerates the required plan metadata fields by name`).
// PR #826 split the prescriptive requirements-capture.md into a section
// contract (brainstorm-sections.md) + format-rendering refs.
// markdown-rendering.md now says "Per-skill frontmatter fields are defined
// in each skill's section contract" — so brainstorm-sections.md MUST
// actually list them or downstream consumers that key on these field names
// (filename construction via `date`+`topic`, Phase 0.1 resume detection)
// break silently when agents compose brainstorms from the new refs.
describe("ce-brainstorm metadata field contract", () => {
  test("brainstorm-sections.md enumerates the required brainstorm metadata fields by name", () => {
    // Required field names that downstream consumers depend on.
    for (const field of ["date", "topic"]) {
      expect(
        new RegExp(`\\b${field}\\b`).test(BODY),
        `brainstorm-sections.md must name the required '${field}' metadata field — downstream tooling keys on it (filename construction, resume detection).`,
      ).toBe(true)
    }
  })

  test("brainstorm-sections.md states brainstorms carry no status field", () => {
    // No CE artifact carries a mutable status field — the active → completed
    // lifecycle was removed (ce-work no longer mutates plans; completion is
    // derived from git). The contract must say so explicitly so an agent
    // composing a brainstorm doesn't invent a status field.
    expect(
      /no `?status`? field|no.*active.*completed/i.test(BODY),
      "brainstorm-sections.md must explicitly state that brainstorms carry no `status` field / `active → completed` lifecycle.",
    ).toBe(true)
  })
})

describe("ce-brainstorm user doc section numbering", () => {
  test("numbered ### sections are sequential", () => {
    const numbers = [...DOC_BODY.matchAll(/^### (\d+)\./gm)].map((match) => Number(match[1]))
    expect(numbers.length).toBeGreaterThan(0)
    numbers.forEach((number, index) => {
      expect(number).toBe(index + 1)
    })
  })
})
