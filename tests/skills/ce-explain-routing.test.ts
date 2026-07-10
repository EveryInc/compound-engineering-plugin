import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_PATH = path.join(process.cwd(), "skills/ce-explain/SKILL.md")
const SKILL_BODY = readFileSync(SKILL_PATH, "utf8")

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
      { name: "Artifact surface", fragment: "Artifact surface" },
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

  test("ce-polish handoff is user-run, never skill-invoked", () => {
    // ce-polish sets disable-model-invocation: true (pinned in
    // EXPECTED_USER_INVOKED_SKILLS in tests/skill-conventions.test.ts), so the
    // model cannot dispatch it via the Skill tool. The routing must present
    // observations in chat and tell the user to run /ce-polish themselves.
    const polishBullet = phaseRegion.match(/^- \*\*[^\n]*polish[^\n]*\*\*[^\n]+/im)
    expect(
      polishBullet,
      "ce-explain SKILL.md Phase 6 is missing the inline UI/UX polish handoff bullet.",
    ).not.toBeNull()
    const line = polishBullet![0]
    expect(
      /tell the user to run\s+`\/ce-polish`|user-invoked only/i.test(line),
      "ce-explain SKILL.md polish handoff must present observations in chat and route to a user-run /ce-polish.",
    ).toBe(true)
    expect(
      /invoke the `ce-polish` skill/i.test(line),
      "ce-explain SKILL.md polish handoff must NOT instruct invoking ce-polish via the skill primitive — it is user-invoked only (disable-model-invocation).",
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
  const CHECK_IN_PATH = path.join(process.cwd(), "skills/ce-explain/references/check-in.md")
  const CHECK_IN_BODY = readFileSync(CHECK_IN_PATH, "utf8")

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
