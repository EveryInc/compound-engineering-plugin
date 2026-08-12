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

  test("the await before consolidation stays inline", () => {
    expect(/await/i.test(RESEARCH)).toBe(true)
  })
})

describe("ce-ideate tactical scope scales agents, never frame coverage", () => {
  test("tactical signals are still detected", () => {
    for (const signal of ["polish", "quick wins", "cleanup"]) {
      expect(VOLUME_0_5.includes(signal), `Phase 0.5 must still detect the "${signal}" tactical signal.`).toBe(true)
    }
  })

  test("the tactical fleet keeps all six frames", () => {
    // The six frames are a coverage floor. Cutting agents is the cost lever;
    // cutting lenses would delete required coverage.
    expect(
      /2 ideation agents covering all six frames/i.test(VOLUME_0_5),
      "Tactical scope must dispatch fewer agents while still covering all six frames.",
    ).toBe(true)
    expect(
      /Cut agents, never frame coverage/i.test(VOLUME_0_5),
      "Phase 0.5 must state the cut-agents-not-frames rule explicitly.",
    ).toBe(true)
    expect(
      /tactical scope.*2 agents, 3 frames each/is.test(DIVERGENT_BODY),
      "divergent-ideation.md must carry the tactical fleet variant as the dispatch source of truth.",
    ).toBe(true)
    expect(
      /Every variant that uses the default frame set covers all six/i.test(DIVERGENT_BODY),
      "divergent-ideation.md must state the six-frame floor for default-frame-set variants.",
    ).toBe(true)
    // Scoped, not universal: issue-tracker mode replaces the frame set with
    // themes, so an unqualified "every variant" would contradict it.
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

  test("a tactical run colliding with go deep or issue-tracker mode has a defined winner", () => {
    // Tactical selects a six-frame 2-agent fleet while issue-tracker mode
    // selects theme frames, so "quick wins from open issues" needs a rule.
    expect(
      /`go deep` wins/i.test(VOLUME_0_5),
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
    for (const pair of [/issue-tracker \+ `go deep` \/ surprise-me/i, /tactical \+ `go deep`/i, /tactical \+ surprise-me/i]) {
      expect(
        pair.test(DIVERGENT_BODY),
        `The collision table must resolve ${pair}.`,
      ).toBe(true)
    }
    // The fallback must inherit the run's scaling rather than resetting to 5.
    expect(
      /default 5-agent fleet/i.test(DIVERGENT_BODY) || /default 5-agent fleet/i.test(ISSUE_INTELLIGENCE_BODY),
      "The insufficient-issue-signal fallback must not hardcode a 5-agent fleet over a scaled run.",
    ).toBe(false)
  })

  test("tactical scaling reaches the universal path, which never loads divergent-ideation.md", () => {
    // Phase 0.3 routes elsewhere-non-software to universal-ideation.md in place
    // of the Phase 2 frame dispatch, so the fleet spec is never loaded there and
    // "quick wins for this launch strategy" would silently get the full run.
    expect(
      /Tactical scope applies here too/i.test(UNIVERSAL_BODY),
      "universal-ideation.md must carry the tactical scaling for its own dispatch.",
    ).toBe(true)
    expect(
      /2 sub-agents \(3 frames each\)/i.test(UNIVERSAL_BODY),
      "The universal tactical packing must keep all six frames in fewer agents.",
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
    expect(
      /depends on the depth that mode selects|ideation count is not settled yet/i.test(COST_0_6),
      "Phase 0.6 must not assert an ideation count for the mode that picks depth later.",
    ).toBe(true)
  })

  test("go deep still scales up, so the two overrides stay symmetric", () => {
    expect(/scale up/i.test(VOLUME_0_5) && /scale down/i.test(VOLUME_0_5)).toBe(true)
    expect(
      /`go deep` wins/i.test(VOLUME_0_5),
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
      /suppresses tactical scope entirely/i.test(VOLUME_0_5),
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
