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

const APPROACH_ALTITUDE_BODY = readFileSync(
  path.join(process.cwd(), "skills/ce-plan/references/approach-altitude.md"),
  "utf8",
)

const DOC_REVIEW_BODY = readFileSync(
  path.join(process.cwd(), "skills/ce-doc-review/SKILL.md"),
  "utf8",
)

const DOC_REVIEW_MODES = readFileSync(
  path.join(process.cwd(), "skills/ce-doc-review/references/modes.md"),
  "utf8",
)

const DOC_REVIEW_INTAKE = readFileSync(
  path.join(process.cwd(), "skills/ce-doc-review/references/document-intake.md"),
  "utf8",
)

const ISSUE_CREATION_START = HANDOFF_BODY.indexOf("## Issue Creation")
const ISSUE_CREATION_SECTION =
  ISSUE_CREATION_START > -1 ? HANDOFF_BODY.slice(ISSUE_CREATION_START) : ""

// Regression guard for https://github.com/EveryInc/compound-engineering-plugin/issues/714.
//
// ce-plan's kernel now requires plan-handoff.md immediately before Phase 5.4
// and reloads it before acting on a later-turn selection. The reference owns
// the menu and every route; the body owns the fail-closed load and completion
// predicate that prevent the original issue #714 stop-in-prose regression.
//
// Symptom when this regresses: the agent renders the menu, the user picks
// "Start `ce-work` (Recommended)", and the agent stops in prose without
// invoking the `ce-work` skill.
describe("ce-plan post-generation menu routing", () => {
  test("plan-handoff.md owns executable routing for every menu option", () => {
    // Anchor on the Phase 5.4 region so a stray match elsewhere in the file
    // doesn't satisfy these assertions.
    const phaseStart = HANDOFF_BODY.indexOf("## 5.4 Post-Generation Options")
    expect(
      phaseStart,
      "plan-handoff.md no longer contains the Phase 5.4 owner anchor.",
    ).toBeGreaterThan(-1)
    const phaseRegion = HANDOFF_BODY.slice(phaseStart)

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
      { name: "Start `ce-work`", fragment: "Start `ce-work`" },
      { name: "Run it as a /goal", fragment: "Run it as a `/goal`" },
      { name: "Create Issue", fragment: "Create Issue" },
      { name: "Prototype a remaining feel-question", fragment: "Prototype a remaining feel-question" },
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
        `plan-handoff.md is missing executable routing for menu option "${name}".`,
      ).toBe(true)
    }
  })

  test("Start `ce-work` routing names the host skill mechanism and plan path", () => {
    const phaseStart = HANDOFF_BODY.indexOf("## 5.4 Post-Generation Options")
    const phaseRegion = HANDOFF_BODY.slice(phaseStart)

    // The Start `ce-work` routing BULLET (not the menu list entry) must name
    // both (a) the host's skill-invocation mechanism and (b) the plan path
    // being passed as the argument.
    // This is what makes the difference between "tell the user to type
    // a user invocation and "fire the Skill tool now."
    //
    // Anchor on the bullet form `- **Start \`ce-work\`**` to avoid matching
    // the numbered menu list entry `1. **Start \`ce-work\`** (recommended) -`,
    // which legitimately doesn't carry the routing language.
    const ceWorkRoutingMatch = phaseRegion.match(
      /^- \*\*Start `ce-work`\*\*[\s\S]{0,500}/m,
    )
    expect(
      ceWorkRoutingMatch,
      "plan-handoff.md is missing the '- **Start `ce-work`** ...' routing bullet.",
    ).not.toBeNull()
    const block = ceWorkRoutingMatch![0]

    expect(
      /skill[\s-]?invocation|Skill tool|skill primitive/i.test(block),
      "plan-handoff.md 'Start `ce-work`' routing must name the host's skill-invocation mechanism.",
    ).toBe(true)

    expect(
      /plan path|plan file path|plan as the (?:skill )?argument|passing the plan/i.test(block),
      "plan-handoff.md 'Start `ce-work`' routing must name the plan path as the argument.",
    ).toBe(true)
  })

  test("plan-handoff.md Start `ce-work` route is host-generic", () => {
    const ceWorkLine = HANDOFF_BODY.match(
      /\*\*Start `ce-work`\*\*[^\n]*->[^\n]+/,
    )
    expect(
      ceWorkLine,
      "references/plan-handoff.md is missing the routing line for 'Start `ce-work`'.",
    ).not.toBeNull()

    expect(
      /skill[\s-]?invocation|Skill tool|skill primitive/i.test(ceWorkLine![0]),
      `references/plan-handoff.md 'Start \`ce-work\`' routing must use host-generic invocation language. Found: ${JSON.stringify(ceWorkLine![0])}`,
    ).toBe(true)
  })

  test("mandatory document review uses the host skill mechanism without a Task stand-in", () => {
    const reviewStart = HANDOFF_BODY.indexOf("## 5.3.8 Document Review")
    const reviewEnd = HANDOFF_BODY.indexOf("## 5.3.9 Final Checks and Cleanup")
    const reviewSection = HANDOFF_BODY.slice(reviewStart, reviewEnd)

    expect(
      /host(?:'s)? normal skill-invocation mechanism/i.test(reviewSection),
      "ce-plan 5.3.8 must invoke ce-doc-review through the host's normal skill mechanism instead of naming one harness's tool.",
    ).toBe(true)
    expect(
      /do not substitute[^.]{0,120}(?:Task|Agent|subagent)/i.test(reviewSection),
      "ce-plan 5.3.8 must forbid generic Task/Agent/subagent wrappers as skill-invocation substitutes.",
    ).toBe(true)
    expect(
      reviewSection.includes("skipped_reason: skill_unreachable"),
      "ce-plan 5.3.8 must record a truthful pre-entry state when ce-doc-review cannot be invoked.",
    ).toBe(true)
    expect(
      /(?:error|timeout)[^.]{0,120}only after[^.]{0,120}(?:begins|began|starts|started)/i.test(reviewSection),
      "ce-plan 5.3.8 must reserve downstream error/timeout claims for a review workflow that actually started.",
    ).toBe(true)
  })

  test("cross-skill routes use one generic invocation contract across skill-capable hosts", () => {
    expect(/host(?:'s)? normal skill-invocation mechanism/i.test(HANDOFF_BODY)).toBe(true)
    expect(/do not substitute[^.]{0,120}(?:Task|Agent|subagent)/i.test(HANDOFF_BODY)).toBe(true)
    expect(HANDOFF_BODY.includes("`Skill` in Claude Code and Codex")).toBe(false)

    for (const route of ["Start `ce-work`", "Decide on the review's open items", "Prototype a remaining feel-question"]) {
      const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const bullet = HANDOFF_BODY.match(new RegExp(`^- \\*\\*${escaped}[^\\n]+`, "m"))?.[0]
      expect(bullet, `plan-handoff.md is missing the ${route} routing bullet.`).toBeDefined()
      expect(
        /normal skill-invocation mechanism|cross-skill invocation rule/i.test(bullet!),
        `plan-handoff.md ${route} routing must apply the generic cross-skill invocation contract.`,
      ).toBe(true)
    }
  })

  test("related handoff surfaces do not teach Claude-shaped skill calls", () => {
    expect(
      DOC_REVIEW_BODY.includes('Skill("ce-doc-review"'),
      "ce-doc-review must describe its arguments without teaching callers a Claude-only Skill(...) call shape.",
    ).toBe(false)
    expect(
      /host(?:'s)? normal skill-invocation mechanism/i.test(APPROACH_ALTITUDE_BODY),
      "approach-altitude's ce-work handoff must use the same host-generic skill invocation contract.",
    ).toBe(true)
    expect(
      /skill_unreachable/.test(HANDOFF_BODY),
      "ce-plan's handoff owner must admit the documented skill_unreachable state.",
    ).toBe(true)
  })

  test("caller and callee responsibilities stay explicit in failure paths", () => {
    // The argument contract and the missing-path failure text moved into the
    // references the body mandates (modes.md at mode detection, document-intake.md
    // at Phase 1); the no-self-invocation and no-caller-routing rules are checked
    // across the whole always-loaded body plus those two files.
    const DOC_REVIEW_CONTRACT = DOC_REVIEW_MODES + DOC_REVIEW_INTAKE
    expect(
      /\*\*Non-interactive argument contract:\*\*/.test(DOC_REVIEW_CONTRACT),
      "ce-doc-review must present mode:non-interactive as its input contract, not as an instruction to invoke itself.",
    ).toBe(true)
    expect(
      DOC_REVIEW_CONTRACT.includes(
        "Review failed: non-interactive mode requires a document path. Expected arguments: mode:non-interactive <path>",
      ),
      "ce-doc-review's missing-path error must report the expected arguments without telling the skill to re-invoke itself.",
    ).toBe(true)
    const DOC_REVIEW_ALL = DOC_REVIEW_BODY + DOC_REVIEW_CONTRACT
    expect(
      DOC_REVIEW_ALL.includes("Re-invoke the ce-doc-review skill"),
      "ce-doc-review must not describe its own argument-validation failure as self-invocation.",
    ).toBe(false)
    expect(
      /re-invoke/i.test(DOC_REVIEW_ALL),
      "ce-doc-review validation errors must state the required correction and stop, not ambiguously tell the running workflow to re-invoke.",
    ).toBe(false)
    expect(
      /calling workflow|host(?:'s)? normal skill-invocation mechanism|`ce-doc-review` may/i.test(
        DOC_REVIEW_ALL,
      ),
      "ce-doc-review must own only its argument and execution contracts; caller-side routing belongs in ce-plan.",
    ).toBe(false)
    expect(
      DOC_REVIEW_BODY.match(/\bce-doc-review\b/g)?.length,
      "inside ce-doc-review, use direct runtime instructions instead of referring to the running skill in the third person.",
    ).toBe(1)

    const pipelineStart = HANDOFF_BODY.indexOf("**Pipeline mode:**")
    const pipelineEnd = HANDOFF_BODY.indexOf("## 5.3.9 Final Checks and Cleanup")
    const reviewPipeline = HANDOFF_BODY.slice(pipelineStart, pipelineEnd)
    expect(
      /ce-plan recorded the `skill_unreachable` envelope/i.test(reviewPipeline),
      "ce-plan must own the synthetic pre-entry envelope instead of attributing it to an invocation that never began.",
    ).toBe(true)
    expect(
      reviewPipeline.includes("invocation instead produced `skill_unreachable`"),
      "a failed-to-start invocation cannot produce a downstream result.",
    ).toBe(false)

    const menuPipeline = HANDOFF_BODY.match(
      /## 5\.4 Post-Generation Options[\s\S]*?\*\*Pipeline mode:\*\*[^\n]+/,
    )?.[0]
    expect(menuPipeline).toBeDefined()
    expect(
      /ce-doc-review (?:completed|ran)|`skill_unreachable`/.test(menuPipeline!),
      "the pipeline handoff must allow either a completed review or the explicit pre-entry state.",
    ).toBe(true)
    expect(
      menuPipeline!.includes("ce-doc-review has already run"),
      "the pipeline handoff must not claim the review ran after a skill_unreachable pre-entry state.",
    ).toBe(false)
    expect(/`?ce-plan`? (?:has )?recorded the (?:documented )?`skill_unreachable` envelope/.test(HANDOFF_BODY)).toBe(true)
    expect(
      /ce-doc-review` has run in (?:headless|non-interactive) mode or returned the documented `skill_unreachable` envelope/.test(
        SKILL_BODY,
      ),
      "a review workflow that never started cannot return ce-plan's synthetic envelope.",
    ).toBe(false)
  })

  test("Codex goal handoff is capability-based and menu-cap aware", () => {
    for (const [label, body] of [["plan-handoff.md", HANDOFF_BODY]] as const) {
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

  test("completion contract is visible before the workflow and handoff action stays owner-guarded", () => {
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
    expect(/Every normal interactive branch[\s\S]{0,160}incomplete until its owning handoff question is presented/i.test(topContract)).toBe(true)
    expect(/software implementation-plan run[\s\S]{0,160}Phase 5\.4 menu[\s\S]{0,100}selected action has actually fired/i.test(topContract)).toBe(true)
    expect(/Non-software and approach-altitude routes use their reference workflow's terminal handoff/i.test(topContract)).toBe(true)
    expect(/Answer-seeking may end after the answer unless its owner requires save\/share/i.test(topContract)).toBe(true)
    expect(/intermediate milestones/i.test(topContract)).toBe(true)
    expect(SKILL_BODY).toMatch(/Read `references\/plan-handoff\.md` immediately before Phase 5\.3\.8 and 5\.4/i)
    expect(SKILL_BODY).toMatch(/reload `references\/plan-handoff\.md` before acting/i)
    expect(SKILL_BODY).toMatch(/Rendering the menu[\s\S]{0,160}is not completion; execute the selected action/i)
    expect(HANDOFF_BODY).toContain('**Question:** "Plan ready at `<absolute path to plan>`. What would you like to do next?"')
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
    const fragment = "Start `ce-work`"
    const escaped = fragment.replace(/[.*+?^${}()|[\]\\`]/g, "\\$&")
    const fixedRegex = new RegExp(
      `^- \\*\\*[^\\n]*${escaped}[^\\n]*\\*\\*[ \\t]*(?:[—\\-]+>?|->)[ \\t]*[^\\n]+`,
      "m",
    )
    const broken = [
      "- **Start `ce-work`**",
      "- **Done for now** — End the turn.",
    ].join("\n")
    expect(
      fixedRegex.test(broken),
      "Routing regex must NOT match a bullet with no action text on its own line, even when the next bullet's `-` could be misread as the separator. If this assertion fires, the regex regressed back to consuming newlines (Codex P2 on PR #715).",
    ).toBe(false)

    // And confirm the regex still matches the legitimate same-line shape so
    // the negative case isn't masking a positive-case breakage.
    const valid = "- **Start `ce-work`** — Invoke the `ce-work` skill, passing the plan path."
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

    test("plan-handoff Create Issue routing is capability-based for Linear", () => {
      const phaseStart = HANDOFF_BODY.indexOf("## 5.4 Post-Generation Options")
      const phaseRegion = HANDOFF_BODY.slice(phaseStart)
      const createIssueRouting = phaseRegion.match(
        /^- \*\*Create Issue\*\*[^\n]+/m,
      )
      expect(
        createIssueRouting,
        "plan-handoff.md is missing the '- **Create Issue** ...' routing bullet.",
      ).not.toBeNull()
      const bullet = createIssueRouting![0]
      expect(
        /connector|MCP|API|GraphQL/i.test(bullet) && /no guaranteed `linear` CLI|not.*proof|do not treat/i.test(bullet),
        "plan-handoff.md Create Issue routing must carry the capability-based Linear guidance.",
      ).toBe(true)
    })
  })
})
