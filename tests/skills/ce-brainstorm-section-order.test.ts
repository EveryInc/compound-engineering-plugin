import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const BODY = readFileSync(
  path.join(
    process.cwd(),
    "plugins/compound-engineering/skills/ce-brainstorm/references/brainstorm-sections.md",
  ),
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
