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
const ceWorkBeta = readRepoFile("skills/ce-work-beta/SKILL.md")
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
      "goal-launch-block",
      "reader-index",
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
  })

  test("brainstorm writes requirements-only unified plan skeletons under docs/plans", () => {
    expect(brainstormSections).toContain("docs/plans/YYYY-MM-DD-NNN-<type>-<topic>-plan")
    expect(brainstormSections).toContain("artifact_readiness: requirements-only")
    expect(brainstormSections).toContain("product_contract_source: ce-brainstorm")
    expect(brainstormSections).toContain("Goal Launch Block")
    expect(brainstormSections).toContain("routes to `ce-plan` enrichment, not execution")
    expect(brainstormSections).toContain("omits empty `Planning Contract`")

    expect(brainstormSkill).toContain("docs/plans/YYYY-MM-DD-NNN-<type>-<topic>-plan")
    expect(brainstormSkill).toContain("artifact_readiness: requirements-only")
    expect(brainstormSkill).toContain("product_contract_source: ce-brainstorm")
    expect(brainstormSkill).toContain("not `/ce-work` or `/goal` execution")
    expect(brainstormSkill).toContain("new `ce-brainstorm` outputs do not write there")
    expect(brainstormSkill).toContain("non-software route does **not** write `artifact_contract: ce-unified-plan/v1`")

    expect(universalBrainstorming).toContain("outside the software unified-plan artifact contract")
    expect(universalBrainstorming).toContain("Do not write `artifact_contract: ce-unified-plan/v1`")
    expect(universalBrainstorming).toContain("let `ce-plan` choose the universal/knowledge-work artifact shape")
  })

  test("brainstorm handoff passes the unified plan path to ce-plan", () => {
    expect(brainstormHandoff).toContain("same unified plan file")
    expect(brainstormHandoff).toContain("Pass the unified")
    expect(brainstormHandoff).toContain("Recommended next step: `ce-plan <plan artifact path>`")
    expect(brainstormHandoff).toContain("Hidden by default for requirements-only artifacts")
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
    expect(planSkill).toContain("Goal Launch Block is a thin launcher")
  })

  test("ce-work and ce-work-beta are readiness-aware before execution", () => {
    expect(ceWork).toContain("classify `artifact_readiness` before reading the body")
    expect(ceWork).toContain("requirements-only` -> stop")
    expect(ceWork).toContain("Any other readiness value")
    expect(ceWork).toContain("metadata, build a heading/anchor map")
    expect(ceWork).toContain("Do not send \"read the whole plan\"")
    expect(ceWork).toContain("mode:caller-owned-tail <plan-path>")
    expect(ceWork).toContain("standalone_shipping_skipped: true")
    expect(ceWork).not.toContain("artifact_readiness: approach-plan")

    expect(ceWorkBeta).toContain("not the primary unified-plan executor")
    expect(ceWorkBeta).toContain("mirror stable")
    expect(ceWorkBeta).toContain("requirements-only")
  })

  test("lfg delegates implementation to ce-work caller-owned-tail mode", () => {
    expect(lfg).toContain("artifact_readiness: implementation-ready")
    expect(lfg).toContain("execution: code")
    expect(lfg).toContain("any unrecognized readiness value")
    expect(lfg).toContain("LFG never launches `/goal` directly")
    expect(lfg).toContain("mode:caller-owned-tail <plan-path-from-step-1>")
    expect(lfg).toContain("standalone_shipping_skipped: true")
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

  test("Goal Launch Block stays thin and does not duplicate authoritative sections", () => {
    expect(planSections).toContain("Goal Launch Block")
    expect(planSections).toMatch(/thin[\s\S]{0,200}does not duplicate the requirements, verification matrix/i)
    expect(planSections).toContain("It points to authoritative")
  })

  test("consuming skills carry a pre-read / heading-scan algorithm, not full-doc-first", () => {
    // The reader strategy lives in the skills, not only in the document.
    // plan-sections names the heading map; ce-work builds it before reading.
    expect(planSections).toContain("the heading map")
    expect(planSections).toContain("consuming skills still own the")
    expect(ceWork).toContain("do **not** read the whole document first")
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

  test("ce-work Phase 0 parses the caller-owned-tail mode token before triage", () => {
    // Codex #972 P1: lfg passes `mode:caller-owned-tail <plan-path>`; ce-work
    // must strip the mode token, not treat the whole string as a bare prompt.
    expect(ceWork).toMatch(/begins with `mode:caller-owned-tail`/i)
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
    expect(ceWorkEngines).toMatch(/do not open a PR|must not open a PR/i)
  })
})
