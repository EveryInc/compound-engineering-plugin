import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-plan/SKILL.md",
)
const SKILL_BODY = readFileSync(SKILL_PATH, "utf8")

const HANDOFF_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-plan/references/plan-handoff.md",
)
const HANDOFF_BODY = readFileSync(HANDOFF_PATH, "utf8")

// Regression guard for https://github.com/EveryInc/compound-engineering-plugin/issues/714.
//
// ce-plan Phase 5.4 presents a 4-option post-generation menu. Because SKILL.md
// content caches at session start while reference files load on demand, the
// per-option routing (what action fires when the user picks an option) MUST
// live in SKILL.md itself — not solely in references/plan-handoff.md. The
// reference may still hold elaborate sub-flows (HITL state machine, Issue
// Creation tracker detection); only the bare per-option action must be inline.
//
// Symptom when this regresses: the agent renders the menu, the user picks
// "Start `/ce-work` (Recommended)", and the agent stops in prose without
// invoking the ce-work skill.
describe("ce-plan post-generation menu routing", () => {
  test("SKILL.md contains inline routing for all four menu options", () => {
    // Anchor on the Phase 5.4 region so a stray match elsewhere in the file
    // doesn't satisfy these assertions.
    const phaseStart = SKILL_BODY.indexOf("##### 5.3.8")
    expect(
      phaseStart,
      "ce-plan SKILL.md no longer contains the '##### 5.3.8' phase heading — the test anchor needs updating, or Phase 5.4 was removed.",
    ).toBeGreaterThan(-1)
    const phaseRegion = SKILL_BODY.slice(phaseStart)

    // Each menu option must have a routing bullet in the phase region that
    // pairs the label with an action statement. The routing bullet shape is
    // `- **<label-or-label-fragment>** — <action sentence>`. We accept "—",
    // "->", or "-" as the separator so legitimate phrasing tweaks don't break
    // the test, but require:
    //   - the line starts with `- **` (a bullet, not the numbered menu list)
    //   - the bold span contains a fragment unique to the option label
    //   - the bold span is followed by a separator and at least one action verb
    // Testing for a label fragment (not the full label) tolerates the long
    // "Open in Proof (web app) — review and comment to iterate with the agent"
    // label without the assertion becoming brittle.
    const optionFragments: { name: string; fragment: string }[] = [
      { name: "Start /ce-work", fragment: "Start `/ce-work`" },
      { name: "Create Issue", fragment: "Create Issue" },
      { name: "Open in Proof", fragment: "Open in Proof" },
      { name: "Done for now", fragment: "Done for now" },
    ]

    for (const { name, fragment } of optionFragments) {
      const escaped = fragment.replace(/[.*+?^${}()|[\]\\`]/g, "\\$&")
      // Bullet form: `- **...<fragment>...**` followed by separator + action,
      // ALL on the same line. Use `[ \t]*` for the inter-token gaps instead of
      // `\s*` so a bullet with no action text cannot match by spilling into the
      // next bullet's leading `-` (Codex P2 catch on PR #715: `\s*` consumed
      // newlines, letting an empty-action bullet pass the regex). The trailing
      // `[^\n]+` requires at least one non-newline character of action text.
      const inlineRoutingPattern = new RegExp(
        `^- \\*\\*[^\\n]*${escaped}[^\\n]*\\*\\*[ \\t]*(?:[—\\-]+>?|->)[ \\t]*[^\\n]+`,
        "m",
      )
      const found = inlineRoutingPattern.test(phaseRegion)
      expect(
        found,
        `ce-plan SKILL.md Phase 5.4 is missing inline routing for menu option "${name}". The bare per-option action MUST live in SKILL.md (not solely in references/plan-handoff.md) so an agent that doesn't load the reference still routes correctly. See https://github.com/EveryInc/compound-engineering-plugin/issues/714 and docs/solutions/skill-design/post-menu-routing-belongs-inline-2026-04-28.md.`,
      ).toBe(true)
    }
  })

  test("Start /ce-work routing names skill-invocation primitive and plan path", () => {
    const phaseStart = SKILL_BODY.indexOf("##### 5.3.8")
    const phaseRegion = SKILL_BODY.slice(phaseStart)

    // The Start /ce-work routing line must be platform-explicit. We require
    // that the routing BULLET (not the menu list entry) names both
    // (a) the skill-invocation primitive (Skill tool / skill-invocation /
    // skill primitive) and (b) the plan path being passed as the argument.
    // This is what makes the difference between "tell the user to type
    // /ce-work" and "fire the Skill tool now."
    //
    // Anchor on the bullet form `- **Start \`/ce-work\`**` to avoid matching
    // the numbered menu list entry `1. **Start \`/ce-work\`** (recommended) -`,
    // which legitimately doesn't carry the routing language.
    const ceWorkRoutingMatch = phaseRegion.match(
      /^- \*\*Start `\/ce-work`\*\*[\s\S]{0,500}/m,
    )
    expect(
      ceWorkRoutingMatch,
      "ce-plan SKILL.md Phase 5.4 is missing the inline '- **Start `/ce-work`** ...' routing bullet (distinct from the numbered menu list entry).",
    ).not.toBeNull()
    const block = ceWorkRoutingMatch![0]

    expect(
      /skill[\s-]?invocation|Skill tool|skill primitive/i.test(block),
      "ce-plan SKILL.md 'Start /ce-work' routing must name the skill-invocation primitive (e.g., 'Skill tool in Claude Code', 'platform's skill-invocation primitive') so the agent fires the invocation rather than announcing a handoff in prose. See issue #714.",
    ).toBe(true)

    expect(
      /plan path|plan file path|plan as the (?:skill )?argument|passing the plan/i.test(block),
      "ce-plan SKILL.md 'Start /ce-work' routing must name the plan path as the argument so the agent passes it correctly to ce-work. See issue #714.",
    ).toBe(true)
  })

  test("plan-handoff.md routing for Start /ce-work matches the inline platform-explicit phrasing", () => {
    // Both surfaces must converge: the reference file's routing line should
    // also use platform-explicit invocation language so that an agent which
    // does load the reference sees compatible (not contradictory) guidance.
    const ceWorkLine = HANDOFF_BODY.match(
      /\*\*Start `\/ce-work`\*\*[^\n]*->[^\n]+/,
    )
    expect(
      ceWorkLine,
      "references/plan-handoff.md is missing the routing line for 'Start /ce-work'.",
    ).not.toBeNull()

    expect(
      /skill[\s-]?invocation|Skill tool|skill primitive/i.test(ceWorkLine![0]),
      `references/plan-handoff.md 'Start /ce-work' routing must use platform-explicit invocation language matching SKILL.md (e.g., 'invoke the ce-work skill via the platform's skill-invocation primitive'). The bare 'Call /ce-work with the plan path' phrasing was the regression. Found: ${JSON.stringify(ceWorkLine![0])}`,
    ).toBe(true)
  })

  test("inline-routing regex rejects empty-action bullets even when followed by another bullet", () => {
    // Regression guard for Codex P2 finding on PR #715: the previous
    // `\s*(?:...)\s*` shape allowed newline consumption, so a bullet with no
    // action text on its own line could still match by spilling into the next
    // bullet's leading `-`. The first test in this file would silently pass
    // on a real regression. This test recreates the failure mode and asserts
    // the regex now refuses it.
    //
    // Construct the same regex shape used above and exercise it directly
    // against a hand-rolled fixture — no live SKILL.md needed.
    const fragment = "Start `/ce-work`"
    const escaped = fragment.replace(/[.*+?^${}()|[\]\\`]/g, "\\$&")
    const fixedRegex = new RegExp(
      `^- \\*\\*[^\\n]*${escaped}[^\\n]*\\*\\*[ \\t]*(?:[—\\-]+>?|->)[ \\t]*[^\\n]+`,
      "m",
    )
    const broken = [
      "- **Start `/ce-work`**",
      "- **Done for now** — End the turn.",
    ].join("\n")
    expect(
      fixedRegex.test(broken),
      "Routing regex must NOT match a bullet with no action text on its own line, even when the next bullet's `-` could be misread as the separator. If this assertion fires, the regex regressed back to consuming newlines (Codex P2 on PR #715).",
    ).toBe(false)

    // And confirm the regex still matches the legitimate same-line shape so
    // the negative case isn't masking a positive-case breakage.
    const valid = "- **Start `/ce-work`** — Invoke the ce-work skill, passing the plan path."
    expect(fixedRegex.test(valid)).toBe(true)
  })
})
