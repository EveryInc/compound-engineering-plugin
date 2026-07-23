import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

// Regression guard: the four ce-doc-review presentation surfaces must all defer
// to one shared legibility source (references/rendering-floor.md). The defended
// regression is a surface drifting back to the weaker document-ID-only rule it
// carried before the floor existed, which let findings arrive as dense prose
// full of bare IDs and code symbols a reader could not decide from. This pins
// the single source and every surface's pointer to it.

const REVIEW_DIR = path.join(process.cwd(), "skills/ce-doc-review/references")
const FLOOR = "rendering-floor.md"
const FLOOR_REF = "references/rendering-floor.md"

function read(rel: string): string {
  return readFileSync(path.join(REVIEW_DIR, rel), "utf8")
}

// The four surfaces that render a finding for a human decision. Each must defer
// to the shared floor rather than carry its own weaker legibility rule.
const SURFACES = [
  "synthesis-and-presentation.md",
  "review-output-template.md",
  "walkthrough.md",
  "bulk-preview.md",
  // A Defer persists a finding into the document's Open Questions section — a
  // user-facing surface a later reader consumes, so it must obey the floor too.
  "open-questions-defer.md",
]

describe("ce-doc-review shared rendering floor", () => {
  const floor = read(FLOOR)
  const synth = read("synthesis-and-presentation.md")

  test("floor pins the decision-first field order", () => {
    // Assert the bolded field labels so short words ("Change", "Basis") can't
    // pass by incidental substring match elsewhere in the file.
    for (const field of [
      "**Recommendation**",
      "**Consequence if unchanged**",
      "**Change**",
      "**Basis**",
      "**Trace on request**",
    ]) {
      expect(floor).toContain(field)
    }
  })

  test("floor pins all three opaque-token classes, not document IDs alone", () => {
    for (const cls of [
      "Navigation anchors",
      "Provenance anchors",
      "Mechanism symbols",
    ]) {
      expect(floor).toContain(cls)
    }
  })

  test("floor pins the anchor budget and the identifier-free-consequence invariant", () => {
    expect(floor).toContain("at most two opaque anchors")
    // The load-bearing invariant: the first sentence the reader sees carries no
    // token they'd have to open the doc or code to understand.
    expect(floor).toMatch(/no opaque identifier/i)
  })

  test("floor carries no YAML frontmatter (reference doc, not an agent def)", () => {
    expect(floor.startsWith("---")).toBe(false)
  })

  for (const surface of SURFACES) {
    test(`${surface} defers to the shared floor`, () => {
      expect(read(surface)).toContain(FLOOR_REF)
    })
  }

  test("headless envelope renders the decision-first fields, not a bare Why/title pair", () => {
    expect(synth).toContain("Recommendation: <Apply | Defer | Skip>")
    expect(synth).toContain("Consequence if unchanged: <one sentence, no opaque identifier>")
  })
})

describe("ce-plan surfaces doc-review findings verbatim, not re-narrated", () => {
  // The observed illegible output came through ce-plan re-narrating the headless
  // envelope into denser prose. This pins the instruction that keeps the
  // returned decision-first structure intact.
  const handoff = readFileSync(
    path.join(process.cwd(), "skills/ce-plan/references/plan-handoff.md"),
    "utf8",
  )
  test("plan-handoff forbids re-narrating returned findings", () => {
    expect(handoff).toMatch(/do not re-narrate/i)
    expect(handoff).toContain("Consequence if unchanged")
  })
})
