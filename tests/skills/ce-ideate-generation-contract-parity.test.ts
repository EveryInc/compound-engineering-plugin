import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

// `references/universal-ideation.md` is a PARALLEL IMPLEMENTATION of the same
// ideation contract, for topics with no software surface. It is loaded INSTEAD
// OF the software path's references, so every mode-agnostic rule has to exist on
// both sides and nothing structural keeps them in step.
//
// That gap produced five separate review findings on PR #1357, each a DIFFERENT
// rule that never made it across: tactical scaling, the depth cue, the
// volume-override escape, the verification-read cap, and the reads-track-ideas
// override. Patching each one left the next to be found by hand.
//
// This does not remove the duplication -- it removes the *silence*.
//
// EACH RULE NAMES THE FILE THAT OWNS IT. The first version of this test probed
// the whole software path as one blob, and two probes silently matched a
// similar-looking string in the wrong file: the "fresh-context verifier" probe
// matched divergent-ideation.md's generation-time *verification reads*, and the
// "axis spread scored across survivors" probe matched its generation-time
// *distribute across axes* instruction. Both would have passed with the real
// rule deleted. Probing per owning file is what makes each assertion falsifiable.

const SKILL_DIR = path.join(process.cwd(), "skills/ce-ideate")
const read = (rel: string) => readFileSync(path.join(SKILL_DIR, rel), "utf8")

// The software path splits generation from convergence across two references;
// the universal path carries both phases in one file.
const FILES: Record<string, string> = {
  "references/divergent-ideation.md": read("references/divergent-ideation.md"),
  "references/post-ideation-workflow.md": read("references/post-ideation-workflow.md"),
  "references/universal-ideation.md": read("references/universal-ideation.md"),
}

// Probe an enumeration inside the section that DEFINES it. Frame names also
// appear in the fleet summary, so a file-wide probe stays green even if the
// whole frame-definition section is deleted.
function section(body: string, startAnchor: string, endAnchor: RegExp): string {
  const start = body.indexOf(startAnchor)
  if (start < 0) return ""
  const rest = body.slice(start + startAnchor.length)
  const m = rest.match(endAnchor)
  return rest.slice(0, m ? m.index : undefined)
}

