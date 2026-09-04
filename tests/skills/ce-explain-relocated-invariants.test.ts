import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync, statSync } from "fs"
import path from "path"

// ce-explain's body was thinned toward Codex's 8000-byte skill prompt budget by
// moving the ask-tool table, the model tiers, the run-directory block, grounding
// by input shape, and menu sizing into references/orchestration.md, and the
// operational-question gate into references/intake.md. The body pins live in
// ce-explain-routing.test.ts (inline post-menu routing is load-bearing); these
// are the corpus greps for what moved, so a later edit cannot drop them from
// both places at once.
const SKILL_DIR = path.join(import.meta.dir, "..", "..", "skills", "ce-explain")

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = path.join(dir, entry)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const corpus = [
  readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8"),
  ...walk(path.join(SKILL_DIR, "references")).map((f) => readFileSync(f, "utf8")),
].join("\n")

describe("ce-explain relocated invariants stay greppable in the corpus", () => {
  for (const invariant of [
    // Interaction method (capability match, issue #1522). Option-cap facts
    // may still name request_user_input; the closed per-host catalog must not return.
    "already in the current tool list",
    "never call a user-facing question tool",
    "request_user_input",
    "Never silently skip the question",
    // Model tiers + degradation
    "Extraction tier",
    "Ceiling tier",
    "active-agent-limit error as backpressure",
    // Run directory
    "unsafe scratch root symlink",
    'RUN_DIR="$SCRATCH_ROOT/ce-explain/',
    // Grounding by shape
    "Unverified — from model knowledge, not checked against current sources",
    "recap-evidence.md",
    "never generate and rank alternatives",
    // Menu sizing
    "Pick a number or describe what you want.",
    "absence hides an option silently",
    // Operational-question gate
    "Want me to actually walk you through how this works?",
  ]) {
    test(`corpus keeps: ${invariant.slice(0, 48)}`, () => {
      expect(corpus).toContain(invariant)
    })
  }

  // Issue #1628: the interactive check-in (an offer, a prediction turn, exercises
  // in chat) blocked the run on Codex; it now lives in the artifact. No file in
  // the skill may reintroduce the offer wording, and no reference may point at a
  // phase number the body no longer has — the check-in's removal renumbered
  // compose to Phase 3 and the destination ask to Phase 4, so references name
  // phases by role instead.
  for (const banned of ["Quiz me", "Just the explainer", "Phase 3 ordering rule"]) {
    test(`corpus drops: ${banned}`, () => {
      expect(corpus).not.toContain(banned)
    })
  }

  test("no reference names a phase the body no longer has", () => {
    expect(corpus).not.toMatch(/Phase [56]\b/)
  })

  test("the body names orchestration.md at the point of first use", () => {
    const body = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8")
    expect(body).toContain("references/orchestration.md")
    expect(body).toMatch(
      /before the first blocking question, subagent dispatch, or run-directory creation/i,
    )
    expect(body.indexOf("references/orchestration.md")).toBeLessThan(body.indexOf("### Phase 1"))
  })
})
