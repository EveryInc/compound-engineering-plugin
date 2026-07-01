import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_PATH = path.join(
  process.cwd(),
  "skills/ce-plan/SKILL.md",
)
const SKILL_BODY = readFileSync(SKILL_PATH, "utf8")

const HANDOFF_PATH = path.join(
  process.cwd(),
  "skills/ce-plan/references/plan-handoff.md",
)
const HANDOFF_BODY = readFileSync(HANDOFF_PATH, "utf8")

const ISSUE_CREATION_START = HANDOFF_BODY.indexOf("## Issue Creation")
const ISSUE_CREATION_SECTION =
  ISSUE_CREATION_START > -1 ? HANDOFF_BODY.slice(ISSUE_CREATION_START) : ""

// Regression guard for https://github.com/EveryInc/compound-engineering-plugin/issues/714.
//
// ce-plan Phase 5.4 presents a 4-option post-generation menu. Because SKILL.md
// content caches at session start while reference files load on demand, the
// per-option routing (what action fires when the user picks an option) MUST
// live in SKILL.md itself — not solely in references/plan-handoff.md. The
// reference may still hold elaborate sub-flows (Issue Creation tracker
// detection); only the bare per-option action must be inline.
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
    // Testing for a label fragment (not the full label) tolerates label
    // phrasing tweaks without the assertion becoming brittle.
    const optionFragments: { name: string; fragment: string }[] = [
      { name: "Start /ce-work", fragment: "Start `/ce-work`" },
      { name: "Run it as a /goal", fragment: "Run it as a `/goal`" },
      { name: "Create Issue", fragment: "Create Issue" },
      { name: "Publish to Proof", fragment: "Publish to Proof" },
      // "Open in browser" is the HTML-mode replacement for Publish to Proof.
      // Both routings must be present inline: the menu shows one or the other
      // depending on OUTPUT_FORMAT, so the agent needs both bullets to route
      // correctly without loading the reference.
      { name: "Open in browser", fragment: "Open in browser" },
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

  test("Codex goal handoff is capability-based and menu-cap aware", () => {
    for (const [label, body] of [
      ["SKILL.md", SKILL_BODY],
      ["plan-handoff.md", HANDOFF_BODY],
    ] as const) {
      expect(
        body.includes("top-level `/goal` command"),
        `${label} must not gate Codex goal handoff on a literal top-level /goal command; Codex exposes goal mode through create_goal.`,
      ).toBe(false)
      expect(
        body.includes("hosts with a `/goal` command"),
        `${label} must not describe goal availability as slash-command-only; use goal capability and Codex create_goal instead.`,
      ).toBe(false)
      expect(
        /(?:Codex [`"]?request_user_input[`"]?[\s\S]{0,120}no option cap|no option cap[\s\S]{0,120}Codex [`"]?request_user_input[`"]?)/i.test(body),
        `${label} must not claim Codex request_user_input has no option cap; current Codex question tools only allow 2-3 explicit options.`,
      ).toBe(false)

      expect(
        body.includes("create_goal") && /goal capability/i.test(body),
        `${label} must explicitly treat Codex create_goal as goal capability so the /goal option renders in Codex app runs.`,
      ).toBe(true)
      expect(
        /request_user_input[\s\S]{0,120}2-3 explicit options/i.test(body),
        `${label} must document the Codex request_user_input 2-3 option cap so larger handoff menus use numbered chat instead of trimming choices.`,
      ).toBe(true)
    }
  })

  test("completion contract is visible before the workflow and guarded at the end", () => {
    const contractStart = SKILL_BODY.indexOf("## Mandatory Completion Contract")
    const interactionStart = SKILL_BODY.indexOf("## Interaction Method")
    expect(
      contractStart,
      "ce-plan SKILL.md must keep the Mandatory Completion Contract near the top so agents see the handoff boundary before entering the workflow.",
    ).toBeGreaterThan(-1)
    expect(
      interactionStart,
      "ce-plan SKILL.md no longer contains the Interaction Method heading — update this test anchor if the top section was restructured.",
    ).toBeGreaterThan(-1)
    expect(
      contractStart,
      "Mandatory Completion Contract must appear before Interaction Method, not only after Phase 5.4, so 'create the plan and stop' does not look like completion.",
    ).toBeLessThan(interactionStart)

    const topContract = SKILL_BODY.slice(contractStart, interactionStart)
    expect(
      /Every normal interactive `ce-plan` branch that produces a plan artifact or checkpoint is incomplete until its owning handoff question is presented/i.test(topContract),
      "Top completion contract must state that artifact/checkpoint branches are incomplete until their owning handoff question is presented.",
    ).toBe(true)
    expect(
      /software implementation-plan runs[\s\S]{0,120}Phase 5\.4[\s\S]{0,120}handoff menu/i.test(topContract),
      "Top completion contract must state that software implementation-plan runs are incomplete until the Phase 5.4 handoff menu is presented.",
    ).toBe(true)
    expect(
      /Non-software plan-seeking and approach-altitude branches[\s\S]{0,160}do not force those branches through Phase 5\.4/i.test(topContract),
      "Top completion contract must preserve branch-owned handoffs for non-software plan-seeking and approach-altitude branches.",
    ).toBe(true)
    expect(
      /Answer-seeking is the exception:[\s\S]{0,140}may end after delivering the answer unless[\s\S]{0,100}offer save\/share/i.test(topContract),
      "Top completion contract must allow answer-seeking to end after the answer unless universal-planning says to offer save/share.",
    ).toBe(true)
    expect(
      /intermediate milestones, not completion/i.test(topContract),
      "Top completion contract must say writing/reviewing the plan are intermediate milestones, not completion.",
    ).toBe(true)
    expect(
      /only ["“]create a plan["”][\s\S]{0,160}run [`']?ce-doc-review[`']?/i.test(topContract),
      "Top completion contract must make 'user only asked to create a plan / run ce-doc-review' non-exempt.",
    ).toBe(true)
    expect(
      /Plan ready at `<absolute path to plan>`\. What would you like to do next\?/i.test(topContract),
      "Top completion contract must include the literal Phase 5.4 handoff question.",
    ).toBe(true)
    expect(
      /headless review state or documented skip state is summarized/i.test(topContract),
      "Top completion contract must allow documented skip-state summaries, not only headless review summaries.",
    ).toBe(true)

    const checklistStart = SKILL_BODY.indexOf("**Final pre-response checklist:**")
    const completionStart = SKILL_BODY.indexOf("**Completion check:**")
    expect(
      checklistStart,
      "ce-plan SKILL.md must include a final pre-response checklist before the completion check.",
    ).toBeGreaterThan(-1)
    expect(
      completionStart,
      "ce-plan SKILL.md must keep the existing Completion check anchor.",
    ).toBeGreaterThan(-1)
    expect(
      checklistStart,
      "Final pre-response checklist should appear immediately before the terminal completion check.",
    ).toBeLessThan(completionStart)

    const finalGuard = SKILL_BODY.slice(checklistStart, SKILL_BODY.indexOf("**Pipeline mode exception:**"))
    for (const expected of [
      "Plan file exists on disk",
      "Headless review state or documented skip state was summarized above the menu",
      "Phase 5.4 menu was presented for software implementation-plan runs, even if the user only asked to create the plan or run doc review, unless pipeline mode returned control to the caller",
      "If the user selected an action, the selected routing was executed",
      'Incorrect final response: "Created the plan and ran doc review."',
      'Correct terminal handoff: "Created the plan and ran doc review. Plan ready at `<absolute path to plan>`. What would you like to do next?"',
    ]) {
      expect(
        finalGuard.includes(expected),
        `Final completion guard is missing expected text: ${expected}`,
      ).toBe(true)
    }
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

  // Regression guard for PR #961's underlying problem: Issue Creation hardcoded
  // a `linear issue create` CLI and instructed the agent to "Read AGENTS.md /
  // CLAUDE.md" to detect the tracker. Both are wrong — Linear has no guaranteed
  // first-party CLI (false-negative probes caused silent local-doc fallbacks),
  // and the project's instruction files are already in context, so naming them
  // for a re-read is redundant, harness-brittle, and an injection smell. These
  // assertions are behavior-focused (capability language present, bad patterns
  // absent) rather than locking exact prose.
  describe("Issue Creation is capability-based, not CLI/filename-coupled", () => {
    // Shared anchor guard: a renamed/removed "## Issue Creation" heading would
    // leave ISSUE_CREATION_SECTION empty, making the absence assertions below
    // vacuously pass. Fail loudly here instead so the cause is obvious.
    test("plan-handoff.md still has an '## Issue Creation' section", () => {
      expect(
        ISSUE_CREATION_START,
        "plan-handoff.md is missing the '## Issue Creation' section — the other assertions in this block anchor on it.",
      ).toBeGreaterThan(-1)
    })

    test("does not prescribe a `linear issue create` CLI", () => {
      expect(
        HANDOFF_BODY.includes("linear issue create"),
        "references/plan-handoff.md must not prescribe `linear issue create`; Linear has no guaranteed first-party CLI. Route through whatever interface Linear exposes (connector/MCP, documented API/GraphQL, or a documented CLI).",
      ).toBe(false)
    })

    test("names the accepted Linear access surfaces and guards the false-negative probe", () => {
      expect(
        /connector|MCP/i.test(ISSUE_CREATION_SECTION) && /API|GraphQL/i.test(ISSUE_CREATION_SECTION),
        "Issue Creation must name capability-based Linear access surfaces (connector/MCP and documented API/GraphQL), not a single hardcoded CLI.",
      ).toBe(true)

      expect(
        /do not (?:assume|treat|infer)[\s\S]{0,200}(?:missing|no )[\s\S]{0,120}(?:binary|MCP|env|unavailable)/i.test(ISSUE_CREATION_SECTION),
        "Issue Creation must guard against the false-negative probe: a missing binary / env var / MCP server is not proof the tracker is unavailable.",
      ).toBe(true)
    })

    test("tracker detection reads from context, not by re-opening named instruction files", () => {
      // The detection step must not instruct re-reading a named root instruction
      // file (the old "Read `AGENTS.md` (or `CLAUDE.md` ...)" probe). It should
      // reference the project instructions already in context instead. Naming
      // AGENTS.md is still allowed on the WRITE path (persisting project_tracker).
      expect(
        /Read `?AGENTS\.md`?\s*\(or\s*`?CLAUDE\.md`?/i.test(ISSUE_CREATION_SECTION),
        'Issue Creation tracker detection must not instruct "Read AGENTS.md (or CLAUDE.md ...)"; reference the project instructions already in context. Naming a file is reserved for the write-back path.',
      ).toBe(false)

      expect(
        /already in your context|active instructions/i.test(ISSUE_CREATION_SECTION),
        "Issue Creation tracker detection must point at the project instructions already in the agent's context rather than a file to open.",
      ).toBe(true)
    })

    // Codex review of PR #971 (P1): the prose named the tracker category, but
    // the visible menu still said "(GitHub or Linear)" and the no-config prompt
    // offered no path for any other tracker — keeping the closed set exactly
    // when recovering from missing config. Guard both surfaces.
    test("menu labels name the tracker category, not a closed GitHub/Linear set", () => {
      expect(
        /configured issue tracker \(GitHub or Linear\)/i.test(SKILL_BODY),
        'ce-plan SKILL.md "Create Issue" menu label must name the category (e.g., GitHub Issues, Linear, Jira), not the closed "(GitHub or Linear)" set.',
      ).toBe(false)
      expect(
        /configured issue tracker \(GitHub or Linear\)/i.test(HANDOFF_BODY),
        'plan-handoff.md "Create Issue" menu label must name the category, not the closed "(GitHub or Linear)" set.',
      ).toBe(false)
    })

    test("no-config prompt routes other trackers via free-form, not a 4th explicit option", () => {
      // Non-GitHub/Linear trackers must not be locked out, but the path is the
      // blocking tool's built-in free-form/Other input — not an explicit fourth
      // `Other` option, which is redundant where the tool already offers free-form
      // and exceeds the 2-3 explicit-option cap on Codex `request_user_input`.
      expect(
        /free-form|different tracker|another tracker|other-tracker/i.test(ISSUE_CREATION_SECTION),
        "Issue Creation no-config prompt must let the user reach a non-GitHub/Linear tracker via the tool's free-form path.",
      ).toBe(true)
      expect(
        /Options:[^\n]*`Other`|`Linear`,\s*`Other`/.test(ISSUE_CREATION_SECTION),
        "Issue Creation no-config prompt must NOT add an explicit fourth `Other` option (redundant + exceeds Codex's explicit-option cap); rely on the tool's built-in free-form input.",
      ).toBe(false)
    })

    // Codex review of PR #971 (P3): the inline SKILL.md routing caches at session
    // start while the reference loads on demand, so the capability-based Linear
    // guidance must also live inline — not only in plan-handoff.md.
    test("inline SKILL.md Create Issue routing is capability-based for Linear", () => {
      const phaseStart = SKILL_BODY.indexOf("##### 5.3.8")
      const phaseRegion = SKILL_BODY.slice(phaseStart)
      const createIssueRouting = phaseRegion.match(
        /^- \*\*Create Issue\*\*[^\n]+/m,
      )
      expect(
        createIssueRouting,
        "ce-plan SKILL.md is missing the inline '- **Create Issue** ...' routing bullet.",
      ).not.toBeNull()
      const bullet = createIssueRouting![0]
      expect(
        /connector|MCP|API|GraphQL/i.test(bullet) && /no guaranteed `linear` CLI|not.*proof|do not treat/i.test(bullet),
        "ce-plan SKILL.md inline Create Issue routing must carry the capability-based Linear guidance (named access surfaces + 'missing binary is not proof unavailable'), since inline routing is what an agent sees when the reference isn't loaded.",
      ).toBe(true)
    })
  })
})