const FRAMES_SOFTWARE = section(FILES["references/divergent-ideation.md"], "## Frames", /\n## /)
const FRAMES_UNIVERSAL = section(FILES["references/universal-ideation.md"], "## How to generate", /\n## /)

const ALL_SIX_FRAMES = [
  /Pain and friction/i,
  /Inversion, removal,? (or )?automation/i,
  /Assumption-breaking/i,
  /Leverage and compounding/i,
  /Cross-domain analogy/i,
  /Constraint-flipping/i,
]

type SharedRule = {
  rule: string
  why: string
  softwareFile: "references/divergent-ideation.md" | "references/post-ideation-workflow.md"
  software: RegExp
  universal: RegExp
}

const SHARED_CONTRACT: SharedRule[] = [
  {
    rule: "frames are a starting bias, not a constraint",
    why: "Without it an agent treats its frame as a fence and drops cross-cutting ideas.",
    softwareFile: "references/divergent-ideation.md",
    software: /starting bias, not a constraint/i,
    universal: /starting bias, not a constraint/i,
  },
  {
    rule: "every idea carries a tagged basis",
    why: "The anti-slop mechanism. A path without it returns plausible-sounding unverifiable ideas.",
    softwareFile: "references/divergent-ideation.md",
    software: /`direct:`[\s\S]{0,400}`external:`[\s\S]{0,400}`reasoned:`/,
    universal: /`direct:`[\s\S]{0,400}`external:`[\s\S]{0,400}`reasoned:`/,
  },
  {
    rule: "the meeting-test floor is waived only under ACTIVE tactical scope",
    why: "Keyed on detection rather than the resolved mode, a go-deep run silently keeps the waiver.",
    softwareFile: "references/divergent-ideation.md",
    software: /meeting-test[\s\S]{0,300}tactical scope is active/i,
    universal: /meeting-test[\s\S]{0,300}tactical scope is active/i,
  },
  {
    rule: "subject-replacement ideas are out regardless of basis",
    why: "Without it, 'pivot to an unrelated domain' can survive on a well-argued basis.",
    softwareFile: "references/divergent-ideation.md",
    software: /[Ss]ubject-replacement/,
    universal: /[Ss]ubject-replacement/,
  },
  {
    rule: "reject generic listicle ideas",
    why: "The concrete restraint behind the ambition charter.",
    softwareFile: "references/divergent-ideation.md",
    software: /listicle/i,
    universal: /listicle/i,
  },
  {
    rule: "tactical scope applies, cutting volume rather than lenses",
    why: "Missing on the universal path for three review rounds; a tactical non-software run got the full treatment.",
    softwareFile: "references/divergent-ideation.md",
    software: /tactical scope[\s\S]{0,400}lowers each frame's target/i,
    universal: /apply all of tactical's dials/i,
  },
  {
    rule: "an explicit volume request is a total, not a per-frame multiplier",
    why: "Read per-frame, `100 ideas` becomes ~600 and defeats the tactical cut.",
    softwareFile: "references/divergent-ideation.md",
    software: /total\*{0,2}, not a per-frame multiplier/i,
    universal: /total\*{0,2}, not a per-frame multiplier/i,
  },
  {
    rule: "a raised volume override lifts the tactical read cap with it",
    why:
      "The tactical read cut is justified only by the matching volume cut. Raised volume against a " +
      "lowered cap leaves most `direct:` bases unchecked — the invariant used to reject frame-packing.",
    softwareFile: "references/divergent-ideation.md",
    software: /Reads track ideas/,
    universal: /Reads track ideas|read cap lifts with it|verifies at the ordinary/i,
  },
  {
    rule: "axis spread is scored across the SURVIVOR SET at convergence",
    why:
      "Distinct from the generation-time 'distribute ideas across axes' instruction. Without the " +
      "convergence rule, survivors cluster on one axis and the decomposition bought nothing.",
    softwareFile: "references/post-ideation-workflow.md",
    software: /Score survivors using a consistent rubric[\s\S]{0,700}axis spread/i,
    universal: /Score survivors using a consistent rubric[\s\S]{0,700}axis spread/i,
  },
  {
    rule: "a FRESH-CONTEXT basis verifier runs before the final cut",
    why:
      "Self-critique by the generator is the failure this replaces. Do not match generation-time " +
      "'verification reads' — that is a different mechanism in a different phase.",
    softwareFile: "references/post-ideation-workflow.md",
    software: /Dispatch a verifier whose payload is only/,
    universal: /dispatch one fresh-context basis verifier[\s\S]{0,240}whose payload is only/i,
  },
]

describe("ce-ideate ideation contract holds on BOTH the software and universal paths", () => {
  for (const { rule, why, softwareFile, software, universal } of SHARED_CONTRACT) {
    test(`both paths carry: ${rule}`, () => {
      expect(
        software.test(FILES[softwareFile]),
        `${softwareFile} lost "${rule}". ${why}`,
      ).toBe(true)
      expect(
        universal.test(FILES["references/universal-ideation.md"]),
        `universal-ideation.md lost "${rule}". ${why} ` +
          `This is the parallel-implementation gap: the rule exists on the software path ` +
          `but non-software runs load universal-ideation.md INSTEAD, so they would not see it.`,
      ).toBe(true)
    })
  }

  test("both paths define ALL SIX frames in their own frame section", () => {
    // Not a file-wide probe: three of the names also appear in the fleet
    // summary, so a file-wide match survives deleting the frame definitions
    // entirely. And all six must be checked -- requiring only three let
    // Inversion, Assumption-breaking, or Leverage vanish silently.
    expect(FRAMES_SOFTWARE.length, "divergent-ideation.md must keep a '## Frames' section.").toBeGreaterThan(0)
    expect(FRAMES_UNIVERSAL.length, "universal-ideation.md must keep a '## How to generate' section.").toBeGreaterThan(0)
    for (const frame of ALL_SIX_FRAMES) {
      expect(
        frame.test(FRAMES_SOFTWARE),
        `divergent-ideation.md's Frames section lost ${frame}. Lens coverage is the skill's quality claim.`,
      ).toBe(true)
      expect(
        frame.test(FRAMES_UNIVERSAL),
        `universal-ideation.md's generation section lost ${frame}. Non-software runs load it INSTEAD, so the lens would simply not run.`,
      ).toBe(true)
    }
  })

  test("each rule is probed in the file that owns it, not the whole path", () => {
    // The vacuous-probe bug: a rule owned by post-ideation-workflow.md probed
    // against divergent-ideation.md matched similar generation-time wording and
    // could never fail. Convergence-phase rules must name the convergence file.
    const convergenceRules = SHARED_CONTRACT.filter((r) =>
      /survivor|verifier/i.test(r.rule),
    )
    expect(convergenceRules.length).toBeGreaterThan(0)
    for (const r of convergenceRules) {
      expect(
        r.softwareFile,
        `"${r.rule}" is a convergence-phase rule and must be probed in post-ideation-workflow.md.`,
      ).toBe("references/post-ideation-workflow.md")
    }
  })

  test("the contract map keeps every rule that actually drifted on one path", () => {
    const mustCover = [
      "tactical scope applies, cutting volume rather than lenses",
      "an explicit volume request is a total, not a per-frame multiplier",
      "a raised volume override lifts the tactical read cap with it",
      "the meeting-test floor is waived only under ACTIVE tactical scope",
    ]
    const covered = SHARED_CONTRACT.map((r) => r.rule)
    for (const rule of mustCover) {
      expect(covered, `The parity map must keep "${rule}" — it drifted once already.`).toContain(rule)
    }
  })
})
