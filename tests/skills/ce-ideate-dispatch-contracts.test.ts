import { existsSync, readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_DIR = path.join(process.cwd(), "skills/ce-ideate")
const SKILL_BODY = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8")
const DIVERGENT_BODY = readFileSync(
  path.join(SKILL_DIR, "references/divergent-ideation.md"),
  "utf8",
)
const POST_IDEATION_BODY = readFileSync(
  path.join(SKILL_DIR, "references/post-ideation-workflow.md"),
  "utf8",
)
const ISSUE_INTELLIGENCE_BODY = readFileSync(
  path.join(SKILL_DIR, "references/issue-intelligence.md"),
  "utf8",
)
const UNIVERSAL_BODY = readFileSync(
  path.join(SKILL_DIR, "references/universal-ideation.md"),
  "utf8",
)

// Two Phase 1 blocks were extracted to references during the ce-ideate
// slimming pass. Both are conditional (rare, explicit triggers), so extraction
// is permitted -- but both carry an ORDERED DISPATCH with an await, which is
// the exact shape that scored 0/5 in the ce-debug Phase 4 measurement recorded
// in docs/solutions/skill-design/post-menu-routing-belongs-inline.md. The
// bargain that made extraction safe is that the state-transition skeleton stays
// inline in SKILL.md and only the payloads move. These tests pin the BODY, not
// wherever the string currently lives: moving a guard along with the content it
// guards is how that solution doc says the previous guard got deleted.

// Mirrors the sliceSection helper in ce-work-outcome-spine.test.ts and
// pipeline-review-contract.test.ts. Both anchors are asserted: a renamed
// heading must fail loudly rather than silently widening the region to
// end-of-file, which would let a later edit pass a check it no longer meets.
function sliceSection(content: string, startAnchor: string, endAnchor: string): string {
  const start = content.indexOf(startAnchor)
  expect(start, `Missing section anchor "${startAnchor}".`).toBeGreaterThanOrEqual(0)
  const end = content.indexOf(endAnchor, start + startAnchor.length)
  expect(end, `Missing end anchor "${endAnchor}" after "${startAnchor}".`).toBeGreaterThan(start)
  return content.slice(start, end)
}

const PHASE_1 = sliceSection(SKILL_BODY, "### Phase 1: Mode-Aware Grounding", "### Phase 1.5")
const PHASE_1_SCAN = sliceSection(SKILL_BODY, "### Phase 1: Mode-Aware Grounding", "#### Web Research")
const PHASE_1_5 = sliceSection(SKILL_BODY, "### Phase 1.5: Topic-Surface Decomposition", "### Phase 2")
const GATE_0_2 = sliceSection(SKILL_BODY, "#### 0.2 Subject-Identification Gate", "#### 0.3")
const VOLUME_0_5 = sliceSection(SKILL_BODY, "#### 0.5 Interpret Focus and Volume", "#### 0.6")
const COST_0_6 = sliceSection(SKILL_BODY, "#### 0.6 Cost Transparency Notice", "### Phase 1:")
const RESEARCH = sliceSection(
  SKILL_BODY,
  "#### User-Supplied Research Artifacts",
  "#### Consolidated Grounding Summary",
)

// The ordered a-d protocol only; the surrounding Phase 1 prose legitimately
// reuses words like "scan" and "await" for other dispatches, so pinning the
// steps against the whole phase would pass on unrelated text.
const ISSUE_PROTOCOL = sliceSection(
  PHASE_1,
  "only when issue-tracker intent was detected",
  "**Elsewhere mode dispatch",
)

describe("ce-ideate issue-intelligence extraction keeps its skeleton inline", () => {
  test("the reference load fires BEFORE the first dispatch step, not after it", () => {
    // The step list is executable ("dispatch the analyst in SCAN mode"), so a
    // load instruction placed after it lets a sequential agent launch the scan
    // from the deliberately incomplete summary before reading the prohibition.
    const load = ISSUE_PROTOCOL.indexOf("Read `references/issue-intelligence.md` before dispatching anything here")
    const firstStep = ISSUE_PROTOCOL.indexOf("**a. Scan**")
    expect(load, "Phase 1 must carry a load-before-dispatch instruction.").toBeGreaterThan(-1)
    expect(firstStep, "Phase 1 must carry the ordered steps.").toBeGreaterThan(-1)
    expect(
      load,
      "The reference load must precede the first executable dispatch step.",
    ).toBeLessThan(firstStep)
  })

  test("the reference exists and SKILL.md points at it", () => {
    expect(
      existsSync(path.join(SKILL_DIR, "references/issue-intelligence.md")),
      "references/issue-intelligence.md must exist for the Phase 1 load instruction to resolve.",
    ).toBe(true)
    expect(
      /references\/issue-intelligence\.md/.test(PHASE_1),
      "Phase 1 must name references/issue-intelligence.md at the point of use.",
    ).toBe(true)
  })

  test("all four ordered steps stay inline in SKILL.md", () => {
    // An agent that never opens the reference must still know the SEQUENCE --
    // otherwise it dispatches the scan and stops, or clusters without scoping.
    // Anchored on the step labels, not bare words: "scan" and "await" both
    // occur elsewhere in Phase 1 (the quick context scan; the user-research
    // await), so unanchored matches would pass even if these steps were cut.
    for (const step of [
      /\*\*a\.\s*Scan\*\*/i,
      /\*\*b\.\s*Fall back or scope\*\*/i,
      /\*\*c\.\s*Cluster\*\*/i,
      /\*\*d\.\s*Await\*\*/i,
    ]) {
      expect(
        step.test(ISSUE_PROTOCOL),
        `The inline issue-intelligence skeleton must name every step (missing: ${step}).`,
      ).toBe(true)
    }
  })

  test("the await before consolidation is inline, not reference-only", () => {
    expect(
      /do not close the consolidated grounding summary before the cluster result lands/i.test(PHASE_1),
      "The await constraint must be inline: consolidation and Phase 1.5 depend on the cluster themes.",
    ).toBe(true)
    expect(
      /not\*{0,2}\s+fire-and-forget/i.test(PHASE_1),
      "Phase 1 must state inline that the issue lens is not fire-and-forget.",
    ).toBe(true)
  })

  test("the stub forbids composing a dispatch from itself (no load-suppressing paraphrase)", () => {
    // A stub complete enough to act on suppresses the reference load and drops
    // the payload detail in one move -- the second failure mode in the
    // post-menu-routing solution doc.
    expect(
      /do not compose either dispatch from them/i.test(PHASE_1),
      "The issue-intelligence stub must tell the agent not to build the dispatch from the inline summary.",
    ).toBe(true)
  })

  test("issue-tracker intent is attributed to Phase 0.2, the phase that actually detects it", () => {
    // Regression: Phase 1 previously cited "Phase 0.3" while the detector lived
    // in 0.2, disagreeing with divergent-ideation.md.
    const detector = GATE_0_2
    expect(
      /Detection — issue-tracker intent/.test(detector),
      "The issue-tracker detector must live in Phase 0.2.",
    ).toBe(true)
    expect(
      /issue-tracker intent was detected in \*\*Phase 0\.2\*\*|detected in Phase 0\.2/.test(PHASE_1),
      "Phase 1 must cite Phase 0.2 as the detection site, not 0.3.",
    ).toBe(true)
    expect(
      /issue-tracker intent was detected in Phase 0\.3/.test(SKILL_BODY),
      "Phase 1 must not cite Phase 0.3 for issue-tracker detection.",
    ).toBe(false)
  })
})

describe("ce-ideate user-research extraction keeps its routing test inline", () => {
  test("the reference exists and is named at the point of use", () => {
    expect(
      existsSync(path.join(SKILL_DIR, "references/user-research-artifacts.md")),
      "references/user-research-artifacts.md must exist.",
    ).toBe(true)
    expect(/references\/user-research-artifacts\.md/.test(RESEARCH)).toBe(true)
  })

  test("the directive-vs-evidence fork stays inline -- it decides whether the path fires at all", () => {
    expect(/directive/i.test(RESEARCH) && /evidence/i.test(RESEARCH)).toBe(true)
    expect(
      /never `?<constraints>`?|never <constraints>/i.test(RESEARCH),
      "The inline routing test must state that evidence never rides in <constraints>.",
    ).toBe(true)
  })

  test("the distiller spec loads before the grounding batch, so it can join it", () => {
    // The reference requires distillers to run in parallel with the other
    // Phase 1 agents. Loading it only at the section below the batch would
    // serialize the most expensive read behind everything else.
    const load = SKILL_BODY.indexOf("read `references/user-research-artifacts.md` now, before the batch below")
    const batch = SKILL_BODY.indexOf("Run grounding agents in parallel in the **foreground**")
    expect(load, "Phase 1 must load the distiller spec before the batch.").toBeGreaterThan(-1)
    expect(batch, "Phase 1 must carry the parallel-batch instruction.").toBeGreaterThan(-1)
    expect(load, "The distiller spec load must precede the grounding batch.").toBeLessThan(batch)
  })

  test("the routing test gates BOTH mode dispatch blocks, not just the repo scan", () => {
    // Elsewhere-mode synthesis reads "any rich-prompt material", so a research
    // export reached synthesis AND a distiller -- duplicating the file into
    // Topic context -- when the test was stated only for the repo scan.
    const gate = SKILL_BODY.indexOf("Before either dispatch block, run the research-artifact routing test")
    expect(gate, "Phase 1 must run the routing test before either dispatch block.").toBeGreaterThan(-1)
    for (const block of ["**Repo mode dispatch:**", "**Elsewhere mode dispatch"]) {
      expect(
        SKILL_BODY.indexOf(block),
        `The routing test must precede ${block}.`,
      ).toBeGreaterThan(gate)
    }
    expect(
      /excluding any file the routing test above classified as evidence/i.test(PHASE_1),
      "User-context synthesis must exclude routed evidence files at its own dispatch site.",
    ).toBe(true)
  })

  test("the before-the-scan timing stays inline", () => {
    // The scan must know which files to leave alone, so this cannot wait for a
    // reference the agent may load after dispatching the scan.
    expect(
      /before dispatching the Phase 1 quick context scan/i.test(RESEARCH),
      "The routing test must be marked as running before the Phase 1 scan.",
    ).toBe(true)
    expect(
      /routing test/i.test(PHASE_1_SCAN),
      "The Phase 1 scan step must reference the routing test at its own dispatch site.",
    ).toBe(true)
  })

  test("parallel distillers cannot collide on a shared basename", () => {
    // Two artifacts named report.md in different directories derived the same
    // slug, so concurrent distillers overwrote each other's dossier while the
    // returned gists still pointed at the corrupted file.
    const body = readFileSync(path.join(SKILL_DIR, "references/user-research-artifacts.md"), "utf8")
    expect(
      /collision-resistant slug/i.test(body),
      "The distiller dispatch must call for a collision-resistant slug.",
    ).toBe(true)
    expect(
      /not its filename|digest of the absolute path/i.test(body),
      "The slug must derive from the full path, not the basename alone.",
    ).toBe(true)
    expect(
      /Verify the composed slugs are distinct/i.test(body),
      "The reference must require a distinctness check before dispatching in parallel.",
    ).toBe(true)
  })

  test("the await is conditional on the reference routing to a distiller", () => {
    // Small artifacts fold in inline with no sub-agent, so an unconditional
    // "distill it and await" would dispatch an agent that should not exist and
    // stall the grounding batch on it.
    expect(/await/i.test(RESEARCH)).toBe(true)
    expect(
      /a small artifact folds into the grounding summary inline and dispatches nothing/i.test(RESEARCH),
      "The stub must state the no-distiller case for small artifacts.",
    ).toBe(true)
    expect(
      /When it does route to a distiller, await that result/i.test(RESEARCH),
      "The await must be conditional on a distiller actually being dispatched.",
    ).toBe(true)
  })

  test("a total too small to spread across the frames is a survivor limit", () => {
    // "3 ideas about auth" cannot mean three raw candidates split six ways --
    // that either overshoots the ask or leaves frames unrun, and the six-frame
    // floor is not negotiable.
    for (const [label, body] of [
      ["divergent-ideation.md", DIVERGENT_BODY],
      ["universal-ideation.md", UNIVERSAL_BODY],
    ] as const) {
      expect(
        /survivor limit/i.test(body) && /too small to spread across the (six )?frames/i.test(body),
        `${label} must read an under-floor total as a survivor limit, not a generation target.`,
      ).toBe(true)
    }
  })

  test("an explicit survivor count outranks the universal depth default", () => {
    // `top 3 names for a coffee shop` returns three, whatever depth was chosen.
    expect(
      /An explicit survivor count in the prompt wins outright/i.test(UNIVERSAL_BODY),
      "universal-ideation.md must let an explicit survivor count beat the depth-keyed default.",
    ).toBe(true)
  })

  test("an explicit volume override outranks the tactical default on both paths", () => {
    // divergent-ideation.md has always had the override escape; the universal
    // path hardcoded the tactical number, capping "100 quick wins" at 18-24.
    for (const [label, body] of [
      ["divergent-ideation.md", DIVERGENT_BODY],
      ["universal-ideation.md", UNIVERSAL_BODY],
    ] as const) {
      expect(
        /volume override|volume request/i.test(body) && /100 ideas/i.test(body),
        `${label} must let an explicit volume override outrank the per-frame default.`,
      ).toBe(true)
      // A raw number is a total. Read per-frame, "100 ideas" becomes ~600.
      expect(
        /total\*{0,2}, not a per-frame multiplier/i.test(body),
        `${label} must treat a raw-number volume request as a total, not a per-frame multiplier.`,
      ).toBe(true)
    }
  })
})

describe("ce-ideate tactical scope scales agents, never frame coverage", () => {
  test("tactical signals are still detected", () => {
    for (const signal of ["polish", "quick wins", "cleanup"]) {
      expect(VOLUME_0_5.includes(signal), `Phase 0.5 must still detect the "${signal}" tactical signal.`).toBe(true)
    }
  })

  test("tactical takes its savings from volume and reads, not from packing frames", () => {
    // Packing was tried and reverted. Two reasons, both in the file: per-frame
    // idea targets do not change under packing, so it barely reduces generated
    // output; and the verification budget is per AGENT, so an agent holding
    // three frames verifies ~1/3 as much per idea -- cutting the basis check,
    // which is the mechanism the skill exists to enforce.
    expect(
      /Cut volume, not agents/i.test(VOLUME_0_5),
      "Phase 0.5 must name volume and reads as the tactical cost levers.",
    ).toBe(true)
    expect(
      /Do not pack extra frames into one agent to save money/i.test(VOLUME_0_5),
      "Phase 0.5 must forbid packing as a cost lever.",
    ).toBe(true)
    expect(
      /verification budget is \*\*per agent, not per frame\*\*/i.test(VOLUME_0_5),
      "Phase 0.5 must state why packing is rejected: the per-agent verification budget.",
    ).toBe(true)
    // The reverted shape must not come back.
    expect(
      /2 ideation agents covering all six frames|2 agents, 3 frames each/i.test(SKILL_BODY + DIVERGENT_BODY),
      "The 2x3 tactical packing must not be reintroduced.",
    ).toBe(false)
    expect(
      /the same 5 agents over 6 frames as the default/i.test(DIVERGENT_BODY),
      "divergent-ideation.md must keep the default fleet under tactical scope.",
    ).toBe(true)
    // The concrete dials, at the sites that own them.
    expect(
      /3-4 under tactical scope/i.test(DIVERGENT_BODY),
      "The per-frame volume line must carry the tactical target.",
    ).toBe(true)
    expect(
      /2-3 under tactical scope/i.test(DIVERGENT_BODY),
      "The verification-read line must carry the tactical budget.",
    ).toBe(true)
  })

  test("all six frames survive every default-frame-set variant", () => {
    expect(
      /Every variant that uses the default frame set covers all six/i.test(DIVERGENT_BODY),
      "divergent-ideation.md must state the six-frame floor for default-frame-set variants.",
    ).toBe(true)
    expect(
      /Issue-tracker mode is the one variant that \*replaces\* the frame set/i.test(DIVERGENT_BODY),
      "The six-frame floor must exempt issue-tracker mode explicitly.",
    ).toBe(true)
  })

  test("the axis and scout caps are equal, so no retained axis is left unscouted", () => {
    // Scouts dispatch one per axis, so an axis past the scout cap reaches
    // generation with no evidence dossier. An earlier revision capped axes at 3
    // and scouts at 2, which stranded exactly one axis on every tactical run.
    const axisCap = VOLUME_0_5.match(/Cap Phase 1\.5 at (\d+) axes and evidence scouts at (\d+)/i)
    expect(axisCap, "Phase 0.5 must state the tactical axis and scout caps together.").not.toBeNull()
    expect(
      axisCap![1],
      "The tactical axis and scout caps must be equal — a lower scout cap strands an axis.",
    ).toBe(axisCap![2])

    const decomposition = PHASE_1_5
    expect(
      /3 max under tactical scope/i.test(decomposition),
      "Phase 1.5 must carry the tactical axis cap at the point axes are chosen.",
    ).toBe(true)
    const scoutCap = decomposition.match(/max (\d+) under tactical scope/i)
    expect(scoutCap, "The scout dispatch must carry the tactical scout cap at its own site.").not.toBeNull()
    expect(scoutCap![1], "The scout dispatch cap must match the axis cap.").toBe(axisCap![1])
  })

  test("tactical's effect is defined once and referenced by name, never re-enumerated", () => {
    // Every time tactical's effect was restated at a collision site, changing
    // the effect left those sites stale. One named set, referenced everywhere.
    expect(
      /\*\*Tactical's dials — the complete list\.\*\*/.test(VOLUME_0_5),
      "Phase 0.5 must define tactical's dials as one named, complete set.",
    ).toBe(true)
    expect(
      /\*\*Tactical changes nothing else\*\* — not the agent count, not the frame set, not the model tier/.test(VOLUME_0_5),
      "The dial set must state what tactical does NOT touch, so collisions cannot re-add a fleet change.",
    ).toBe(true)
    for (const [label, body] of [
      ["SKILL.md collisions", VOLUME_0_5],
      ["divergent-ideation.md", DIVERGENT_BODY],
    ] as const) {
      expect(
        /tactical's dials/i.test(body),
        `${label} must reference the named dial set rather than re-listing it.`,
      ).toBe(true)
    }
    // No site may still claim tactical changes the fleet.
    expect(
      /2 under tactical scope/i.test(ISSUE_INTELLIGENCE_BODY + DIVERGENT_BODY + SKILL_BODY),
      "No site may still say tactical resolves a 2-agent fleet.",
    ).toBe(false)
  })

  test("a tactical run colliding with go deep or issue-tracker mode has a defined winner", () => {
    // Tactical selects a six-frame 2-agent fleet while issue-tracker mode
    // selects theme frames, so "quick wins from open issues" needs a rule.
    expect(
      /`go deep` beats a tactical signal outright/i.test(VOLUME_0_5),
      "Phase 0.5 must resolve tactical vs `go deep`.",
    ).toBe(true)
    expect(
      /issue-tracker/i.test(VOLUME_0_5),
      "Phase 0.5 must resolve tactical vs issue-tracker intent.",
    ).toBe(true)
    expect(
      /issue-tracker \+ tactical/i.test(DIVERGENT_BODY),
      "divergent-ideation.md must carry the frames-vs-agent-count split for colliding variants.",
    ).toBe(true)
    // Every pair of variants that can fire together needs a row; a vague
    // `quick wins` routed to "Surprise me" fires both.
    // Each pair gets its own row: `go deep` and surprise-me share a fleet but
    // not a read budget, so collapsing them drops go deep's doubled reads.
    for (const pair of [
      /issue-tracker \+ `go deep`/i,
      /issue-tracker \+ surprise-me/i,
      /tactical \+ `go deep`/i,
      /tactical \+ surprise-me/i,
    ]) {
      expect(
        pair.test(DIVERGENT_BODY),
        `The collision table must resolve ${pair}.`,
      ).toBe(true)
    }
    expect(
      /`go deep`'s doubled reads \(10\)/.test(DIVERGENT_BODY),
      "The go-deep collision row must preserve its doubled verification budget.",
    ).toBe(true)
    // The fallback must inherit the run's scaling rather than resetting to 5 --
    // in the inline skeleton too, not only in the two references.
    expect(
      /default 5-agent fleet/i.test(DIVERGENT_BODY) || /default 5-agent fleet/i.test(ISSUE_INTELLIGENCE_BODY),
      "The insufficient-issue-signal fallback must not hardcode a 5-agent fleet over a scaled run.",
    ).toBe(false)
    // A principle, not a value table. An agent recomputing "what the frame
    // count determines" will not put a 4-agent fleet on 6 frames nor multiply
    // a requested total -- both are visibly incoherent. Enumerating every
    // hazard grew this to 194 words across three files and produced three
    // consecutive rounds of contradictions between those copies.
    expect(
      /keeping the scaling this run already resolved and recomputing only what the frame count itself determines/i.test(ISSUE_PROTOCOL),
      "The fallback must state the keep-vs-recompute principle.",
    ).toBe(true)
  })

  test("tactical scaling reaches the universal path, which never loads divergent-ideation.md", () => {
    // Phase 0.3 routes elsewhere-non-software to universal-ideation.md in place
    // of the Phase 2 frame dispatch, so the fleet spec is never loaded there and
    // "quick wins for this launch strategy" would silently get the full run.
    expect(
      /Tactical scope applies here too/i.test(UNIVERSAL_BODY),
      "universal-ideation.md must carry the tactical scaling for its own dispatch.",
    ).toBe(true)
    // Reference the named set, never re-list a subset -- four rounds of review
    // each found a different dial missing from a hand-copied list here.
    expect(
      /apply all of tactical's dials/i.test(UNIVERSAL_BODY),
      "The universal tactical block must apply the whole named dial set, not a re-listed subset.",
    ).toBe(true)
    expect(
      /never pack frames to economize, since the read budget is per agent/i.test(UNIVERSAL_BODY),
      "The universal path must keep the no-packing rule with its per-agent-read reason.",
    ).toBe(true)
    expect(
      /3 max when tactical scope is active/i.test(UNIVERSAL_BODY),
      "The universal axis cap must carry the tactical bound.",
    ).toBe(true)
    expect(
      /tell the verifier the meeting-test floor is waived/i.test(UNIVERSAL_BODY),
      "The universal verifier must receive the tactical waiver, same as the software path.",
    ).toBe(true)
    // Only Full depth dispatches sub-agents in this mode, and tactical steers
    // toward Quick/Standard -- so a fleet count stated without the depth would
    // announce agents that never get dispatched.
    expect(
      /zero ideation sub-agents/i.test(UNIVERSAL_BODY),
      "The universal tactical block must state the no-dispatch case for Quick/Standard depth.",
    ).toBe(true)
    expect(
      /never announce a fleet the selected depth will not dispatch/i.test(UNIVERSAL_BODY),
      "The universal tactical block must tie the announced fleet to the resolved depth.",
    ).toBe(true)
    // The depth cue must reach "How to start", which picks depth, rather than
    // living only in "How to generate" further down.
    const start = UNIVERSAL_BODY.indexOf("## How to start")
    const generate = UNIVERSAL_BODY.indexOf("## How to generate")
    const cue = UNIVERSAL_BODY.indexOf("Depth is the fleet decision in this mode")
    expect(cue, "universal-ideation.md must cue tactical depth where depth is chosen.").toBeGreaterThan(start)
    expect(cue, "The depth cue must precede 'How to generate'.").toBeLessThan(generate)
    // Phase 0.5 no longer prescribes any tactical agent count, so it cannot
    // conflict with a mode that resolves its fleet later.
    expect(
      /\b\d+ ideation agents\b/i.test(VOLUME_0_5),
      "Phase 0.5 must not prescribe a tactical agent count for any mode to satisfy.",
    ).toBe(false)
  })

  test("one read budget, with the tactical pairing and the ceiling honestly stated", () => {
    // History: a tactical 2-3 cap could run against a raised volume override;
    // the fix said "lift it back to 5"; the next fix made 5 a per-submission
    // *rate*, which then contradicted the flat budget line two lines above it.
    // Settled by keeping ONE budget and stating its two consequences, rather
    // than adding a fourth statement to reconcile three.
    expect(
      /may spend up to \*\*5 targeted reads\*\* — 10 under `go deep`, 2-3 under tactical scope/.test(DIVERGENT_BODY),
      "There must be exactly one stated read budget.",
    ).toBe(true)
    expect(
      /never raised volume against the lowered cap/i.test(DIVERGENT_BODY),
      "A raised volume override must return the ordinary budget, not keep the tactical cap.",
    ).toBe(true)
    expect(
      /Budgets are ceilings, not guarantees of uniform scrutiny/i.test(DIVERGENT_BODY),
      "The skill must state that a two-frame or raised-volume agent gets less per-idea depth.",
    ).toBe(true)
    // No competing formulation may return alongside the budget line.
    expect(
      /it is a \*rate\*, not a constant|needs proportionally more/i.test(DIVERGENT_BODY),
      "A per-submission rate contradicts the flat budget line; do not reintroduce it.",
    ).toBe(false)
  })

  test("the universal survivor target follows the selected depth", () => {
    // Quick promises 3-5; an unconditional 5-7 at convergence silently
    // re-expands a run the user asked to keep small.
    expect(
      /target the count the selected depth promised/i.test(UNIVERSAL_BODY),
      "universal-ideation.md must key its survivor target to the chosen depth.",
    ).toBe(true)
    expect(
      /3-5 at Quick, 5-7 at Standard or Full/i.test(UNIVERSAL_BODY),
      "The depth-keyed survivor targets must be stated concretely.",
    ).toBe(true)
  })

  test("go deep still scales up, so the two overrides stay symmetric", () => {
    expect(/scale up/i.test(VOLUME_0_5) && /scale down/i.test(VOLUME_0_5)).toBe(true)
    expect(
      /`go deep` beats a tactical signal outright/i.test(VOLUME_0_5),
      "Phase 0.5 must resolve a prompt carrying both go deep and a tactical signal.",
    ).toBe(true)
  })
})

describe("ce-ideate meeting-test waiver reaches the verifier", () => {
  test("the tactical waiver is stated at both layers in SKILL.md", () => {
    // Only alternatives that actually assert the two-layer relationship. A
    // looser "generators and the" would also match prose stating the opposite
    // ("waive for the generators only; the verifier is not told").
    expect(
      /both layers|generators \*and\* in the Phase 3 basis verifier/i.test(VOLUME_0_5),
      "Phase 0.5 must state that the tactical waiver applies to the verifier as well as the generators.",
    ).toBe(true)
  })

  test("every waiver keys on tactical scope being ACTIVE, not merely detected", () => {
    // `go deep` beats a tactical signal, so a prompt can carry the signal while
    // tactical scope is suppressed. A waiver keyed on detection would still
    // waive the ambition floor on that all-ceiling run.
    expect(
      /Detecting a tactical signal is not the same as tactical scope being active/i.test(VOLUME_0_5),
      "Phase 0.5 must separate signal detection from the resolved active mode.",
    ).toBe(true)
    expect(
      /suppresses it entirely/i.test(VOLUME_0_5),
      "Phase 0.5 must state that `go deep` suppresses tactical scope, not merely outranks its fleet.",
    ).toBe(true)
    for (const [label, body] of [
      ["divergent-ideation.md", DIVERGENT_BODY],
      ["post-ideation-workflow.md", POST_IDEATION_BODY],
      ["universal-ideation.md", UNIVERSAL_BODY],
    ] as const) {
      expect(
        /detected tactical focus signals|tactical focus signals were detected/i.test(body),
        `${label} must not key the meeting-test waiver on signal detection.`,
      ).toBe(false)
    }
  })

  test("the verifier dispatch carries the waiver, because it has no generation history", () => {
    // Regression: the verifier ran on a fresh context with "none of the
    // generation history", was told to check the meeting-test unconditionally,
    // and its judgment superseded the generators' -- so a tactical run's
    // waiver was defeated one layer down and every candidate came back weak.
    expect(
      /none of the generation history/i.test(POST_IDEATION_BODY),
      "The verifier payload must still exclude generation history.",
    ).toBe(true)
    expect(
      /tell the verifier the floor is waived/i.test(POST_IDEATION_BODY),
      "Phase 3 must instruct the orchestrator to pass the tactical waiver into the verifier payload.",
    ).toBe(true)
    expect(
      /a waiver it is not told about does not reach it/i.test(POST_IDEATION_BODY),
      "Phase 3 must say why the waiver has to be passed explicitly.",
    ).toBe(true)
  })
})

describe("ce-ideate cost transparency states no hand-maintained totals", () => {
  test("the drifting worked examples and their arithmetic are gone", () => {
    // Two of the five examples contradicted their own enumeration (~13 vs 14,
    // ~14 vs 15) because each fleet change had to be re-derived by hand here.
    expect(
      /~13 agents|~14 agents|~15 agents/.test(COST_0_6),
      "Phase 0.6 must not pin hand-maintained agent totals that drift from the dispatch spec.",
    ).toBe(false)
    expect(
      /do not carry a memorized total/i.test(COST_0_6),
      "Phase 0.6 must tell the agent to derive the line from the dispatch decisions it just made.",
    ).toBe(true)
  })

  test("the skip phrases survive the compression", () => {
    expect(/no external research/i.test(COST_0_6)).toBe(true)
  })

  test("the notice does not pre-subtract or assert legs a later phase decides", () => {
    // The V15 cache check, the issue cluster call, and the universal depth
    // count are all resolved after this notice fires, so claiming them here
    // misstates the cost in the direction of confident precision.
    expect(
      /Say "conditional" for anything this phase cannot yet resolve; do not pre-subtract it/i.test(COST_0_6),
      "Phase 0.6 must tell the agent to mark unresolved legs conditional.",
    ).toBe(true)
    expect(
      /cluster call only if that scan returns usable signal/i.test(COST_0_6),
      "The issue cluster call must be stated as conditional on the scan's result.",
    ).toBe(true)
    // One rule, no enumeration. Three successive closed sets ("the one mode",
    // "two situations", then three bullets) were each incomplete -- a fourth
    // case always existed. State the rule; let the agent apply it.
    expect(
      /Where a number depends on a decision a later phase makes/i.test(COST_0_6),
      "Phase 0.6 must state the conditional rule generally, not enumerate cases.",
    ).toBe(true)
    expect(
      /the one answer certain to be wrong/i.test(COST_0_6),
      "Phase 0.6 must keep the concrete warning against the default figure.",
    ).toBe(true)
    expect(
      /the one mode whose ideation count is not settled/i.test(SKILL_BODY),
      "Phase 0.6 must not claim exclusivity for one unresolved-count mode.",
    ).toBe(false)
    expect(
      /ordinary five-agent figure/i.test(COST_0_6),
      "Phase 0.6 must forbid falling back to the default count under an override.",
    ).toBe(true)
    // Tactical must stay explicitly outside the unresolved set -- it does not
    // change the agent count, so the ordinary figure is still correct there.
    // The skip phrase IS readable now, so it stays a real subtraction.
    expect(
      /skip phrase — that much is readable from the prompt right now/i.test(COST_0_6),
      "A skip phrase is knowable at notice time and should stay a subtraction.",
    ).toBe(true)
  })
})

describe("ce-ideate surprise-me deltas are consolidated but locally hooked", () => {
  test("one table owns every delta", () => {
    const gate = GATE_0_2
    expect(
      /Surprise-me mode — every delta, in one place/i.test(gate),
      "Phase 0.2 must carry the consolidated surprise-me table.",
    ).toBe(true)
    for (const phase of ["0.3 mode", "0.4 substance", "1 grounding", "1.5 axes", "2 generation"]) {
      expect(
        gate.includes(phase),
        `The surprise-me table must carry a row for "${phase}".`,
      ).toBe(true)
    }
  })

  test("each affected phase keeps a local hook, so a distant qualifier is not lost", () => {
    // Consolidation alone risks the opposite failure of duplication: a rule
    // stated only in a table 200 lines earlier. Every phase the table names
    // keeps a one-clause pointer beside the action it governs.
    for (const [heading, next] of [
      ["#### 0.3 Mode Classification", "#### 0.4"],
      ["#### 0.4 Context-Substance Gate", "#### 0.5"],
      ["### Phase 1: Mode-Aware Grounding", "#### Web Research"],
      ["### Phase 1.5: Topic-Surface Decomposition", "### Phase 2"],
    ] as const) {
      const region = sliceSection(SKILL_BODY, heading, next)
      expect(
        /surprise-me/i.test(region),
        `"${heading}" must keep a local surprise-me hook.`,
      ).toBe(true)
    }
  })
})
