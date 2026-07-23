import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_PATH = path.join(process.cwd(), "skills/ce-explain/SKILL.md")
const SKILL_BODY = readFileSync(SKILL_PATH, "utf8")
const CHECK_IN_PATH = path.join(process.cwd(), "skills/ce-explain/references/check-in.md")
const CHECK_IN_BODY = readFileSync(CHECK_IN_PATH, "utf8")
const DESTINATIONS_PATH = path.join(
  process.cwd(),
  "skills/ce-explain/references/destinations.md",
)
const DESTINATIONS_BODY = readFileSync(DESTINATIONS_PATH, "utf8")
const HTML_REFERENCE_PATH = path.join(
  process.cwd(),
  "skills/ce-explain/references/explainer-html.md",
)
const HTML_REFERENCE_BODY = readFileSync(HTML_REFERENCE_PATH, "utf8")

// Regression guard mirroring tests/skills/ce-plan-handoff-routing.test.ts
// (issue #714 class): SKILL.md content caches at session start while reference
// files load on demand, so the bare per-option action for the Phase 6
// destination ask and the outbound handoffs MUST live inline in SKILL.md —
// not solely in references/destinations.md. Symptom when this regresses: the
// agent renders the destination menu, the user picks an option, and the agent
// stops in prose without firing the action.
describe("ce-explain destination and handoff routing", () => {
  const phaseStart = SKILL_BODY.indexOf("### Phase 6")

  test("SKILL.md contains the Phase 6 destination-ask region", () => {
    expect(
      phaseStart,
      "ce-explain SKILL.md no longer contains the '### Phase 6' heading — the test anchor needs updating, or the destination ask was removed.",
    ).toBeGreaterThan(-1)
  })

  const phaseRegion = phaseStart > -1 ? SKILL_BODY.slice(phaseStart) : ""

  test("inline routing exists for every destination option", () => {
    const optionFragments: { name: string; fragment: string }[] = [
      { name: "Claude Artifact", fragment: "Claude Artifact" },
      { name: "Publish publicly to ht-ml.app", fragment: "Publish publicly to ht-ml.app" },
      { name: "Local file", fragment: "Local file" },
      { name: "Publish to Proof", fragment: "Publish to Proof" },
      { name: "Send to Thinkroom", fragment: "Send to Thinkroom" },
      { name: "Leave it", fragment: "Leave it" },
    ]
    for (const { name, fragment } of optionFragments) {
      const escaped = fragment.replace(/[.*+?^${}()|[\]\\`]/g, "\\$&")
      // Bullet form: `- **<fragment>**` then a separator and at least one
      // non-newline character of action text on the SAME line ([ \t]*, not
      // \s*, so an empty-action bullet cannot match by spilling into the next
      // bullet's leading `-`). The separator requires surrounding whitespace
      // (` — ` / ` - `) so a mid-word hyphen in a qualifier like
      // "(auto-generated)" cannot satisfy the action-separator match.
      const inlineRoutingPattern = new RegExp(
        `^- \\*\\*[^\\n]*${escaped}[^\\n]*\\*\\*[^\\n]*[ \\t][—-][ \\t]+[^\\n]+`,
        "m",
      )
      expect(
        inlineRoutingPattern.test(phaseRegion),
        `ce-explain SKILL.md Phase 6 is missing inline routing for destination option "${name}". The bare per-option action MUST live in SKILL.md (not solely in references/destinations.md). See docs/solutions/skill-design/post-menu-routing-belongs-inline.md.`,
      ).toBe(true)
    }
  })

  test("ce-ideate and ce-simplify-code handoffs use the skill-invocation primitive", () => {
    for (const target of ["ce-ideate", "ce-simplify-code"]) {
      const bullet = phaseRegion.match(
        new RegExp(`^- \\*\\*[^\\n]+\\*\\*[^\\n]*\`${target}\`[^\\n]+`, "m"),
      )
      expect(
        bullet,
        `ce-explain SKILL.md Phase 6 is missing the inline handoff bullet naming ${target}.`,
      ).not.toBeNull()
      expect(
        /skill[\s-]?invocation|Skill tool|skill primitive/i.test(bullet![0]),
        `ce-explain SKILL.md ${target} handoff must name the skill-invocation primitive so the agent fires the invocation rather than announcing a handoff in prose.`,
      ).toBe(true)
    }
  })

  test("`ce-polish` handoff is user-run, never skill-invoked", () => {
    // `ce-polish` sets disable-model-invocation: true (pinned in
    // EXPECTED_USER_INVOKED_SKILLS in tests/skill-conventions.test.ts), so the
    // model cannot dispatch it via the Skill tool. The routing must present
    // observations in chat and give the user a host-correct `ce-polish`
    // invocation rather than hardcoding one harness's syntax.
    const polishBullet = phaseRegion.match(/^- \*\*[^\n]*polish[^\n]*\*\*[^\n]+/im)
    expect(
      polishBullet,
      "`ce-explain` SKILL.md Phase 6 is missing the inline UI/UX polish handoff bullet.",
    ).not.toBeNull()
    const line = polishBullet![0]
    const renderingRule = phaseRegion.match(/\*\*User-runnable invocation rendering\.\*\*[^\n]+/i)
    expect(renderingRule).not.toBeNull()
    expect(
      /user-invoked only/i.test(line) &&
        /rendering rule above/i.test(line) &&
        renderingRule![0].includes("$ce-polish") &&
        renderingRule![0].includes("/ce-polish") &&
        /active host|Codex/i.test(renderingRule![0]) &&
        /default to `\/ce-polish`[^.]{0,180}dollar-prefixed/i.test(renderingRule![0]),
      "`ce-explain` SKILL.md polish handoff must present observations in chat and render one host-correct user invocation for `ce-polish`.",
    ).toBe(true)
    expect(
      /invoke the `ce-polish` skill/i.test(line),
      "`ce-explain` SKILL.md polish handoff must NOT instruct invoking `ce-polish` via the skill primitive — it is user-invoked only (disable-model-invocation).",
    ).toBe(false)
  })

  test("predict-then-reveal ordering rule is inline in SKILL.md", () => {
    // R13: the leak-proof ordering is load-bearing and must not live only in
    // references/check-in.md, which an agent might not load before acting.
    expect(
      /end the turn/i.test(SKILL_BODY) &&
        /before the user's prediction turn ends/i.test(SKILL_BODY),
      "ce-explain SKILL.md must carry the predict-then-reveal ordering rule inline (show raw change only, take the prediction, end the turn).",
    ).toBe(true)
  })

  test("check-in makes the explainer the recommended first choice", () => {
    const explainerChoice = CHECK_IN_BODY.indexOf("Just the explainer (Recommended)")
    const quizChoice = CHECK_IN_BODY.indexOf("Quiz me")
    expect(explainerChoice).toBeGreaterThan(-1)
    expect(quizChoice).toBeGreaterThan(explainerChoice)
    expect(CHECK_IN_BODY).not.toMatch(/Quiz me \(Recommended\)/i)
    expect(CHECK_IN_BODY).toMatch(/Just the explainer[^\n]+skip prediction and exercises/i)
    expect(CHECK_IN_BODY).toMatch(/Predict-then-reveal[\s\S]+Run this section only when the user's exact choice was \*\*Quiz me\*\*/i)
    expect(CHECK_IN_BODY).toMatch(/Exercises \(concepts, ideas, dense recaps\)[\s\S]+Run this section only when the user's exact choice was \*\*Quiz me\*\*/i)
  })

  test("only the exact Quiz me choice enables prediction and exercises", () => {
    const phase3Start = SKILL_BODY.indexOf("### Phase 3")
    const phase4Start = SKILL_BODY.indexOf("### Phase 4")
    const phase5Start = SKILL_BODY.indexOf("### Phase 5")
    const phase6Start = SKILL_BODY.indexOf("### Phase 6")
    const phase3 = SKILL_BODY.slice(phase3Start, phase4Start)
    const phase5 = SKILL_BODY.slice(phase5Start, phase6Start)

    expect(phase3).toMatch(/Record the user's exact Phase 3 choice/i)
    expect(phase3).toMatch(/Only \*\*Quiz me\*\* enables the prediction and exercise mechanics/i)
    expect(phase3).toMatch(/\*\*Just the explainer\*\* skips both while still composing and presenting the report/i)
    expect(phase3).toMatch(/Diff mode with Quiz me selected/i)
    expect(phase5).toMatch(/only when the recorded exact Phase 3 choice was \*\*Quiz me\*\*/i)
    expect(phase5).toMatch(/choice was \*\*Just the explainer\*\*, skip this phase/i)
  })

  test("recap evidence is dispatched directly without a main-agent pre-scan", () => {
    expect(SKILL_BODY).toMatch(/dispatch a generic subagent directly/i)
    expect(SKILL_BODY).toMatch(/Do not pre-scan, count, or characterize the window/i)
  })

  test("Claude Artifact owns its adaptation and ht-ml requires post-warning confirmation", () => {
    expect(DESTINATIONS_BODY).toMatch(/Give the tool the canonical `\$RUN_DIR\/explainer\.html`/i)
    expect(DESTINATIONS_BODY).toMatch(/tool owns any adaptation needed/i)
    expect(DESTINATIONS_BODY).toMatch(/do not pre-process the HTML/i)
    expect(DESTINATIONS_BODY).not.toContain("extract-artifact-fragment.py")
    expect(DESTINATIONS_BODY).toMatch(/public and may be indexed, crawled, copied, or archived/i)
    // The one-preferred-publisher rule can suppress ht-ml.app from a menu that
    // WAS shown; a user naming it anyway has seen no warning and must still get
    // one. Pin the general condition, not just the narrow "menu skipped" case.
    expect(DESTINATIONS_BODY).toMatch(/chosen without that warned option in front of the user/i)
    expect(DESTINATIONS_BODY).toMatch(/kept it off a menu that \*was\* shown/i)
    expect(DESTINATIONS_BODY).toMatch(/ask for explicit confirmation after the warning before any publish/i)
    expect(DESTINATIONS_BODY).toMatch(/initial request itself does not count as confirmation/i)
    expect(DESTINATIONS_BODY).toMatch(/If confirmation cannot be obtained, do not publish; preserve the canonical `\$RUN_DIR\/explainer\.html` and report its local path/i)
    expect(SKILL_BODY).toMatch(/pre-warning request does not count as confirmation/i)
    expect(SKILL_BODY).toMatch(/If confirmation cannot be obtained, do not publish; preserve the canonical HTML and report its local `\$RUN_DIR\/explainer\.html` path/i)
    expect(SKILL_BODY).toMatch(/Publish publicly to ht-ml\.app[^\n]+read and follow the ht-ml\.app sub-flow in `references\/destinations\.md`/i)
    expect(DESTINATIONS_BODY).toMatch(/ht-ml\.app or general HTML-publishing capability/i)
    expect(DESTINATIONS_BODY).toMatch(/skill-invocation primitive/i)
    expect(DESTINATIONS_BODY).toMatch(/tool, connector, or browser capability directly/i)
    expect(DESTINATIONS_BODY).toMatch(/Do not assume a particular skill name or installation path/i)
    expect(DESTINATIONS_BODY).toContain("https://ht-ml.app/llms.txt")
    expect(DESTINATIONS_BODY).not.toContain("scripts/publish-ht-ml.sh")
    expect(DESTINATIONS_BODY).toMatch(/never publish headlessly/i)
  })

  test("HTML output pins stable metadata and preserves baseline constraints", () => {
    expect(HTML_REFERENCE_BODY).toMatch(/exact field labels `Date`, `Input shape`, and `Subject`/)
    expect(HTML_REFERENCE_BODY).toMatch(/exactly one of `concept`, `diff`, `idea`, or `recap`/)
    expect(HTML_REFERENCE_BODY).toMatch(/`Subject` names the topic, ref, or recap window/)
    expect(HTML_REFERENCE_BODY).toMatch(/No companion `\.css`, `\.js`, or `\.svg` files/)
    expect(HTML_REFERENCE_BODY).toMatch(/No external requests of any kind/)
    expect(HTML_REFERENCE_BODY).toMatch(
      /No forms, no click handlers, no embedded quizzes, no "submit" affordances, no scripts/,
    )
    expect(HTML_REFERENCE_BODY).toMatch(/Class names and element IDs are ASCII-only/)
  })
})

// Cross-file parity guard (issue #1057): SKILL.md Phase 3 and
// references/check-in.md deliberately BOTH carry the predict-then-reveal
// protocol — the inline copy is load-bearing (AGENTS.md: "Inline the Trigger,
// Not the Content"; the routing test above guards its presence), and the
// reference holds the on-demand detail. Two independently-editable copies of
// a safety-critical protocol can drift silently, so each load-bearing
// invariant must survive in both files. These are structural matches, not
// verbatim prose locks — the two copies already word the protocol slightly
// differently, and future wording improvements are fine as long as every
// invariant stays present in both.
describe("ce-explain predict-then-reveal parity between SKILL.md and references/check-in.md", () => {
  const invariants: { name: string; pattern: RegExp }[] = [
    {
      name: "the prediction question (what the change does, and why it was made)",
      pattern: /what do(?:es)?\s+(?:you think\s+)?this change do(?:es)?\b[\s\S]{0,40}?why (?:was it|it was) made/i,
    },
    {
      name: "the turn-end rule (end the turn after the prediction prompt)",
      pattern: /end the turn/i,
    },
    {
      name: "the never-same-message rule (no explanation in the prediction-prompt message)",
      pattern: /same message as the prediction prompt/i,
    },
    {
      // A run composing the Phase 3 offer from SKILL.md alone drafted an offer
      // that summarized the change, leaking the reveal before the prediction
      // was taken. The rule previously lived only in check-in.md.
      name: "the no-pre-leak rule for the diff-mode offer (do not describe the change when offering)",
      pattern: /without describing the change's content or purpose/i,
    },
  ]

  const copies: { label: string; body: string }[] = [
    { label: "SKILL.md", body: SKILL_BODY },
    { label: "references/check-in.md", body: CHECK_IN_BODY },
  ]

  for (const { name, pattern } of invariants) {
    for (const { label, body } of copies) {
      test(`${label} carries ${name}`, () => {
        expect(
          pattern.test(body),
          `ce-explain ${label} no longer carries ${name}. The predict-then-reveal protocol is duplicated across SKILL.md and references/check-in.md by design; if the wording changed, keep the invariant present in BOTH copies (matching ${pattern}) so the copies cannot drift apart silently.`,
        ).toBe(true)
      })
    }
  }
})

// Audience-rendering guards. ce-explain renders personally by default and for
// another reader on request; behavioral evals confirmed the judgment holds, but
// these pin the load-bearing wording the judgment reads from. Each assertion is
// the smallest unit that would have failed before the audience change landed.
const MARKDOWN_REFERENCE_PATH = path.join(
  process.cwd(),
  "skills/ce-explain/references/explainer-markdown.md",
)
const MARKDOWN_REFERENCE_BODY = readFileSync(MARKDOWN_REFERENCE_PATH, "utf8")
const INTAKE_PATH = path.join(process.cwd(), "skills/ce-explain/references/intake.md")
const INTAKE_BODY = readFileSync(INTAKE_PATH, "utf8")

// The HTML and markdown renderings are authored as a pair; a rule added to one
// and missed in the other is the drift these guards exist to catch.
const RENDERING_REFERENCES = [
  ["explainer-html.md", HTML_REFERENCE_BODY],
  ["explainer-markdown.md", MARKDOWN_REFERENCE_BODY],
] as const

// Mirrors the sliceSection helper in ce-work-outcome-spine.test.ts and
// pipeline-review-contract.test.ts, with the end anchor optional so a region
// running to end-of-file (Phase 6, the last phase) can share it. Asserting the
// anchor rather than slicing from -1 means a renamed heading fails as itself
// instead of silently shrinking the searched region to nothing.
function sliceSection(content: string, startAnchor: string, endAnchor?: string): string {
  const start = content.indexOf(startAnchor)
  expect(start, `start anchor not found: ${startAnchor}`).toBeGreaterThanOrEqual(0)
  if (endAnchor === undefined) return content.slice(start)
  const end = content.indexOf(endAnchor, start + startAnchor.length)
  expect(end, `end anchor not found: ${endAnchor}`).toBeGreaterThan(start)
  return content.slice(start, end)
}

describe("ce-explain audience rendering", () => {
  test("SKILL.md states both the personal default and the on-request adaptation", () => {
    expect(SKILL_BODY).toMatch(/Default — the user personally/i)
    expect(SKILL_BODY).toMatch(/On request — rendered for another reader/i)
    // Depth must not be traded away when the audience changes.
    expect(SKILL_BODY).toMatch(/adapt voice and orientation, never depth/i)
  })

  test("intake owns audience resolution, including the speak-from carve-out", () => {
    expect(INTAKE_BODY).toMatch(/## Audience resolution/i)
    expect(INTAKE_BODY).toMatch(/Default: the user personally/i)
    // The false positive the eval probed: "so I can explain it to the team"
    // names a group but the user is still the reader.
    expect(INTAKE_BODY).toMatch(/wanting to \*speak\* from the material is not an audience signal/i)
    // A share request is not a request to become a status update.
    expect(INTAKE_BODY).toMatch(/request to share is not a request for a status update/i)
  })

  test("tokens do not eat ordinary prose containing a colon", () => {
    // Without the reads-as-a-flag test, "walk me through the diff: why did we
    // split the parser" strips diff:why and forces diff mode on a bogus ref.
    expect(INTAKE_BODY).toMatch(/flag only when it reads as one/i)
    expect(INTAKE_BODY).toMatch(/If stripping it would garble the sentence, it was never a flag/i)
    // The old absolute rule let a corrupted token outrank correct inference.
    expect(INTAKE_BODY).toMatch(/A token in flag position beats inference\. A colon inside prose does not\./i)
    expect(INTAKE_BODY).not.toMatch(/An explicit token always beats inference/i)
  })

  test("plain-language windows are first-class, not a degraded token path", () => {
    expect(INTAKE_BODY).toMatch(/names a time window and little else/i)
    expect(INTAKE_BODY).toMatch(/\*\*Resolving the window \(recap mode\)\.\*\*/i)
    expect(INTAKE_BODY).toMatch(/a colon must not change the answer/i)
    expect(INTAKE_BODY).toMatch(/never silently substitute that default for a window the user did name/i)
  })

  test("both rendering references carry the same voice contract", () => {
    for (const [label, body] of RENDERING_REFERENCES) {
      expect(body, `${label} lost its Voice section`).toMatch(/## Voice — personal by default, adapted on request/i)
      expect(body, `${label} lost the no-second-person rule`).toMatch(/\*\*No second person\.\*\*/i)
      // A personal recap of team work needs both persons at once.
      expect(body, `${label} lost the multi-author rule`).toMatch(/naming \*other\* contributors in third person/i)
      // Honor the audience, refuse the form.
      expect(body, `${label} lost the status-update refusal`).toMatch(
        /does not become a status update or a deck/i,
      )
    }
  })

  test("an adapted artifact declares its reader in the metadata header", () => {
    expect(HTML_REFERENCE_BODY).toMatch(/labelled exactly `Rendered for`/i)
    expect(MARKDOWN_REFERENCE_BODY).toMatch(/`rendered_for: <reader>`/i)
    // Absent a spec, runs invented divergent variants of this row.
    expect(HTML_REFERENCE_BODY).toMatch(/a personal rendering omits the row entirely/i)
  })

  test("the audience-mismatch offer precedes the destination's consent gate", () => {
    const phase6 = sliceSection(SKILL_BODY, "### Phase 6")
    expect(phase6).toMatch(/\*\*Audience mismatch\.\*\*/i)
    expect(phase6).toMatch(/\*\*This offer comes first\*\*/i)
    expect(phase6).toMatch(/consent must attach to the artifact actually being published/i)
    expect(phase6).toMatch(/never re-render unasked, and never block the send on it/i)
  })

  test("the check-in is skipped for an artifact written for someone else", () => {
    expect(CHECK_IN_BODY).toMatch(/When the material and the request disagree, the request wins/i)
    expect(CHECK_IN_BODY).toMatch(/rendered for another reader, skip the offer/i)
  })
})

// Guards for gaps that behavioral eval runs hit in the pre-existing skill.
// Each pins the rule that was missing when a run had to improvise, so the
// improvisation cannot silently become the behavior again.
describe("ce-explain gaps found by behavioral evals", () => {
  test("diff mode has an empty-range rule, matching recap's empty-window rule", () => {
    // Two runs hit `main..HEAD` resolving to zero commits (work uncommitted)
    // and each invented a different disclosure.
    expect(SKILL_BODY).toMatch(/\*\*Empty range\*\*/i)
    expect(SKILL_BODY).toMatch(/do not silently explain something else/i)
    // A named subject that doesn't exist gets the same treatment.
    expect(SKILL_BODY).toMatch(/report that before explaining an adjacent thing/i)
  })

  test("recap's scout dispatch names the degradation path where it fires", () => {
    // Three runs independently reported that "dispatch a generic subagent"
    // carried no cross-reference to the Model Tiers degradation rule, which
    // lives in a separate section far above Phase 2.
    const phase2 = sliceSection(SKILL_BODY, "### Phase 2", "### Phase 3")
    expect(phase2).toMatch(/harness exposes no subagent primitive/i)
    expect(phase2).toMatch(/run the scout inline/i)
    // The no-pre-scan protection must survive when the scout IS the main agent.
    expect(phase2).toMatch(/form no view of the window until it is done/i)
  })

  test("an oversized window is selected from, not silently truncated", () => {
    for (const [label, body] of RENDERING_REFERENCES) {
      expect(body, `${label} lost the oversized-window rule`).toMatch(
        /When the evidence exceeds one sitting/i,
      )
      expect(body, `${label} lost the no-silent-truncation rule`).toMatch(/Never silently drop the tail/i)
    }
  })

  test("the destination ask and a publisher's consent gate are distinct asks", () => {
    const phase6 = sliceSection(SKILL_BODY, "### Phase 6")
    // "Ask once" previously read as forbidding the second confirmation the
    // bypass path requires.
    expect(phase6).toMatch(/that governs the menu itself, not the consent a chosen destination then requires/i)
    // Naming a suppressed publisher takes the bypassed-menu path.
    expect(phase6).toMatch(/never as though the menu had warned them/i)
  })

  test("improvement observations wait for a settled destination and cover stale repo docs", () => {
    const phase6 = sliceSection(SKILL_BODY, "### Phase 6")
    // The gate must name every ask that can be open, not just the destination
    // one: an enumeration missing the audience re-render offer reads as
    // permission to interleave handoffs with it.
    expect(phase6).toMatch(/Never raise them while any of the asks above is still open/i)
    expect(phase6).toMatch(/the audience re-render offer/i)
    // A superseded plan/solution doc fit none of the three original routes.
    expect(phase6).toMatch(/ce-compound-refresh/i)
    expect(phase6).toMatch(/this skill teaches, it does not maintain repo memory/i)
  })
})
