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

// The menu and its per-option routing live in references/destinations.md, which
// SKILL.md names as a required read before the destination phase renders anything. That is the
// condition #714 turned on: routing may live in a reference the body names as a
// required read at the step that needs it; it may not live in one the body
// mentions once in passing. Measured before shipping the move — 4 destination
// options x 3 trials x Claude Code and Codex, inline vs relocated: 21/21 correct
// on each arm, and every relocated-arm run opened the reference
// (docs/solutions/skill-design/post-menu-routing-belongs-inline.md).
//
// So these pins guard two things together, and both halves must hold: the body
// demands the read at the point of use, and the reference carries a firing
// action for every option. Symptom when this regresses: the agent renders the
// destination menu, the user picks an option, and the agent stops in prose
// without firing the action.
//
// Phase anchors for the body slices. The check-in's move into the artifact
// (#1628) renumbered compose to Phase 3 and the destination ask to Phase 4.
const DESTINATION_PHASE = "### Phase 4"
const COMPOSE_PHASE = "### Phase 3"

describe("ce-explain destination and handoff routing", () => {
  test("SKILL.md demands the destinations read before the destination phase renders anything", () => {
    const destination = sliceSection(SKILL_BODY, DESTINATION_PHASE)
    expect(destination).toMatch(/Required read before you render anything in this phase/i)
    expect(destination).toContain("`references/destinations.md`")
    expect(destination).toMatch(/do not render the menu and do not act on the user's selection without it/i)
  })

  const phaseRegion = DESTINATIONS_BODY

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
        `ce-explain references/destinations.md is missing the per-option action for destination "${name}". Every menu option needs an action to fire, in the file SKILL.md names as the required destination-phase read. See docs/solutions/skill-design/post-menu-routing-belongs-inline.md.`,
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
        `ce-explain references/destinations.md is missing the handoff bullet naming ${target}.`,
      ).not.toBeNull()
      expect(
        /skill[\s-]?invocation|Skill tool|skill primitive/i.test(bullet![0]),
        `ce-explain references/destinations.md ${target} handoff must name the skill-invocation primitive so the agent fires the invocation rather than announcing a handoff in prose.`,
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
      "`ce-explain` references/destinations.md is missing the UI/UX polish handoff bullet.",
    ).not.toBeNull()
    const line = polishBullet![0]
    const renderingRule = phaseRegion.match(/\*\*User-runnable invocation rendering\.\*\*[^\n]+/i)
    expect(renderingRule).not.toBeNull()
    expect(
      /user-invoked only/i.test(line) &&
        /rendering rule above/i.test(line) &&
        renderingRule![0].includes("$ce-polish") &&
        renderingRule![0].includes("/ce-polish") &&
        renderingRule![0].includes("/skill:ce-polish") &&
        /active host|Codex/i.test(renderingRule![0]) &&
        /default to `\/ce-polish`[^.]{0,180}dollar-prefixed/i.test(renderingRule![0]) &&
        /oh-my-pi \(`omp`\)[^\n]*\/skill:ce-polish/i.test(renderingRule![0]),
      "`ce-explain` references/destinations.md polish handoff must present observations in chat and render one host-correct user invocation for `ce-polish`.",
    ).toBe(true)
    expect(
      /invoke the `ce-polish` skill/i.test(line),
      "`ce-explain` references/destinations.md polish handoff must NOT instruct invoking `ce-polish` via the skill primitive — it is user-invoked only (disable-model-invocation).",
    ).toBe(false)
  })

  test("the check-in is a static in-artifact section, never an offer or a chat quiz", () => {
    // Issue #1628: on Codex the run sat blocked on the "Just the explainer /
    // Quiz me" offer. The check-in now lives in the artifact as a `Check
    // yourself` section (questions first, then answers) and the run asks no
    // question about it. The section's shape is owned by check-in.md; these
    // are the stable tokens a rendering must carry.
    expect(CHECK_IN_BODY).toContain("Check yourself")
    expect(CHECK_IN_BODY).toContain("`Answers`")
    expect(CHECK_IN_BODY).toMatch(/two to four/i)
    // Questions before answers is the whole mechanism the static section keeps
    // from the old predict-then-reveal turn; an interleaved layout is a worked FAQ.
    expect(CHECK_IN_BODY).toMatch(/attempt every question before any answer is in view/i)
    // The request decides in both directions; the warrant test decides only
    // when the request is silent.
    expect(CHECK_IN_BODY).toMatch(/request wins in both directions/i)
    expect(CHECK_IN_BODY).toMatch(/When the material and the request disagree, the request wins/i)
    // The reader no longer changes the decision: the section exercises whoever
    // reads the document, so the old another-reader skip is gone.
    expect(CHECK_IN_BODY).not.toMatch(/rendered for another reader, skip/i)
    // No interactive shape survives anywhere in the reference.
    expect(CHECK_IN_BODY).not.toMatch(/blocking question/i)
    expect(CHECK_IN_BODY).not.toMatch(/end the turn/i)
  })

  test("the compose phase states the non-blocking invariant and keeps the chat summary", () => {
    // The body must carry the one stop class that has to fire without a
    // reference read — the run never blocks on the check-in — inside the
    // compose phase, which sits before Codex's 8000-byte truncation point.
    const compose = sliceSection(SKILL_BODY, COMPOSE_PHASE, DESTINATION_PHASE)
    expect(compose).toContain("`references/check-in.md`")
    expect(compose).toMatch(/never blocks on the check-in/i)
    // Codex injects only the first 8000 bytes of an over-budget SKILL.md
    // (MAX_SKILL_PROMPT_BYTES; tests/codex-skill-prompt-budget.test.ts), and
    // #1628 came from Codex. ce-explain is still over budget, so this sentence
    // is the only copy of the invariant that host reads; measured the same way
    // that test measures (CRLF-adjusted), it must stay above the cut.
    const lf = SKILL_BODY.replace(/\r\n/g, "\n")
    const beforeInvariant = lf.slice(0, lf.indexOf("never blocks on the check-in"))
    const crlfOffset = Buffer.byteLength(beforeInvariant, "utf8") + (beforeInvariant.match(/\n/g)?.length ?? 0)
    expect(crlfOffset).toBeLessThan(8000)
    // KTD3 (#1628 plan): diff mode gets no path-only chat rule; the summary is
    // the only explainer content a Codex user sees without opening the file.
    expect(compose).toMatch(/inline summary plus the file path/i)
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
    expect(DESTINATIONS_BODY).toMatch(/pre-warning request does not count as confirmation/i)
    expect(DESTINATIONS_BODY).toMatch(/If confirmation cannot be obtained, do not publish; preserve the canonical HTML and report its local `\$RUN_DIR\/explainer\.html` path/i)
    expect(DESTINATIONS_BODY).toMatch(/Publish publicly to ht-ml\.app[^\n]+follow the ht-ml\.app sub-flow below/i)
    // The stop classes that must hold even if this file is never opened stay in
    // the body: a publish is never headless or inferred, naming the destination
    // is not the confirmation, and the body must not read as a runnable publish
    // sequence — spelling one out there is the paraphrase that suppresses the
    // read this phase depends on.
    const destinationBody = sliceSection(SKILL_BODY, DESTINATION_PHASE)
    expect(destinationBody).toMatch(/never headless and never inferred/i)
    expect(destinationBody).toMatch(/a choice of destination rather than that confirmation/i)
    expect(destinationBody).toMatch(/do not run the sequence from this paragraph/i)
    // A size pass shortened "offered, never auto-fired" to "never fired", which
    // forbade the acceptance path the reference requires. Pin the condition:
    // the offer precedes the fire, and acceptance fires it.
    expect(destinationBody).toMatch(/offered before anything fires/i)
    expect(destinationBody).toMatch(/once the user accepts one, invoke it through the skill primitive/i)
    expect(destinationBody).toMatch(/do not publish; preserve the canonical HTML and report its local `\$RUN_DIR\/explainer\.html` path/i)
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
      /No forms, no click handlers, no interactive quizzes, no "submit" affordances, no scripts/,
    )
    expect(HTML_REFERENCE_BODY).toMatch(/Class names and element IDs are ASCII-only/)
  })
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
// running to end-of-file (the destination phase, the last one) can share it. Asserting the
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
  test("the compose-time reference owns the audience rendering, and the body points at it", () => {
    // The body's own copy of this contract was a paraphrase of what both
    // rendering references already state in full; it is gone, and the compose
    // phase names the owner instead.
    const compose = sliceSection(SKILL_BODY, COMPOSE_PHASE, DESTINATION_PHASE)
    expect(compose).toMatch(/personal by default, adapted for another reader on request, at unchanged depth/i)
    for (const [label, body] of RENDERING_REFERENCES) {
      // Depth must not be traded away when the audience changes.
      expect(body, `${label} lost the unchanged-depth rule`).toMatch(/Same depth/i)
    }
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
    const phase6 = DESTINATIONS_BODY
    expect(phase6).toMatch(/## Audience mismatch/i)
    expect(phase6).toMatch(/\*\*This offer comes first\*\*/i)
    expect(phase6).toMatch(/consent must attach to the artifact actually being published/i)
    expect(phase6).toMatch(/never re-render unasked, and never block the send on it/i)
  })

  test("both rendering references own the static check-in section the same way", () => {
    // "lives in the session" is the superseded wording the static section replaced.
    for (const [label, body] of RENDERING_REFERENCES) {
      expect(body, `${label} lost the check-in.md citation`).toContain("`references/check-in.md`")
      expect(body, `${label} lost the Check yourself section`).toContain("Check yourself")
      expect(body, `${label} lost the questions-first ordering`).toMatch(/questions first, then their answers/i)
      expect(body, `${label} still says the check-in lives in the session`).not.toMatch(/lives in the session/i)
      // KTD4 (#1628 plan): references name phases by role, not number, so a
      // body renumbering cannot strand a load-time cue.
      expect(body, `${label} names a phase number in its load-time cue`).not.toMatch(/compose time \(Phase \d\)/i)
    }
    expect(MARKDOWN_REFERENCE_BODY).not.toMatch(/No exercise or quiz content in the artifact/i)
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
    const phase2 = sliceSection(SKILL_BODY, "### Phase 2", COMPOSE_PHASE)
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
    const destination = sliceSection(SKILL_BODY, DESTINATION_PHASE)
    const relocated = DESTINATIONS_BODY
    // "Ask once" previously read as forbidding the second confirmation the
    // bypass path requires.
    expect(destination).toMatch(/that governs the menu itself, not the consent a chosen destination then requires/i)
    // Naming a suppressed publisher takes the bypassed-menu path.
    expect(relocated).toMatch(/never as though the menu had warned them/i)
  })

  test("improvement observations wait for a settled destination and cover stale repo docs", () => {
    const phase6 = DESTINATIONS_BODY
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
