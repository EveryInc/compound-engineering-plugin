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
const brainstormPhase0 = readRepoFile("skills/ce-brainstorm/references/phase-0.md")
const brainstormPlanWrite = readRepoFile("skills/ce-brainstorm/references/plan-write.md")
const brainstormHandoff = readRepoFile(
  "skills/ce-brainstorm/references/handoff.md",
)
const universalBrainstorming = readRepoFile(
  "skills/ce-brainstorm/references/universal-brainstorming.md",
)
const ceWork = readRepoFile("skills/ce-work/SKILL.md")
// Plan-reading strategy and worker packaging are loaded from the references the body
// mandates at Phase 1; the plan-artifact invariants they carry are asserted over the
// whole ce-work unit rather than the always-loaded window.
const ceWorkIntake = readRepoFile("skills/ce-work/references/work-intake.md")
const ceWorkStrategy = readRepoFile("skills/ce-work/references/execution-strategy.md")
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
// Reviewer payload construction (slices, provenance, settled decisions) moved into
// the dispatch reference the body mandates before Phase 2 dispatch.
const docReviewDispatch = readRepoFile("skills/ce-doc-review/references/dispatch.md")
// Document classification signals moved into the Phase 1 intake reference.
const docReviewIntake = readRepoFile("skills/ce-doc-review/references/document-intake.md")
const codeReview = readRepoFile("skills/ce-code-review/SKILL.md")
// Plan discovery, readiness classification, and requirement extraction moved into the
// reference the body's spine mandates before reviewer selection.
const codeReviewIntent = readRepoFile(
  "skills/ce-code-review/references/intent-and-plan.md",
)
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
    expect(brainstormSections).toContain("<root>/plans/YYYY-MM-DD-HHMM-<type>-<topic>-plan")
    expect(brainstormSections).toContain("no daily sequence number")
    expect(brainstormSections).toContain("artifact_readiness: requirements-only")
    expect(brainstormSections).toContain("product_contract_source: ce-brainstorm")
    // Requirements-only is slimmed for standalone readability: no Goal Launch
    // Block and no Reader Index (the launch prompt is skill-emitted at handoff).
    expect(brainstormSections).toMatch(/light and standalone-readable/i)
    expect(brainstormSections).toContain("Do **not** emit a `## Goal Launch Block` or `## Reader Index`")
    expect(brainstormSections).toMatch(/omits empty\s+`Planning Contract`/)

    expect(brainstormSkill).toContain("<root>/plans/YYYY-MM-DD-HHMM-<type>-<topic>-plan")
    expect(brainstormSkill).toContain("local wall-clock time at write")
    expect(brainstormSkill).toContain("artifact_readiness: requirements-only")
    expect(brainstormSkill).toContain("product_contract_source: ce-brainstorm")
    expect(brainstormSkill).toContain("Do **not** emit a Goal Launch Block or Reader Index")
    // 2026-08-18: the legacy-path rule (Phase 0.1) and the non-software carve-out
    // (Phase 0.1b) moved into references/phase-0.md with the rest of Phase 0 when
    // the body was restructured under the Codex 8000-byte prompt budget. Both are
    // artifact-content invariants, so they are asserted against the file that owns
    // them; the frontmatter fields and the path shape above stay pinned to the body
    // because they are the cross-skill contract ce-plan enriches.
    expect(brainstormPhase0).toContain("new `ce-brainstorm` outputs do not write there")
    expect(brainstormPhase0).toContain("non-software route does **not** write `artifact_contract: ce-unified-plan/v1`")

    expect(universalBrainstorming).toContain("outside the software unified-plan artifact contract")
    expect(universalBrainstorming).toContain("Do not write `artifact_contract: ce-unified-plan/v1`")
    expect(universalBrainstorming).toContain("let `ce-plan` choose the universal/knowledge-work artifact shape")
  })

  test("plan filenames use a local wall-clock time instead of daily sequences", () => {
    expect(planSkill).toContain("<root>/plans/YYYY-MM-DD-HHMM-<type>-<descriptive-name>-plan.md")
    expect(planSkill).toContain("do not scan for or allocate a daily sequence number")
    expect(planSkill).toContain("local wall-clock time at write")
    expect(planSkill).toContain("Reserve the candidate path atomically")
    expect(planSkill).toContain("preserve the existing artifact basename")
    expect(planSkill).not.toContain("YYYY-MM-DD-NNN")
    // The hyphenated prefix keeps new artifacts sorting interleaved with legacy
    // `YYYY-MM-DD-NNN` files; a hyphen-free prefix sorts them into a separate block.
    expect(planSkill).not.toContain("YYYYMMDDTHHMMSSZ")
  })

  test("brainstorm handoff passes the unified plan path to ce-plan", () => {
    expect(brainstormHandoff).toContain("Pass the unified")
    expect(brainstormHandoff).toContain("exact plan artifact path returned by the write step")
    expect(brainstormHandoff).toContain("including any collision suffix")
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
    expect(ceWorkIntake).toContain("Build a section map")
    expect(ceWorkStrategy).toContain("Do not send \"read the whole plan\"")
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
    expect(docReviewDispatch).toContain("section slice")
    expect(docReviewIntake).toContain("product_contract_source: ce-brainstorm")
    expect(docReviewDispatch).toContain("product_contract_source:<value>")
    expect(docReviewTemplate).toContain("product_contract_source:ce-brainstorm")
    expect(docReviewTemplate).toContain("product_contract_source:ce-plan-bootstrap")

    expect(codeReviewIntent).toContain("<root>/plans/*.{md,html}")
    expect(codeReviewIntent).toContain("Product Contract` -> `### Requirements")
    expect(codeReviewIntent).toContain("readiness before checking completeness")
    expect(codeReviewIntent).toContain("must not trigger implementation-unit completeness findings")

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
    expect(ceWorkIntake).toContain("do **not** read the whole document first")
    expect(ceWorkIntake).toMatch(/can be read in full/i)
    expect(ceWorkIntake).toMatch(/in \*\*HTML\*\* scan the/i)
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
    expect(codeReviewIntent).toContain("<root>/plans/*.{md,html}")
    expect(codeReviewIntent).toMatch(/unified `Product Contract` -> `### Requirements`/)
    expect(codeReviewIntent).toMatch(/requirements-only artifact[\s\S]{0,80}product intent only/i)
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
    expect(ceWorkEngines).toMatch(/prompt-emission only|never invoked from inside this skill/i)

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
    // The Phase 3 rendering rule moved into references/plan-write.md with the rest
    // of Phase 3; the body still carries the load instruction above.
    expect(brainstormPlanWrite).toContain(
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
    expect(docReviewDispatch).toContain("| `{settled_ktds}` |")
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
    expect(ceWorkStrategy).toContain("`Governs R…` links name the unit's cited R-IDs")
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

describe("Product Contract section catalog and routing destinations", () => {
  // ce-plan's include-when-material catalog specified only implementation-facing
  // sections; its product-shape sections had no firing/skip rule at all. Measured
  // 2026-08-12 across 34 pre-existing unified plans: Success Criteria appeared in
  // 8, Key Decisions in 19. These pins keep the rule present in each of the five
  // routing statements plus the catalog, since a fix in one leaves the others as
  // stale sources of truth.

  function entryBlock(doc: string, name: string): string {
    const marker = `- **${name}** —`
    const start = doc.indexOf(marker)
    expect(start, `plan-sections.md must carry a '${name}' catalog entry.`).toBeGreaterThan(-1)
    const end = doc.indexOf("\n\n- **", start)
    return doc.slice(start, end > start ? end : doc.length)
  }

  // Typed once: both the routing-statement sweep and the session-settled test
  // slice this same region, and drifting markers would fail one for the wrong
  // reason.
  const planInteractiveTable = sliceSection(
    planSynthesisSummary,
    "| Internal-draft element | Where it goes in the unified plan |",
    "No italic capture-context note",
  )

  const PRODUCT_SECTIONS = [
    "Problem Frame",
    "Key Decisions",
    "Success Criteria",
    "Actors",
    "Key Flows",
  ]

  // Problem Frame is unconditional in the hard floor ("Contains Summary,
  // Problem Frame, Requirements"), so it must NOT carry a skip test — an
  // earlier revision shipped one and let an implementation-ready plan omit a
  // mandatory section.
  const SKIPPABLE_SECTIONS = PRODUCT_SECTIONS.filter((s) => s !== "Problem Frame")

  test("plan-sections.md catalogs every Product Contract section with a skip test", () => {
    const catalog = sliceSection(
      planSections,
      "## Include when material",
      "## Agent agency",
    )
    for (const name of PRODUCT_SECTIONS) {
      entryBlock(catalog, name)
    }
    for (const name of SKIPPABLE_SECTIONS) {
      const block = entryBlock(catalog, name)
      expect(
        /\bskip\b/i.test(block),
        `The '${name}' catalog entry needs a skip test. A firing rule with no skip rule fires on everything, which the include-when-material doctrine treats as broken.`,
      ).toBe(true)
    }
    // Enriching a legacy requirements doc inherits decisions made during
    // brainstorming, and Phase 0.3 requires carrying them forward — a
    // planning-only firing rule would silently drop them.
    expect(
      /inherited from an upstream Product Contract/.test(entryBlock(catalog, "Key Decisions")),
      "The Key Decisions firing rule must cover decisions inherited from an upstream Product Contract, not only choices made during planning.",
    ).toBe(true)

    expect(
      /\bskip\b/i.test(entryBlock(catalog, "Problem Frame")),
      "The Problem Frame entry must NOT carry a skip test — the hard floor contains it unconditionally, so a skip rule would let an implementation-ready plan omit a mandatory section.",
    ).toBe(false)
  })

  test("the hard-floor enumeration still names its Product Contract subsections", () => {
    // U1 deliberately left :171-175 untouched. Guard against a later edit that
    // "deduplicates" the floor against the new catalog entries.
    // The floor is one wrapped sentence, so collapse whitespace before matching
    // ("Summary, Problem\n  Frame, Requirements ...").
    const floor = sliceSection(
      planSections,
      "- **Product Contract** — product scope and behavior.",
      "- **Planning Contract**",
    ).replace(/\s+/g, " ")
    for (const name of ["Summary", "Problem Frame", "Success Criteria", "Scope Boundaries"]) {
      expect(
        floor.includes(name),
        `The Product Contract hard floor must still name ${name}; the catalog entry supplements the floor rather than replacing it.`,
      ).toBe(true)
    }
  })

  test("all five routing statements name a Success Criteria destination", () => {
    const statements: Array<[string, string]> = [
      [
        "ce-plan prose restatement",
        sliceSection(planSynthesisSummary, "**Three-bucket structure is the internal draft", "## Stage 1"),
      ],
      [
        "ce-plan headless list",
        sliceSection(planSynthesisSummary, "Route internal-draft content with mode-aware shape", "The `### Assumptions` section appears"),
      ],
      ["ce-plan interactive table", planInteractiveTable],
      [
        "ce-brainstorm prose restatement",
        sliceSection(brainstormSynthesisSummary, "**Three-bucket structure is the internal draft", "This content is loaded"),
      ],
      [
        "ce-brainstorm routing table",
        sliceSection(brainstormSynthesisSummary, "| Internal-draft element | Where it goes in the doc |", "The chat-time Trade-offs section"),
      ],
    ]

    for (const [label, statement] of statements) {
      expect(
        statement.includes("Success Criteria"),
        `The ${label} must name a Success Criteria destination. A section the synthesis drafts with no destination in one statement drifts back out when a later edit reconciles the statements against each other.`,
      ).toBe(true)
    }
  })

  test("ce-plan's interactive table routes session-settled product decisions to Key Decisions", () => {
    // The headless list already carried this clause; the interactive table --
    // the most-used path -- had four rows and no session-settled row.
    expect(
      /Session-settled product decisions.*### Key Decisions/s.test(planInteractiveTable),
      "The interactive routing table must route session-settled product decisions to Product Contract `### Key Decisions`.",
    ).toBe(true)
  })

  test("no route lets an implementation-ready plan drop Problem Frame", () => {
    // Three separate review findings on PR #1359 came from the same shape: a
    // rule elsewhere in the file quietly permitting the omission of a
    // hard-floor section. Pin the remaining escape.
    const agency = sliceSection(planSections, "## Agent agency", "## Prose economy")
    expect(
      /Problem Frame merges into Summary/.test(agency),
      "The agency list is expected to still mention the Problem Frame merge; if it was deleted outright, drop this guard rather than letting it pass vacuously.",
    ).toBe(true)
    // Require the blocking sentence itself, not an alternative: an OR here let
    // the clause that actually prevents the omission be deleted while the pin
    // still passed.
    expect(
      /`ce-unified-plan\/v1` artifact keeps both\s+headings/s.test(agency),
      "The Problem Frame merge escape must be scoped away from every ce-unified-plan/v1 artifact, or it removes a hard-floor heading downstream consumers anchor on.",
    ).toBe(true)
  })

  test("the headless Success Criteria destination takes Stated signals only", () => {
    // The unconfirmed paths (headless, SKIP_SCOPING_CONFIRM) never validate an
    // Inferred bet, so routing an inferred success signal into an unlabeled
    // Product Contract section contradicts the `### Assumptions` firewall.
    // Two independent reviewers caught this collision on PR #1359.
    const headless = sliceSection(
      planSynthesisSummary,
      "Route internal-draft content with mode-aware shape",
      "The `### Assumptions` section appears",
    )
    expect(
      /Success signals — Stated only/.test(headless),
      "The headless routing list must restrict the Success Criteria destination to Stated signals; an inferred one belongs in `### Assumptions`.",
    ).toBe(true)
    expect(
      /Success signals.*\(Stated or Inferred\)/.test(headless),
      "The headless Success Criteria destination must not offer Inferred content — that reopens the firewall contradiction.",
    ).toBe(false)

    // The interactive table also governs SKIP_SCOPING_CONFIRM runs (its own
    // Inferred row says so), so an unqualified "(Stated or Inferred)" there
    // reopens the same contradiction one section down.
    expect(
      /Success signals \(Stated or Inferred\)/.test(planInteractiveTable),
      "The interactive routing table must qualify its Success Criteria row: it also governs SKIP_SCOPING_CONFIRM runs, where an inferred signal belongs in `### Assumptions`.",
    ).toBe(false)
    expect(
      /confirmed interactive run/.test(planInteractiveTable),
      "The interactive table's Success Criteria row must name the confirmed-interactive condition for Inferred signals.",
    ).toBe(true)
  })

  test("the silent-dissolve rule names which Inferred items are exempt", () => {
    expect(planSynthesisSummary).toMatch(
      /exempt from that silent dissolve.*success criteria extrapolated from intent.*scope boundaries the user never explicitly named/s,
    )
  })

  test("ce-plan's bootstrap carries an exit condition with both escapes", () => {
    const bootstrap = sliceSection(
      planSkill,
      "The planning bootstrap should establish:",
      "#### 0.5",
    )
    expect(
      bootstrap.includes("**Exit condition:**"),
      "The Phase 0.4 bootstrap must carry an exit condition; without one it lists what to establish and can proceed having established none of it.",
    ).toBe(true)
    expect(
      bootstrap.includes("recorded as assumptions"),
      "The exit condition must be satisfiable by recording an assumption, or it becomes a blocking question in headless mode.",
    ).toBe(true)
    expect(
      bootstrap.includes("explicitly wants to proceed"),
      "The exit condition must carry the explicit-user-proceed escape, matching ce-brainstorm's Phase 1.3 gate.",
    ).toBe(true)
  })

  test("Success Metrics and Success Criteria are distinguished, not collided", () => {
    // Both names exist in ce-plan, so the boundary between them must be stated
    // once and be exclusive — an overlapping definition let the same p95 target
    // belong to either section.
    expect(
      /Success Metrics.*`### Success Criteria`/s.test(planSkill),
      "ce-plan names both `Success Metrics` (deep-plan extension) and `Success Criteria` (Product Contract subsection); the relationship must be stated once so a future author does not merge them.",
    ).toBe(true)
    expect(
      /never appears here as well|only what Success Criteria does not already state/.test(planSkill),
      "The Success Metrics definition must claim an exclusive boundary, or a product-outcome threshold lands in both sections.",
    ).toBe(true)
  })
})

describe("Goal Capsule objective is outcome-shaped (issue #1423)", () => {
  const coherence = readRepoFile(
    "skills/ce-doc-review/references/personas/coherence-reviewer.md",
  )

  test("both section contracts define Objective as an outcome and give the mechanism a Means slot", () => {
    for (const [doc, marker] of [
      [planSections, "**Goal Capsule**"],
      [brainstormSections, "`## Goal Capsule`"],
    ] as const) {
      const capsule = sliceSection(doc, marker, "\n- ")
      expect(capsule).toMatch(/\bMeans\b/)
      expect(capsule).toMatch(/different\s+(implementation|mechanism)/i)
    }
  })

  test("Success Criteria skip does not fire on approach-shaped requirements", () => {
    const sc = sliceSection(planSections, "- **Success Criteria**", "\n- **")
    expect(sc).toMatch(/approach rather than an outcome/)
  })

  test("bootstrap exit requires an outcome-shaped problem frame", () => {
    const exit = sliceSection(planSkill, "**Exit condition:** Exit the bootstrap", "\n\n")
    expect(exit).toMatch(/Means/)
  })

  test("coherence reviewer flags a mechanism-only Objective", () => {
    expect(coherence).toMatch(/mechanism-only Objective/i)
  })
})
