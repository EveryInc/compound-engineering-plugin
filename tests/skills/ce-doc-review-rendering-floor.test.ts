import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

// Regression guard: the ce-doc-review presentation surfaces must all defer
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

// Surfaces that render a finding for a human decision. Each must defer
// to the shared floor rather than carry its own weaker legibility rule.
// The walkthrough file owns both the terminal block and the blocking-question
// string; both are named on the floor.
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

  test("floor pins the owner-first field order", () => {
    // Assert the bolded field labels so short words cannot
    // pass by incidental substring match elsewhere in the file.
    for (const field of [
      "**User impact**",
      "**Recommended change**",
      "**If unchanged**",
      "**Basis on request**",
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

  test("floor names the walkthrough blocking-question string as a surface", () => {
    expect(floor).toMatch(/walkthrough blocking-question string/i)
    expect(floor).toMatch(/walkthrough question string/i)
  })

  test("floor carries no YAML frontmatter (reference doc, not an agent def)", () => {
    expect(floor.startsWith("---")).toBe(false)
  })

  for (const surface of SURFACES) {
    test(`${surface} defers to the shared floor`, () => {
      expect(read(surface)).toContain(FLOOR_REF)
    })
  }

  test("non-interactive envelope renders the decision-first fields, not a bare Why/title pair", () => {
    expect(synth).toContain("Recommendation: <Apply | Defer | Skip>")
    expect(synth).toContain("Consequence if unchanged: <one sentence, no opaque identifier>")
  })

  test("default owner surface hides internal review machinery", () => {
    expect(floor).toContain("## Default owner surface")
    expect(floor).toContain("Do not show priority codes")
    expect(floor).toContain("coverage tables")
    expect(floor).toMatch(/provide it only after an explicit request for technical detail/i)
  })
})

describe("ce-plan translates the technical envelope into an owner summary", () => {
  const handoff = readFileSync(
    path.join(process.cwd(), "skills/ce-plan/references/plan-handoff.md"),
    "utf8",
  )
  test("plan-handoff does not expose the returned envelope", () => {
    expect(handoff).toMatch(/Do not render the returned envelope verbatim/i)
    expect(handoff).toContain("User impact / Recommended change / If unchanged")
    expect(handoff).toContain("Ask for technical details")
  })
})

describe("ce-doc-review interaction-order decision context", () => {
  // Defended regression: interactive re-entry / modal AskQuestion skipped the
  // findings summary, so users chose Apply/Defer/Skip from a stem alone.
  const walkthrough = read("walkthrough.md")
  const template = read("review-output-template.md")
  const synth = read("synthesis-and-presentation.md")
  const handoff = readFileSync(
    path.join(process.cwd(), "skills/ce-plan/references/plan-handoff.md"),
    "utf8",
  )

  test("walkthrough requires same-turn presentation before the routing question", () => {
    expect(walkthrough).toContain("Same-turn presentation before routing")
    expect(walkthrough).toMatch(/same turn/i)
    expect(walkthrough).toContain("one-line count")
    expect(walkthrough).toMatch(/prior-turn non-interactive envelope/i)
  })

  test("interactive template and synthesis restate same-turn presentation-before-routing", () => {
    expect(template).toMatch(/same turn/i)
    expect(synth).toMatch(/same turn immediately before the routing question/i)
  })

  test("walkthrough keeps the terminal block and duplicates compact fields into the question string", () => {
    expect(walkthrough).toContain("Never merge the two into a single surface")
    expect(walkthrough).toContain("terminal block uses markdown and remains mandatory")
    expect(walkthrough).toContain("Question string (decision-focused; self-sufficient on modal harnesses)")
    expect(walkthrough).toContain("User impact:")
    expect(walkthrough).toContain("Recommended change:")
    expect(walkthrough).toContain("If unchanged:")
    expect(walkthrough).toContain("Recommended change: none")
    expect(walkthrough).toMatch(/Always emit all three labeled lines/)
    expect(walkthrough).toMatch(/rejects the multi-line question string/)
    expect(walkthrough).not.toContain("compact two-line stem")
    expect(walkthrough).not.toMatch(/Omit a field only when/)
  })

  test("plan-handoff clarifies re-entry reuses state and does not skip presentation", () => {
    expect(handoff).toMatch(/state reuse/i)
    expect(handoff).toContain("skipping Phase 4 presentation")
    expect(handoff).toContain("same-turn presentation-before-routing")
  })
})
