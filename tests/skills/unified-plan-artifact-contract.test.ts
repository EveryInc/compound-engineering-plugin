import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8")
}

function sliceSection(doc: string, startMarker: string, endMarker: string): string {
  const start = doc.indexOf(startMarker)
  expect(start).toBeGreaterThan(-1)
  const end = doc.indexOf(endMarker, start + startMarker.length)
  expect(end).toBeGreaterThan(start)
  return doc.slice(start, end)
}

const planSections = readRepoFile(
  "skills/ce-plan/references/plan-sections.md",
)
const brainstormSections = readRepoFile(
  "skills/ce-brainstorm/references/brainstorm-sections.md",
)
const planSkill = readRepoFile("skills/ce-plan/SKILL.md")
const brainstormSkill = readRepoFile("skills/ce-brainstorm/SKILL.md")
const brainstormHandoff = readRepoFile(
  "skills/ce-brainstorm/references/handoff.md",
)
const universalBrainstorming = readRepoFile(
  "skills/ce-brainstorm/references/universal-brainstorming.md",
)
const ceWork = readRepoFile("skills/ce-work/SKILL.md")
const ceWorkDocs = readRepoFile("docs/skills/ce-work.md")
const ceWorkEngines = readRepoFile(
  "skills/ce-work/references/execution-engines.md",
)
const crossModelExecution = readRepoFile(
  "skills/ce-work/references/cross-model-execution.md",
)
const planMarkdownRendering = readRepoFile(
  "skills/ce-plan/references/markdown-rendering.md",
)
const planHtmlRendering = readRepoFile(
  "skills/ce-plan/references/html-rendering.md",
)
const planSynthesisSummary = readRepoFile(
  "skills/ce-plan/references/synthesis-summary.md",
)
const brainstormSynthesisSummary = readRepoFile(
  "skills/ce-brainstorm/references/synthesis-summary.md",
)
const planDeepeningWorkflow = readRepoFile(
  "skills/ce-plan/references/deepening-workflow.md",
)
const lfg = readRepoFile("skills/lfg/SKILL.md")
const lfgNextWorkHandoff = readRepoFile(
  "skills/lfg/references/next-work-handoff.md",
)
const docReview = readRepoFile("skills/ce-doc-review/SKILL.md")
const docReviewTemplate = readRepoFile(
  "skills/ce-doc-review/references/subagent-template.md",
)
const codeReview = readRepoFile("skills/ce-code-review/SKILL.md")
const codeReviewFinish = readRepoFile(
  "skills/ce-code-review/references/finish-review.md",
)
const ceWorkShipping = readRepoFile(
  "skills/ce-work/references/shipping-workflow.md",
)
const docReviewSynthesis = readRepoFile(
  "skills/ce-doc-review/references/synthesis-and-presentation.md",
)
const simplifyCode = readRepoFile("skills/ce-simplify-code/SKILL.md")
const prDescriptionWriting = readRepoFile(
  "skills/ce-commit-push-pr/references/pr-description-writing.md",
)
const proof = readRepoFile("skills/ce-proof/SKILL.md")
const ideate = readRepoFile("skills/ce-ideate/references/post-ideation-workflow.md")
const agents = readRepoFile("AGENTS.md")

