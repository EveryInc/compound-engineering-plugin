import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8")
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
const ceWorkEngines = readRepoFile(
  "skills/ce-work/references/execution-engines.md",
)
const planMarkdownRendering = readRepoFile(
  "skills/ce-plan/references/markdown-rendering.md",
)
const lfg = readRepoFile("skills/lfg/SKILL.md")
const docReview = readRepoFile("skills/ce-doc-review/SKILL.md")
const docReviewTemplate = readRepoFile(
  "skills/ce-doc-review/references/subagent-template.md",
)
const codeReview = readRepoFile("skills/ce-code-review/SKILL.md")
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
    expect(brainstormSections).toContain("docs/plans/YYYY-MM-DD-NNN-<type>-<topic>-plan")
    expect(brainstormSections).toContain("artifact_readiness: requirements-only")
    expect(brainstormSections).toContain("product_contract_source: ce-brainstorm")
    // Requirements-only is slimmed for standalone readability: no Goal Launch
    // Block and no Reader Index (the launch prompt is skill-emitted at handoff).
    expect(brainstormSections).toMatch(/light and standalone-readable/i)
    expect(brainstormSections).toContain("Do **not** emit a `## Goal Launch Block` or `## Reader Index`")
    expect(brainstormSections).toMatch(/omits empty\s+`Planning Contract`/)

    expect(brainstormSkill).toContain("docs/plans/YYYY-MM-DD-NNN-<type>-<topic>-plan")
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
    expect(planSkill).toContain("create a new unified plan in `docs/plans/`")
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
    expect(lfg).toContain("invoke `ce-work` one more time with the same `mode:return-to-caller <plan-path-from-step-1>` argument")
    expect(lfg).toContain("stop as blocked and report the missing fields")
    expect(lfg).toContain("ce-code-review` skill with `mode:agent plan:<plan-path-from-step-1>`")
    expect(lfg).not.toContain("artifact_readiness: approach-plan")
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

    expect(codeReview).toContain("docs/plans/*.{md,html}")
    expect(codeReview).toContain("Product Contract` -> `### Requirements")
    expect(codeReview).toContain("readiness before checking completeness")
    expect(codeReview).toContain("must not trigger implementation-unit completeness findings")

    expect(proof).toContain("Only publish markdown")
    expect(proof).toContain("requirements-only")
  })

  test("docs and adjacent handoffs use the new convention", () => {
    expect(ideate).toContain("requirements-only unified plan under `docs/plans/`")
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
    expect(ceWork).toContain("after any mode token is stripped")
  })

  test("ce-code-review discovery/extraction covers HTML and Product Contract requirements", () => {
    // Codex #972 P2: discovery must scan .html and extraction must read
    // Product Contract > Requirements, matching the completeness contract.
    expect(codeReview).toContain("docs/plans/*.{md,html}")
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
    const region = planSkill.slice(phaseStart, phaseStart + 1600)
    expect(/requirements-only unified plan is not a resume target/i.test(region)).toBe(true)
    expect(/do \*?\*?not\*?\*? fire the update-or-create confirm/i.test(region)).toBe(true)
    expect(/Fall through to Phase 0\.2/i.test(region)).toBe(true)
    expect(/pipeline mode the resume choice is made automatically|never prompted/i.test(region)).toBe(true)
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
