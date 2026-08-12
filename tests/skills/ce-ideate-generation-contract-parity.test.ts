import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

// `references/universal-ideation.md` is a PARALLEL IMPLEMENTATION of the same
// generation contract, for topics with no software surface. It is loaded
// INSTEAD OF `divergent-ideation.md`, so every mode-agnostic rule has to exist
// in both files and nothing structural keeps them in step.
//
// That gap produced four separate review findings on PR #1357, each a
// DIFFERENT rule that never made it across: tactical scaling, the depth cue,
// the volume-override escape, and the verification-read cap. Patching each one
// left the next one to be found by hand.
//
// This test does not remove the duplication -- it removes the *silence*. Each
// entry is one rule that must hold on both paths, matched by a distinct probe
// per file because the two describe it in their own vocabulary (software
// dispatch vs facilitation). Restructuring into a shared reference is the real
// fix and is deliberately left as follow-up work; until then, drift fails here.

const SKILL_DIR = path.join(process.cwd(), "skills/ce-ideate")
const SOFTWARE = readFileSync(path.join(SKILL_DIR, "references/divergent-ideation.md"), "utf8")
const UNIVERSAL = readFileSync(path.join(SKILL_DIR, "references/universal-ideation.md"), "utf8")

type SharedRule = {
  rule: string
  why: string
  software: RegExp
  universal: RegExp
}

const SHARED_CONTRACT: SharedRule[] = [
  {
    rule: "all six frames",
    why: "Lens coverage is the skill's quality claim; a path missing a frame silently narrows ideation.",
    software: /Pain and friction[\s\S]*Cross-domain analogy[\s\S]*Constraint-flipping/i,
    universal: /Pain and friction[\s\S]*Cross-domain analogy[\s\S]*Constraint-flipping/i,
  },
  {
    rule: "frames are a starting bias, not a constraint",
    why: "Without it an agent treats its frame as a fence and drops cross-cutting ideas.",
    software: /starting bias, not a constraint/i,
    universal: /starting bias, not a constraint/i,
  },
  {
    rule: "every idea carries a tagged basis",
    why: "The anti-slop mechanism. A path without it returns plausible-sounding unverifiable ideas.",
    software: /`direct:`[\s\S]{0,400}`external:`[\s\S]{0,400}`reasoned:`/,
    universal: /`direct:`[\s\S]{0,400}`external:`[\s\S]{0,400}`reasoned:`/,
  },
  {
    rule: "meeting-test floor, waived only under active tactical scope",
    why: "Keyed on detection rather than the resolved mode, a go-deep run silently keeps the waiver.",
    software: /meeting-test[\s\S]{0,300}tactical scope is active/i,
    universal: /meeting-test[\s\S]{0,300}tactical scope is active/i,
  },
  {
    rule: "subject-replacement ideas are out regardless of basis",
    why: "Without it, 'pivot to an unrelated domain' can survive on a well-argued basis.",
    software: /[Ss]ubject-replacement/,
    universal: /[Ss]ubject-replacement/,
  },
  {
    rule: "reject generic listicle ideas",
    why: "The concrete restraint behind the ambition charter.",
    software: /listicle/i,
    universal: /listicle/i,
  },
  {
    rule: "tactical scope applies, and cuts volume rather than lenses",
    why: "Missing here entirely for three review rounds; a tactical non-software run got the full treatment.",
    software: /tactical scope/i,
    universal: /tactical[\s\S]{0,200}dials/i,
  },
  {
    rule: "an explicit volume request is a total, not a per-frame multiplier",
    why: "Read per-frame, `100 ideas` becomes ~600 and defeats the tactical cut.",
    software: /total\*{0,2}, not a per-frame multiplier/i,
    universal: /total\*{0,2}, not a per-frame multiplier/i,
  },
  {
    rule: "axis spread is scored across the survivor set",
    why: "Otherwise survivors cluster on one axis and the decomposition bought nothing.",
    software: /axis spread/i,
    universal: /axis spread/i,
  },
  {
    rule: "cross-cutting synthesis after merge, richer in surprise-me",
    why: "The step that turns separate frames into combined candidates.",
    software: /cross-cutting[\s\S]{0,300}surprise-me/i,
    universal: /cross-cutting[\s\S]{0,300}surprise-me/i,
  },
  {
    rule: "a fresh-context basis verifier runs before the final cut",
    why: "Self-critique by the generator is the failure this replaces; both paths must dispatch it.",
    software: /verifier|verification/i,
    universal: /fresh-context basis verifier/i,
  },
]

describe("ce-ideate generation contract holds on BOTH the software and universal paths", () => {
  for (const { rule, why, software, universal } of SHARED_CONTRACT) {
    test(`both paths carry: ${rule}`, () => {
      expect(
        software.test(SOFTWARE),
        `divergent-ideation.md lost "${rule}". ${why}`,
      ).toBe(true)
      expect(
        universal.test(UNIVERSAL),
        `universal-ideation.md lost "${rule}". ${why} ` +
          `This is the parallel-implementation gap: the rule exists on the software path ` +
          `but non-software runs load universal-ideation.md INSTEAD, so they would not see it.`,
      ).toBe(true)
    })
  }

  test("the contract map covers every rule the review found missing on one path", () => {
    // Regression anchor: these four are the rules that actually drifted on
    // PR #1357. If someone trims this map, these must survive the trim.
    const mustCover = [
      "tactical scope applies, and cuts volume rather than lenses",
      "an explicit volume request is a total, not a per-frame multiplier",
      "meeting-test floor, waived only under active tactical scope",
      "all six frames",
    ]
    const covered = SHARED_CONTRACT.map((r) => r.rule)
    for (const rule of mustCover) {
      expect(covered, `The parity map must keep "${rule}" — it drifted once already.`).toContain(rule)
    }
  })
})