describe("unified plan artifact contract", () => {
  test("plan section contract defines unified metadata, readiness, and section ids", () => {
    expect(planSections).toContain("artifact_contract: ce-unified-plan/v1")
    expect(planSections).toContain("artifact_readiness")
    expect(planSections).toContain("product_contract_source")
    expect(planSections).toContain("requirements-only")
    expect(planSections).toContain("implementation-ready")
    expect(planSections).toContain("Do **not** use `artifact_readiness: approach-plan`")
    expect(planSections).not.toMatch(/^\s+- `approach-plan`/m)
    expect(planSections).toMatch(/active.*in_progress.*completed.*done/s)
    expect(planSections).toMatch(/no `status` field|no .*status.*field/i)

    for (const id of [
      "goal-capsule",
      "product-contract",
      "product-requirements",
      "planning-contract",
      "implementation-units",
      "verification-contract",
      "definition-of-done",
    ]) {
      expect(planSections).toContain(id)
    }
    // The launch prompt is skill-emitted and there is no Reader Index — neither is a doc section.
    expect(planSections).not.toContain("goal-launch-block")
    expect(planSections).not.toContain("reader-index")
  })

  test("brainstorm writes requirements-only unified plan skeletons under docs/plans", () => {
    expect(brainstormSections).toContain("<root>/plans/YYYY-MM-DD-NNN-<type>-<topic>-plan")
    expect(brainstormSections).toContain("artifact_readiness: requirements-only")
    expect(brainstormSections).toContain("product_contract_source: ce-brainstorm")
    // Requirements-only is slimmed for standalone readability: no Goal Launch
    // Block and no Reader Index (the launch prompt is skill-emitted at handoff).
    expect(brainstormSections).toMatch(/light and standalone-readable/i)
    expect(brainstormSections).toContain("Do **not** emit a `## Goal Launch Block` or `## Reader Index`")
    expect(brainstormSections).toMatch(/omits empty\s+`Planning Contract`/)

    expect(brainstormSkill).toContain("<root>/plans/YYYY-MM-DD-NNN-<type>-<topic>-plan")
    expect(brainstormSkill).toContain("artifact_readiness: requirements-only")
    expect(brainstormSkill).toContain("product_contract_source: ce-brainstorm")
    expect(brainstormSkill).toContain("Do **not** emit a Goal Launch Block or Reader Index")
    expect(brainstormSkill).toContain("new `ce-brainstorm` outputs do not write there")
    expect(brainstormSkill).toContain("non-software route does **not** write `artifact_contract: ce-unified-plan/v1`")

    expect(universalBrainstorming).toContain("outside the software unified-plan artifact contract")
    expect(universalBrainstorming).toContain("Do not write `artifact_contract: ce-unified-plan/v1`")
    expect(universalBrainstorming).toContain("let `ce-plan` choose the universal/knowledge-work artifact shape")
  })

  test("brainstorm handoff passes the unified plan path to ce-plan", () => {
    expect(brainstormHandoff).toContain("Pass the unified")
    expect(brainstormHandoff).toContain("Recommended next step: `ce-plan <plan artifact path>`")
    // Recommended path is interactive planning; the autonomous slot is lfg
    // (plan-first full ship), not a skip-planning /goal.
    expect(brainstormHandoff).toContain("Create the implementation plan")
    expect(brainstormHandoff).toContain("Ship it autonomously with `lfg`")
    expect(brainstormHandoff).toMatch(/passing the unified plan artifact path as its\s+argument/i)
    // The skip-planning /goal slot was removed in favor of plan-first lfg.
    expect(brainstormHandoff).not.toContain("skip-planning slot")
    // The lfg option must be gated on an artifact existing: a brief-alignment
    // brainstorm can skip doc creation, and lfg's pipeline ce-plan step needs the
    // artifact path (it cannot prompt) — without one there is nothing to enrich.
    expect(brainstormHandoff).toMatch(/a unified plan artifact was created/i)
    expect(brainstormHandoff).toMatch(/with no artifact.*nothing to enrich/i)
  })

  test("brainstorm self-reviews the written artifact before its handoff", () => {
    expect(brainstormSkill).toContain("Ready for Planning Check")
    for (const check of ["Complete", "Consistent", "Focused", "Usable by planning"]) {
      expect(brainstormSections).toContain(`**${check}**`)
    }
    expect(brainstormSections).toMatch(/Fix a failed check in place.*preserves settled intent/s)
    expect(brainstormSections).toContain("ask one targeted question")
    expect(brainstormSections).toMatch(/choose or change product behavior or\s+scope/)
    expect(brainstormSkill).toContain("Do not declare the artifact written or enter Phase 4 while any check fails")
  })

  test("brainstorm handoff explains that downstream work consumes the written artifact", () => {
    expect(brainstormHandoff).toContain(
      "Planning and shipping will use this artifact as the definition of what to build.",
    )
  })

  test("ce-doc-review personas map unified-* document types to their base review lens", () => {
    // Another-agent P2 (PR #972): persona prompts branch on `Document type:
    // requirements` / `plan`, but the orchestrator may pass `unified-requirements`
    // / `unified-plan` — so the persona's adaptation block silently never fires on
    // a unified artifact. The shared subagent-template must map unified-* to base.
    const subagentTemplate = readRepoFile(
      "skills/ce-doc-review/references/subagent-template.md",
    )
    expect(subagentTemplate).toMatch(/apply the `requirements` branch for `unified-requirements`/i)
    expect(subagentTemplate).toMatch(/the `plan` branch for `unified-plan`/i)
  })

  test("ce-plan enriches unified plans in place and preserves legacy inputs", () => {
    expect(planSkill).toContain("requirements-only unified plan")
    expect(planSkill).toContain("enriches that same artifact")
    expect(planSkill).toContain("this run enriches that same file in place")
    expect(planSkill).toContain("Search `docs/brainstorms/`")
    expect(planSkill).toContain("create a new unified plan in `<root>/plans/`")
    expect(planSkill).toContain("product_contract_source: ce-plan-bootstrap")
    expect(planSkill).toContain("artifact_readiness: implementation-ready")
    expect(planSkill).toContain("Definition of Done")
    // The launch prompt is generated at handoff, never written into the doc.
    expect(planSkill).toContain("Do not write a launch prompt into the doc")
  })

  test("ce-work is readiness-aware before execution", () => {
    expect(ceWork).toContain("classify `artifact_readiness` before reading the body")
    expect(ceWork).toContain("requirements-only` -> stop")
    expect(ceWork).toContain("Any other readiness value")
    expect(ceWork).toContain("Build a section map")
    expect(ceWork).toContain("Do not send \"read the whole plan\"")
    expect(ceWork).toContain("mode:return-to-caller <plan-path>")
    expect(ceWork).toContain("standalone_shipping_skipped: true")
    expect(ceWork).not.toContain("artifact_readiness: approach-plan")
  })

  test("lfg delegates implementation to ce-work return-to-caller mode", () => {
    expect(lfg).toContain("artifact_readiness: implementation-ready")
    expect(lfg).toContain("execution: code")
    expect(lfg).toContain("any unrecognized readiness value")
    expect(lfg).toContain("LFG never launches `/goal` directly")
    expect(lfg).toContain("mode:return-to-caller <plan-path-from-step-1>")
    expect(lfg).toContain("standalone_shipping_skipped: true")
    expect(lfg).toContain("verification_evidence")
    expect(lfg).toContain("Do NOT decide the test strategy inside LFG")
    expect(lfg).toContain("invoke `ce-work` one more time in recovery mode")
    expect(lfg).toContain("implementation_run:<safe-id>")
    expect(lfg).toContain("When `actual_route` is `native` and `run_id` is `null`")
    expect(lfg).toContain("repeat the original ce-work invocation once without an `implementation_run:` carrier")
    expect(lfg).toContain("A non-native return without a safe run id remains blocked")
    expect(lfg).toContain("stop as blocked and report the missing fields")
    expect(lfg).toContain("ce-code-review` skill with `mode:agent plan:<plan-path-from-step-1>`")
    expect(lfg).not.toContain("artifact_readiness: approach-plan")
  })

  test("lfg offers an opt-in fresh-session handoff for separately planned future work", () => {
    expect(lfg).toContain("semantic role `work-relationships`")
    expect(lfg).toContain("cautious legacy semantic fallback")
    expect(lfg).toContain("references/next-work-handoff.md")
    expect(lfg).toMatch(/older unmarked Product Contract.*area this plan owns.*future separately planned areas/s)
    expect(lfg).toContain("Do not match an exact visible heading")
    expect(lfg).toMatch(/do not .*invoke `ce-handoff` before the user explicitly accepts/i)

    expect(lfgNextWorkHandoff).toContain("<!-- ce-section: work-relationships -->")
    expect(lfgNextWorkHandoff).toContain('data-ce-section="work-relationships"')
    expect(lfgNextWorkHandoff).toContain("The visible heading is not part of this protocol")
    expect(lfgNextWorkHandoff).toMatch(/larger body of separately planned work/i)
    expect(lfgNextWorkHandoff).toMatch(/already planned, completed, absorbed/i)
    expect(lfgNextWorkHandoff).toMatch(/Do not choose by document\s+order/)
    expect(lfgNextWorkHandoff).toContain("One justified winner")
    expect(lfgNextWorkHandoff).toContain("Real tie")
    expect(lfgNextWorkHandoff).toContain("No ready candidate")
    expect(lfgNextWorkHandoff).toContain("Only after explicit acceptance")
    expect(lfgNextWorkHandoff).toContain("LFG owns the recommendation")

    for (const field of [
      "Next-session objective",
      "Recommended area",
      "Why next",
      "Authoritative prior plan",
      "Relationship to completed work",
      "Actual delivery state",
      "Carry-forward decisions",
      "Assumptions to revalidate",
      "Other candidates not selected",
      "Artifact boundary",
    ]) {
      expect(lfgNextWorkHandoff).toContain(`**${field}:**`)
    }
    expect(lfgNextWorkHandoff).toMatch(/separate requirements-only unified plan/i)
    expect(lfgNextWorkHandoff).toMatch(/do not extend or edit the prior plan/i)
  })

  test("lfg carries per-stage routing carriers at each stage seam", () => {
    const carrier = sliceSection(
      lfg,
      "## Per-stage routing carriers",
      "1. Invoke the `ce-plan` skill",
    )
    expect(carrier).toContain("semantic intent")
    expect(carrier).toContain("not keyword or prompt-token matching")
    expect(carrier).toContain("plain mention")
    expect(carrier).toContain('"use Codex for implementation"')
    expect(carrier).toContain('"only use Composer for implementation"')
    expect(carrier).toContain("implementation_engine")
    for (const field of ["mode", "target", "model", "source"]) {
      expect(carrier).toContain(`\`${field}\``)
    }
    expect(carrier).toContain("exactly these four fields")
    expect(carrier).toContain("Never pass")
    expect(carrier).toContain("`ce-plan`")
    expect(carrier).toContain("planning or review")

    // Per-stage routing: planning routes to a plan_model carrier; an unscoped
    // directive binds to implementation only and never broadens; the upfront
    // disambiguation question is interactive-gated and headless runs never ask.
    expect(carrier).toContain("plan_model:<alias>")
    expect(carrier).toContain("Planning** routes to `ce-plan`")
    expect(carrier).toContain("Scoped directive")
    expect(carrier).toContain("Unscoped directive")
    expect(carrier).toContain("implementation stage only")
    expect(carrier).toContain("never broaden an unscoped directive")
    expect(carrier).toMatch(/ask exactly \*\*one\*\* upfront question/i)
    expect(carrier).toMatch(/disable-model-invocation.*headless run, never ask/is)
    expect(carrier).toContain("default path is mandatory")

    // Step 1 threads the plan_model carrier to ce-plan beside the sanitized request.
    const step1 = sliceSection(
      lfg,
      "1. Invoke the `ce-plan` skill",
      "2. Invoke the `ce-work` skill",
    )
    expect(step1).toContain("prefix the invocation with its `plan_model:<alias>` carrier")
    expect(step1).toMatch(/never woven into it/i)

    const step2 = sliceSection(
      lfg,
      "2. Invoke the `ce-work` skill",
      "3. Invoke the `ce-simplify-code` skill",
    )
    expect(step2).toContain("mode:return-to-caller implementation_engine:<compact-json> <plan-path-from-step-1>")
    expect(step2).toContain("mode:return-to-caller implementation_engine:<compact-json> implementation_run:<safe-id> <plan-path-from-step-1>")
    expect(step2).toContain('implementation_engine:{"mode":"prefer","target":"codex","model":null,"source":"lfg-current-turn"}')
    expect(step2).toContain("portable string envelope")
    expect(step2).toContain("standing per-checkout configuration")
    expect(carrier).toContain("Do not construct a carrier from standing configuration")
    expect(step2).toContain("same `implementation_engine:<compact-json>` carrier")
    expect(step2).toContain("same `run_id`")
  })

  test("lfg's route-aware return gate preserves its shipping tail", () => {
    const step2 = sliceSection(
      lfg,
      "2. Invoke the `ce-work` skill",
      "3. Invoke the `ce-simplify-code` skill",
    )
    for (const field of [
      "implementation_engine_binding",
      "requested_route",
      "actual_route",
      "requested_model",
      "actual_model",
      "fallback_reason",
      "run_id",
      "unit_receipts",
      "plan_checkpoint",
      "blockers",
      "recovery_path",
    ]) {
      expect(step2).toContain(`\`${field}\``)
    }
    expect(step2).toContain("`prefer`")
    expect(step2).toContain("continue to step 3 exactly once")
    expect(step2).toContain("prominently disclosing its requested-versus-actual route/model")
    expect(step2).toContain("`require`")
    expect(step2).toContain("must not prompt")
    expect(step2).toContain("stop the pipeline")
  })

  test("review and publishing skills understand unified artifacts", () => {
    expect(docReview).toContain("unified-requirements")
    expect(docReview).toContain("unified-plan")
    expect(docReview).toContain("Product Contract only")
    expect(docReview).toContain("HTML unified artifacts")
    expect(docReview).toContain("section slice")
    expect(docReview).toContain("product_contract_source: ce-brainstorm")
    expect(docReview).toContain("product_contract_source:<value>")
    expect(docReviewTemplate).toContain("product_contract_source:ce-brainstorm")
    expect(docReviewTemplate).toContain("product_contract_source:ce-plan-bootstrap")

    expect(codeReview).toContain("<root>/plans/*.{md,html}")
    expect(codeReview).toContain("Product Contract` -> `### Requirements")
    expect(codeReview).toContain("readiness before checking completeness")
    expect(codeReview).toContain("must not trigger implementation-unit completeness findings")

    expect(proof).toContain("Only publish markdown")
    expect(proof).toContain("requirements-only")
  })

  test("docs and adjacent handoffs use the new convention", () => {
    expect(ideate).toContain("requirements-only unified plan under `<root>/plans/`")
    expect(agents).toContain("New `ce-brainstorm` outputs are requirements-only unified plans")
    expect(agents).toContain("Historical `docs/brainstorms/*-requirements.*` files remain readable legacy inputs")
  })

  test("launch prompt is skill-emitted at handoff, not a baked doc section", () => {
    const planHandoff = readRepoFile("skills/ce-plan/references/plan-handoff.md")
    // No Goal Launch Block in the artifact contract (anchor or section bullet).
    expect(planSections).not.toContain("goal-launch-block")
    expect(planSections).not.toContain("**Goal Launch Block**")
    // The prompt is generated by the handoff from the plan's current content,
    // thin, pointing to the plan's sections rather than copying them.
    expect(planHandoff).toMatch(/generated here at handoff, never written into the doc/i)
    expect(planHandoff).toMatch(/do \*\*not\*\* copy the plan's resolved decisions/i)
  })

  test("consuming skills carry a size-aware heading-scan algorithm, not full-doc-first", () => {
    // The reader strategy lives in the skills, not in an in-doc Reader Index.
    // plan-sections prescribes heading/anchor wayfinding for markdown AND HTML.
    expect(planSections).toMatch(/consuming skills own the reading\s+algorithm/i)
    expect(planSections).toMatch(/scan headings/i)
    expect(planSections).toMatch(/scan the heading elements/i) // explicit HTML wayfinding
    expect(planSections).toMatch(/do \*\*not\*\* load the entire artifact/i)
    // Size-aware: a short plan can be read in full.
    expect(planSections).toMatch(/can just be read in full/i)
    // ce-work carries the same discipline, markdown + HTML, size-aware.
    expect(ceWork).toContain("do **not** read the whole document first")
    expect(ceWork).toMatch(/can be read in full/i)
    expect(ceWork).toMatch(/in \*\*HTML\*\* scan the/i)
  })

  test("Verification Contract requires repo-specific commands, not generic run tests", () => {
    expect(planSections).toContain("Repo-specific test commands and quality gates")
    expect(planSections).toMatch(/repo-specific commands and quality gates/i)
    expect(planSections).toMatch(/Avoid generic "run tests"/i)
    expect(planMarkdownRendering).toMatch(/concrete repo commands such as `bun test` rather than generic "run tests"/i)
  })

  test("contract guides measurable exit thresholds and dead-code cleanup for long goal runs", () => {
    // Reinforced by Kundel's /goal guide: optimization-shaped goals need a
    // measurable exit threshold, and long autonomous runs must remove
    // abandoned-attempt code before declaring done.
    expect(planSections).toMatch(/optimization-shaped/i)
    expect(planSections).toMatch(/measurable threshold|metric target/i)
    expect(planSections).toContain("ce-optimize")
    expect(planSections).toMatch(/abandoned-attempt code is removed|dead-end and experimental code/i)
    expect(ceWorkEngines).toMatch(/dead-end or experimental code .* has been removed|experimental code from approaches that did not pan out/i)
  })

  test("conversion/pipeline override keeps one canonical discovery target", () => {
    // Same-basename .md/.html siblings must not become competing latest plans.
    expect(planSkill).toContain("new canonical path")
    expect(planSkill).toMatch(/report old path and new canonical path/i)
    expect(planSkill).toContain("the local plan file stays canonical")
  })

  test("ce-work Phase 0 parses the return-to-caller mode token before triage", () => {
    // Codex #972 P1: lfg passes `mode:return-to-caller <plan-path>`; ce-work
    // must strip the mode token, not treat the whole string as a bare prompt.
    expect(ceWork).toMatch(/begins with `mode:return-to-caller`/i)
    // legacy alias still recognized so an old reference doesn't break.
    expect(ceWork).toMatch(/legacy aliases `mode:caller-owned-tail`/i)
    expect(ceWork).toMatch(/strip that token/i)
    expect(ceWork).toMatch(/one compact JSON object prefixed exactly `implementation_engine:`/i)
    expect(ceWork).toContain("after any mode token is stripped")
  })

  test("ce-work surfaces its caller-owned mode in discovery metadata and public docs", () => {
    expect(ceWork).toMatch(/description:.*outer orchestrators pass `mode:return-to-caller \[implementation_engine:<compact-json>\] \[implementation_run:<safe-id>\] <plan path>`/i)
    expect(ceWork).toMatch(/argument-hint:.*mode:return-to-caller \[implementation_engine:<compact-json>\] \[implementation_run:<safe-id>\] <plan path> for outer orchestrators/i)
    expect(ceWorkDocs).toContain("## Use Beneath an Outer Orchestrator")
    expect(ceWorkDocs).toContain("standalone_shipping_skipped: true")
    expect(ceWorkDocs).toMatch(/does not run the standalone shipping tail/i)
    // Do not claim return-to-caller skips all simplification — Phase 2 Simplify as You Go still runs.
    expect(ceWorkDocs).toMatch(/Mid-implementation "Simplify as You Go" still runs/i)
    expect(ceWorkDocs).toMatch(/skips the standalone shipping tail \(final simplify, review, PR, CI\)/i)
  })

  test("ce-code-review discovery/extraction covers HTML and Product Contract requirements", () => {
    // Codex #972 P2: discovery must scan .html and extraction must read
    // Product Contract > Requirements, matching the completeness contract.
    expect(codeReview).toContain("<root>/plans/*.{md,html}")
    expect(codeReview).toMatch(/unified `Product Contract` -> `### Requirements`/)
    expect(codeReview).toMatch(/requirements-only artifact[\s\S]{0,80}product intent only/i)
  })

  test("ce-plan 5.1.5 synthesis gate fires for unified-plan sources, not only legacy docs", () => {
    // Codex #972 P2: new ce-brainstorm -> ce-plan <unified-plan> enrichment
    // must still get the plan-time scoping-synthesis checkpoint.
    expect(planSkill).toMatch(/whenever Phase 0\.2 resolved an upstream Product Contract source/i)
    expect(planSkill).toMatch(/enrichment flow is brainstorm-sourced and MUST fire this gate/i)
    expect(planSkill).toMatch(/Skip Phase 0\.7 only in solo invocation|Skip Phase 5\.1\.5 only in solo invocation/i)
  })

  test("evaluator-complete launch prompt lives in the engine template, not the doc", () => {
    // The goal prompt is also the completion criteria, so it must be
    // self-contained — but it lives in the emitted template (ce-work's
    // execution-engines.md), not as a baked plan-sections doc section.
    expect(ceWorkEngines).toMatch(/Done when the transcript shows/i)
    // The standalone /goal prompt is plan-agnostic and hardcodes no PR directive;
    // instead it carries the PR-precedence line (plan strategy, repo/user override).
    // (Structural no-PR lives only in return-to-caller mode, asserted separately below.)
    expect(ceWorkEngines).toMatch(/plan-agnostic/i)
    expect(ceWorkEngines).toMatch(/don't hardcode an open-a-PR/i)
    expect(ceWorkEngines).toMatch(/Follow the plan's PR\/landing strategy if it defines one/i)
    // plan-sections no longer prescribes a launch-prompt/Goal Launch Block section.
    expect(planSections).not.toMatch(/evaluator-complete/i)
    expect(planSections).not.toContain("Human standalone launch")
  })

  test("implementation-ready requires zero launch-blocking open questions", () => {
    expect(planSections).toMatch(/no\s+launch-blocking open question remains/i)
    expect(planSections).toMatch(/stays\s+`requirements-only`/i)
    expect(planSections).toMatch(/blocker resolution \/\s*planning/i)
  })

  test("a requirements-only path is an enrichment input, not a Phase 0.1 resume target", () => {
    // Codex P1 (PR #972): lfg hands ce-plan a requirements-only docs/plans/ path
    // in disable-model-invocation pipeline mode; Phase 0.1's "confirm update-or-
    // create" fires on any referenced docs/plans/ file BEFORE Phase 0.2's
    // enrich-in-place rule, with no user to answer -> the hands-off flow strands.
    // Phase 0.1 must carve requirements-only plans out of the resume prompt and
    // auto-resolve the resume choice in pipeline mode.
    const phaseStart = planSkill.indexOf("#### 0.1 Resume Existing Plan Work")
    expect(phaseStart).toBeGreaterThan(-1)
    const resumeRegion = planSkill.slice(phaseStart, phaseStart + 1600)
    expect(/requirements-only unified plan is not a resume target/i.test(resumeRegion)).toBe(true)
    expect(/do \*?\*?not\*?\*? fire the update-or-create confirm/i.test(resumeRegion)).toBe(true)
    expect(/Fall through to Phase 0\.2/i.test(resumeRegion)).toBe(true)
    expect(/pipeline mode the resume choice is made automatically|never prompted/i.test(resumeRegion)).toBe(true)
  })

  test("format conversion: a requirements-only artifact with an implementation-ready sibling is superseded", () => {
    // Codex P2 (PR #972): a format conversion writes a new canonical .md and
    // leaves the old .html with stale requirements-only metadata. Both discovery
    // sites glob .md AND .html, so they could rediscover the stale sibling and
    // re-enrich (ce-plan) or stop (ce-work) even though the sibling is ready.
    // Both must skip a requirements-only artifact that has an implementation-ready
    // same-basename sibling.
    expect(planSkill).toMatch(/Skip a superseded sibling/i)
    expect(planSkill).toMatch(/same-basename.*other format|<basename>\.md.*<basename>\.html/i)
    expect(ceWork).toMatch(/Superseded sibling/i)
    expect(ceWork).toMatch(/select the implementation-ready sibling and execute it rather than stopping/i)
  })

  test("large plans get a navigation-only Unit Index, gated to ~10+ units", () => {
    expect(planSections).toMatch(/Unit Index \(large plans only/i)
    expect(planSections).toMatch(/ten or more\s+units/i)
    // navigation-only, not a content restatement (avoids the Reader-Index anti-pattern)
    expect(planSections).toMatch(/navigation aid only/i)
    expect(planSections).toMatch(/unit bodies\s+stay authoritative/i)
    expect(planSections).toMatch(/files touched/i)
    // gated: omitted on small plans so it isn't ceremony
    expect(planSections).toMatch(/Omit it below ~?10 units/i)
  })

  test("ce-plan records a Product Contract preservation note on in-place enrichment", () => {
    expect(planSkill).toContain("Product Contract preservation")
    expect(planSkill).toMatch(/Product Contract unchanged|changed: .*R-IDs/)
  })

  test("execution engines define a Codex lane, progress-visibility, and compaction recovery", () => {
    // Codex #972-review P1 #3 / P2 #9 / P2 #10
    expect(ceWorkEngines).toContain("Codex specifically")
    // Codex exposes a callable goal tool; the skill starts it and does NOT call update_goal.
    expect(ceWorkEngines).toContain("create_goal")
    expect(ceWorkEngines).toMatch(/skill does NOT call `update_goal`/i)
    expect(ceWorkEngines).toMatch(/start goal-mode directly, with no copy-paste/i)
    // Claude Code has no goal tools → copy-paste only.
    expect(ceWorkEngines).toMatch(/Claude Code exposes no goal tools/i)
    expect(ceWorkEngines).toContain("Progress visibility (independent of tail ownership)")
    expect(ceWorkEngines).toMatch(/must not open any PR/i)
    expect(ceWorkEngines).toMatch(/draft\*?\*? PR only/i)
    expect(ceWorkEngines).toMatch(/re-open the plan and re-check/i)
    expect(ceWorkEngines).toMatch(/compacted to a summary/i)
  })

  test("post-plan menu offers /goal prompt as a mutually-exclusive executor", () => {
    const planHandoff = readRepoFile("skills/ce-plan/references/plan-handoff.md")
    for (const doc of [planSkill, planHandoff]) {
      expect(doc).toContain("Run it as a `/goal`")
      // The /goal option must not also run ce-work (tail-ownership guard).
      expect(doc).toMatch(/`ce-work` does \*{0,2}not\*{0,2} also run/i)
      // On a callable-goal-tool host the skill starts it directly and never calls update_goal.
      expect(doc).toContain("create_goal")
      expect(doc).toMatch(/do not call `update_goal`|the goal session marks its own completion/i)
    }
    // No authoring-file meta-references leak into runtime menu content.
    expect(planHandoff).not.toContain("Per the AGENTS.md")
    expect(planSkill).not.toContain("per the AGENTS.md narrow exception")
  })

  test("ce-work defines the execution-engine selection lane", () => {
    expect(ceWork).toContain("Choose Execution Engine")
    expect(ceWork).toContain("references/execution-engines.md")
    expect(ceWork).toContain("dynamic-workflow")
    expect(ceWork).toMatch(/prompt-emission only|never invoked from inside this skill/i)

    expect(ceWorkEngines).toContain("Probe host capability")
    expect(ceWorkEngines).toContain("/goal Implement <plan-path>")
    expect(ceWorkEngines).toContain("ultracode:")
    expect(ceWorkEngines).toMatch(/Resume the correct tail/i)
    expect(ceWorkEngines).toContain("standalone_shipping_skipped: true")
    // No-PR is now structural (return-to-caller only); standalone defers to repo/user conventions.
    expect(ceWorkEngines).toMatch(/must not open any PR/i)
  })
})

describe("session-settled decision contract", () => {
  test("plan-sections defines the session-settled annotation stem, closed two-class enum, and strip sanction", () => {
    const annotation = sliceSection(
      planSections,
      "**Session-settled annotations on KTDs.**",
      "**Group Requirements by concern",
    )
    expect(annotation).toContain("session-settled:")
    expect(annotation).toContain("Exactly two classes:")
    expect(annotation).toContain("`user-directed`")
    expect(annotation).toContain("`user-approved`")
    expect(annotation).toContain("review passes must not strip it")
    // Enum closure: the contract admits no third provenance class.
    expect(annotation).not.toContain("evidence-settled")
    expect(annotation).not.toContain("agent-settled")
  })

  test("ce-plan loads settled-decisions.md, keeps the stem live in Phase 2, and emits the pipeline blocked token", () => {
    expect(planSkill).toContain("Read `references/settled-decisions.md`")
    const phase2 = sliceSection(
      planSkill,
      "### Phase 2: Resolve Planning Questions",
      "### Phase 3:",
    )
    expect(phase2).toContain("session-settled:")
    expect(planSkill).toContain("settled-decision-invalidated")
  })

  test("ce-brainstorm loads settled-decisions.md and annotates Key Decisions with the stem", () => {
    expect(brainstormSkill).toContain("Read `references/settled-decisions.md`")
    expect(brainstormSkill).toContain(
      "Key Decisions section carrying their `session-settled:` annotation",
    )
  })

  test("lfg brief carries the four required fields, recognizes the blocked token, and retries the brief verbatim", () => {
    const step1 = sliceSection(
      lfg,
      "1. Invoke the `ce-plan` skill",
      "2. Invoke the `ce-work` skill",
    )
    for (const field of [
      "the decision",
      "provenance class",
      "rejected alternative",
      "one-line reason",
    ]) {
      expect(step1).toContain(field)
    }
    expect(step1).toContain("`user-directed`")
    expect(step1).toContain("settled-decision-invalidated")
    expect(step1).toContain("reuses the composed brief verbatim")
  })

  test("lfg threads settled_conflict findings through both step 4 and step 6", () => {
    const step4 = sliceSection(
      lfg,
      "4. Invoke the `ce-code-review` skill",
      "5. **Apply and persist review fixes**",
    )
    expect(step4).toContain("`settled_conflict`")
    const step6 = sliceSection(
      lfg,
      "6. **Autonomous residual handoff**",
      "7. Invoke the `ce-test-browser` skill",
    )
    expect(step6).toContain("`settled_conflict`")
  })

  test("ce-work envelope reports settled conflicts; shipping tail treats invalidation as a blocker", () => {
    const returnToCaller = sliceSection(ceWork, "## Return-to-Caller Mode", "## Key Principles")
    expect(returnToCaller).toContain("`settled_decision_conflicts`")
    expect(ceWorkShipping).toContain("never auto-accepted as a residual")
  })

  test("ce-code-review routes settlement conflicts advisory+human, never demotes defects, and keeps stamps report-only in 5c", () => {
    const stage5 = sliceSection(
      codeReviewFinish,
      "### Stage 5: Merge findings",
      "### Stage 5b",
    )
    expect(stage5).toContain("stamp `settled_conflict`")
    expect(stage5).toContain("route it advisory/human")
    // Negative boundary: defects inside a settled approach are not demoted.
    expect(stage5).toContain("Do not demote a real defect")
    const stage5c = sliceSection(
      codeReviewFinish,
      "### Stage 5c: Act on findings",
      "### Stage 6",
    )
    expect(stage5c).toContain("`settled_conflict`-stamped")
    expect(stage5c).toContain("stay report-only")
  })

  test("PR description Step C carries the session-settled provenance element", () => {
    const stepC = sliceSection(
      prDescriptionWriting,
      "## Step C: Assemble the body",
      "## Step D",
    )
    expect(stepC).toContain("**Session-settled provenance:**")
    expect(stepC).toContain("session-settled:")
  })

  test("ce-doc-review threads settled KTDs through the {settled_ktds} slot and protects the annotation", () => {
    expect(docReview).toContain("| `{settled_ktds}` |")
    expect(docReviewTemplate).toContain("Settled decisions: {settled_ktds}")
    expect(docReviewSynthesis).toContain(
      "must never remove or reword a `session-settled:` annotation",
    )
  })

  test("ce-simplify-code honors session-settled structure pins", () => {
    expect(simplifyCode).toContain("structure-pin constraint")
    expect(simplifyCode).toContain("session-settled:")
  })

  test("rendering, synthesis, and deepening references carry the settled-decision contract", () => {
    expect(brainstormSections).toContain("session-settled:")
    expect(planMarkdownRendering).toContain("session-settled:")
    expect(planHtmlRendering).toContain("session-settled:")
    expect(planSynthesisSummary).toContain("Carrying forward:")
    expect(brainstormSynthesisSummary).toContain("Carrying forward:")
    expect(planDeepeningWorkflow).toContain(
      "never removes the annotation or inverts the decision",
    )
  })
})

describe("cross-layer ownership contract", () => {
  test("both section contracts carry the one-owner rule and the duplication named-test clause", () => {
    for (const doc of [planSections, brainstormSections]) {
      expect(doc).toMatch(/One owner per rule; cite, don't restate\./)
      expect(doc).toMatch(/Unlinked sibling\s+restatement/)
      expect(doc).toMatch(/Bind external authorities; don't summarize them\./)
      expect(doc).toMatch(/a rule stated in full\s+in more than one section/)
    }
  })

  test("plan-sections registers KTD-IDs with the R/U grammar and typed authority order", () => {
    expect(planSections).toContain("KTD-IDs (Key Technical Decisions")
    expect(planSections).toContain("`KTD1.`")
    expect(planSections).toContain("KTD-IDs on implementation-ready plans")
    expect(planSections).toContain("no mass renumbering")
    // Typed authority: R wins product behavior; KTD wins mechanism; units override neither.
    expect(planSections).toMatch(/R wins on product\s+behavior/)
    expect(planSections).toMatch(/KTD wins on implementation mechanism/)
    expect(planSections).toMatch(/a unit overrides neither/)
    // No mirror KTDs.
    expect(planSections).toMatch(/Do \*\*not\*\* create a KTD that merely mirrors/)
    expect(planMarkdownRendering).toContain("`KTD<N>.` plain prefix")
  })

  test("brainstorm Key Decisions are a provenance index with Governs links, not a second statement", () => {
    expect(brainstormSections).toMatch(/provenance index entry/)
    expect(brainstormSections).toContain("`Governs R5, R7`")
    expect(brainstormSections).toMatch(
      /must not create a KTD that merely mirrors\s+the\s+product decision/,
    )
    expect(brainstormSections).not.toContain(
      "inherits these labels into plan KTDs",
    )
  })

  test("synthesis routes settled product decisions and planning decisions to their distinct owners", () => {
    expect(planSynthesisSummary).toMatch(
      /settled product decisions.*labeled Product Contract Key Decisions.*exact `Governs R…` links/s,
    )
    expect(planSynthesisSummary).toMatch(
      /settled planning(?:\/how)? decisions.*labeled Key Technical Decisions/s,
    )
  })

  test("ce-plan preservation protects meaning + IDs and sanctions restructuring with its own note class", () => {
    expect(planSkill).toContain("Meaning-preserving restructuring is sanctioned")
    expect(planSkill).toContain("restructured, no scope change")
    expect(planSkill).toContain(
      "Preserve Product Contract meaning and stable IDs under Phase 0.3 step 3",
    )
    expect(planSkill).not.toContain("Preserve Product Contract IDs and content")
    expect(planSkill).toContain(
      "re-point every affected `Governs R…`, `Covers R…`, and inline `per R…` citation",
    )
    expect(planSkill).toContain(
      "no pre-restructure catch-all link silently excludes a split-out requirement",
    )
    expect(planSkill).toContain("do **not** mirror it into a KTD")
    // Unit Approach owns only unit-local content.
    expect(planSkill).toContain("Unit-local content only")
    // Settlement channel: KTD<N> for planning decisions, governed Rs for product decisions.
    expect(planSkill).toContain("reverse-resolved through its `Governs R…` links")
  })

  test("ce-work packets reverse-resolve Product Key Decisions so settlement labels survive bounded reads", () => {
    expect(ceWork).toContain("`Governs R…` links name the unit's cited R-IDs")
    expect(ceWork).toContain("A KTD or Product Contract Key Decision carrying")
  })

  test("every executor handoff reverse-resolves labeled Product Contract Key Decisions", () => {
    const planHandoff = readRepoFile("skills/ce-plan/references/plan-handoff.md")
    const handoffs = [
      sliceSection(
        planSkill,
        "- **Run it as a `/goal`**",
        "- **Decide on the review's open items**",
      ),
      sliceSection(
        planHandoff,
        "- **Run it as a `/goal`**",
        "- **Decide on the review's open items**",
      ),
      sliceSection(
        ceWorkEngines,
        "Copyable goal-mode prompt",
        "Copyable dynamic-workflow prompt",
      ),
      sliceSection(
        crossModelExecution,
        "3. **Prepare one bounded unit packet.**",
        "4. **Start one fixed author.**",
      ),
    ]

    for (const handoff of handoffs) {
      expect(handoff).toMatch(
        /Product Contract Key Decision.*exact `Governs R…` links.*cited R-IDs/s,
      )
    }
  })

  test("deepening strengthens at the owning entry and never restates owned rules into siblings", () => {
    expect(planDeepeningWorkflow).toContain("Strengthen at the owning entry.")
    expect(planDeepeningWorkflow).toContain(
      "Restate a rule a cited R or KTD already owns into a sibling section",
    )
  })
})
