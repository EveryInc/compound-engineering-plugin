import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

function personaPromptPath(personaName: string): string {
  return `skills/ce-code-review/references/personas/${personaName}.md`
}

describe("ce-code-review contract", () => {
  test("documents explicit modes and orchestration boundaries", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")

    expect(content).toContain("## Argument Parsing")
    expect(content).toContain("mode:autofix` is no longer supported")
    expect(content).toContain("mode:report-only")
    expect(content).toContain("mode:agent")
    expect(content).toContain("mode:headless")
    expect(content).toContain("/tmp/compound-engineering/ce-code-review/<run-id>/")
    expect(content).toMatch(/Never push, open PRs, or file tickets/i)
    expect(content).toContain("run artifact")
    expect(content).toMatch(/check out the PR branch/i)
    expect(content).toMatch(/Never run `gh pr checkout`/i)
    expect(content).not.toContain("Which severities should I fix?")
  })

  test("keeps plan requirements completeness compatible with current and legacy unit formats", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")

    expect(content).toContain("current numeric subsections")
    expect(content).toContain("`### U1.`")
    expect(content).toContain("`### Unit 1:`")
    expect(content).toContain("legacy bullet or checkbox unit entries")
    expect(content).toContain("unaddressed requirements or implementation units")
  })

  test("documents agent mode contract for programmatic callers", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")

    // mode:agent is report-only (skips Stage 5c apply); same reviewer pipeline as default
    expect(content).toContain("## Operating principles")
    expect(content).toMatch(/`mode:agent` is \*\*report-only\*\*/i)
    expect(content).toMatch(/does not change reviewer selection, merge logic, or scope rules/i)

    // No blocking prompts (cross-platform)
    expect(content).toContain("Never use `AskUserQuestion`")

    // JSON output format
    expect(content).toContain("### JSON output format")
    expect(content).toContain('"status": "complete"')
    expect(content).toContain("review.json")

    // mode:agent never mutates; default mode applies safe fixes (this test owns the mutate-contract assertions)
    expect(content).toMatch(/never mutates the tree/i)
    expect(content).toMatch(/default \(interactive\).{0,4}mode the review applies/i)

    // Never checkout — explicit mutations only
    expect(content).toMatch(/Never run `gh pr checkout`/i)
    expect(content).toMatch(/Do \*\*not\*\* check out/i)

    // Conflicting arguments
    expect(content).toContain("**Conflicting arguments:**")

    // Structured failure JSON
    expect(content).toContain('{"status":"failed","reason":"..."}')

    // Deprecated alias preserved
    expect(content).toContain("**Deprecated alias**")
  })

  test("documents policy-driven routing and actionable handoff", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")

    // Action Routing: autofix_class is signal only; mode:agent never mutates, default applies
    expect(content).toContain("## Action Routing")
    expect(content).toMatch(/this skill does not mutate the checkout/i)
    expect(content).toContain("references/action-class-rubric.md")

    // No post-review triage — report is the complete handoff
    expect(content).toContain("Do not run post-review triage")
    expect(content).not.toContain("references/walkthrough.md")
    expect(content).not.toContain("references/bulk-preview.md")
    expect(content).not.toContain("references/tracker-defer.md")
    expect(content).not.toMatch(/Review each finding one by one/)
    expect(content).not.toMatch(/File a \[TRACKER\] ticket per finding/)

    expect(content).not.toContain("What should I do with the remaining findings?")
    expect(content).not.toContain("What should I do?")

    expect(content).toContain("Actionable Findings")
    expect(content).toContain("Actionable findings: none.")

    expect(content).not.toContain("ce-todo-create")
    expect(content).not.toContain("create durable todo files")
    expect(content).not.toMatch(/harness task primitive|task-tracking primitive/)

    // Subagent template carries the why_it_matters framing guidance that replaces the
    // rejected synthesis-time rewrite pass. Assert presence of the observable-behavior
    // rule and the required-field reminder without pinning exact prose.
    const subagentTemplate = await readRepoFile(
      "skills/ce-code-review/references/subagent-template.md",
    )
    expect(subagentTemplate).toMatch(/observable behavior/i)
    expect(subagentTemplate).toMatch(/required/i)

    expect(content).toContain("Do not offer push/PR/create-branch next steps from this skill.")
  })

  test("keeps findings schema and downstream docs aligned", async () => {
    const rawSchema = await readRepoFile(
      "skills/ce-code-review/references/findings-schema.json",
    )
    const schema = JSON.parse(rawSchema) as {
      _meta: {
        confidence_thresholds: { suppress: string; report: string }
        confidence_anchors: Record<string, string>
      }
      properties: {
        findings: {
          items: {
            properties: {
              autofix_class: { enum: string[] }
              owner: { enum: string[] }
              requires_verification: { type: string }
              confidence: { type: string; enum: number[] }
            }
            required: string[]
          }
        }
      }
    }

    expect(schema.properties.findings.items.required).toEqual(
      expect.arrayContaining(["autofix_class", "owner", "requires_verification"]),
    )
    expect(schema.properties.findings.items.properties.autofix_class.enum).toEqual([
      "gated_auto",
      "manual",
      "advisory",
    ])
    expect(schema.properties.findings.items.properties.owner.enum).toEqual([
      "downstream-resolver",
      "human",
      "release",
    ])
    expect(schema.properties.findings.items.properties.requires_verification.type).toBe("boolean")

    // Anchored confidence: integer enum, no floats
    expect(schema.properties.findings.items.properties.confidence.type).toBe("integer")
    expect(schema.properties.findings.items.properties.confidence.enum).toEqual([0, 25, 50, 75, 100])

    // Threshold: anchor 75 (P0 escape at anchor 50)
    expect(schema._meta.confidence_thresholds.suppress).toContain("anchor 75")
    expect(schema._meta.confidence_thresholds.suppress).toContain("anchor 50")
    expect(schema._meta.confidence_thresholds.suppress).toMatch(/P0/)

    // Behavioral anchors documented for personas
    expect(schema._meta.confidence_anchors).toBeDefined()
    expect(schema._meta.confidence_anchors["0"]).toBeDefined()
    expect(schema._meta.confidence_anchors["25"]).toBeDefined()
    expect(schema._meta.confidence_anchors["50"]).toBeDefined()
    expect(schema._meta.confidence_anchors["75"]).toBeDefined()
    expect(schema._meta.confidence_anchors["100"]).toBeDefined()

  })

  test("subagent template carries verbatim 5-anchor rubric and lint-ignore suppression", async () => {
    const template = await readRepoFile(
      "skills/ce-code-review/references/subagent-template.md",
    )

    // Anchored rubric: each anchor named with behavioral criterion
    expect(template).toMatch(/`0`.*Not confident/)
    expect(template).toMatch(/`25`.*Somewhat confident/)
    expect(template).toMatch(/`50`.*Moderately confident/)
    expect(template).toMatch(/`75`.*Highly confident/)
    expect(template).toMatch(/`100`.*Absolutely certain/)

    // Schema conformance hard constraints reject floats
    expect(template).toContain("`0`, `25`, `50`, `75`, or `100`")
    expect(template).toMatch(/0\.85.*validation failure/i)

    // Lint-ignore rule in false-positive catalog
    expect(template).toMatch(/lint.ignore|lint disable|eslint-disable/i)
    expect(template).toMatch(/suppress unless the suppression itself violates/i)

    // Advisory routing rule preserved
    expect(template).toMatch(/Advisory observations.*route to advisory/i)

    // Personas never produce anchors 0 or 25 (suppress silently)
    expect(template).toMatch(/personas never produce/i)
  })

  test("subagent template points to action-class rubric without safe_auto", async () => {
    const template = await readRepoFile(
      "skills/ce-code-review/references/subagent-template.md",
    )

    expect(template).toContain("references/action-class-rubric.md")
    expect(template).not.toContain("safe_auto")
    expect(template).not.toContain("review-fixer")
    expect(template).toMatch(/gated_auto.*manual.*advisory/s)
  })

  test("action-class rubric defines caller routing without safe_auto", async () => {
    const rubric = await readRepoFile(
      "skills/ce-code-review/references/action-class-rubric.md",
    )

    expect(rubric).toContain("gated_auto")
    expect(rubric).toContain("manual")
    expect(rubric).toContain("advisory")
    expect(rubric).toMatch(/Do \*\*not\*\* emit `safe_auto`/)
    expect(rubric).toMatch(/Do not use `review-fixer`/i)
  })

  test("Stage 4 spawning restates model-override imperative at point of action", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")

    // Model tiering subsection still enumerates the three session-model exceptions
    expect(content).toMatch(/correctness-reviewer.*security-reviewer.*adversarial-reviewer/s)

    // Imperative lives inside the Spawning subsection, not only in the rationale block.
    // Extract the Spawning subsection and assert the model-override directive appears there
    // with cross-platform dispatch primitives named at the call site.
    const spawningMatch = content.match(/#### Spawning\n([\s\S]*?)(?=\n####|\n### )/)
    expect(spawningMatch).not.toBeNull()
    const spawning = spawningMatch![1]

    expect(spawning).toMatch(/Model override at dispatch time/)
    expect(spawning).toContain("platform's balanced mid-tier model")
    expect(spawning).toContain("omit the override")
    expect(spawning).toContain("Agent")
    expect(spawning).toContain("spawn_agent")
    expect(spawning).toContain("subagent")
    expect(spawning).toMatch(/Bounded parallel dispatch/)
    expect(spawning).toMatch(/active-subagent limit/)
    expect(spawning).toMatch(/spawn errors as backpressure, not reviewer failure/)
    expect(spawning).toMatch(/fill freed slots/)
    // Exceptions are restated at point of action so the agent does not have to recall them
    // from the Model tiering subsection above during a 12-agent parallel dispatch.
    expect(spawning).toContain("correctness-reviewer")
    expect(spawning).toContain("security-reviewer")
    expect(spawning).toContain("adversarial-reviewer")
  })

  test("Stage 5 synthesis uses anchor gate and one-anchor promotion", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")

    // Confidence value constraint is integer enum
    expect(content).toMatch(/confidence:\s*integer in \{0, 25, 50, 75, 100\}/)

    // Confidence gate at anchor 75 with P0 exception at 50
    expect(content).toMatch(/suppress remaining findings below anchor 75/i)
    expect(content).toMatch(/P0 findings at anchor 50\+ survive/)

    // Confidence gate runs AFTER dedup, promotion, and demotion so anchor-50 findings
    // can be promoted by cross-reviewer agreement or rerouted to soft buckets first.
    // This is a load-bearing ordering — if the gate runs early, promotion/demotion become unreachable.
    expect(content).toMatch(/gate runs late deliberately/i)

    // One-anchor promotion replaces +0.10 boost
    expect(content).toMatch(/one anchor step.*50 -> 75.*75 -> 100/)
    expect(content).not.toContain("boost the merged confidence by 0.10")

    // Sort by anchor descending, not "confidence (descending)"
    expect(content).toMatch(/anchor \(descending\)/)
  })

  test("Stage 5b validation pass dispatches conditionally and bounds parallelism", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")
    const validatorTemplate = await readRepoFile(
      "skills/ce-code-review/references/validator-template.md",
    )

    // Stage 5b exists between Stage 5 and Stage 6
    expect(content).toContain("### Stage 5b: Validation pass")

    // Stage 5b runs whenever at least one finding survives; same in default and agent
    expect(content).toContain("Same rule for default and `mode:agent`")
    expect(content).toMatch(/do \*\*not\*\* skip the stage/i)

    // Per-finding bounded dispatch (not batched)
    expect(content).toMatch(/per.finding bounded dispatch/i)
    expect(content).toMatch(/Independence is the point/i)
    expect(content).toMatch(/same bounded scheduler from Stage 4/i)
    expect(content).toMatch(/active-subagent limit/i)

    // Budget cap of 15 — validate highest-severity first; P0/P1 are never dropped for budget
    expect(content).toMatch(/exceeds 15 findings/i)
    expect(content).toMatch(/highest-severity 15/i)
    expect(content).toMatch(/Never drop a P0 or P1 from validation/i)
    expect(content).toMatch(/raise the cap to (cover|include) all of them/i)

    // Validator template exists and is read-only
    expect(validatorTemplate).toContain("independent validator")
    expect(validatorTemplate).toContain("operationally read-only")
    expect(validatorTemplate).toContain('"validated": true | false')
    expect(validatorTemplate).toMatch(/introduced by THIS diff/i)
    expect(validatorTemplate).toMatch(/handled elsewhere/i)
  })

  test("Stage 5c applies safe fixes in default mode, report-only in mode:agent, no deny-list", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")
    const template = await readRepoFile(
      "skills/ce-code-review/references/review-output-template.md",
    )

    // New act stage, default-mode only; mode:agent stays report-only
    expect(content).toContain("### Stage 5c: Act on findings")
    expect(content).toMatch(/Skip entirely in `mode:agent`/i)
    expect(content).toMatch(/`mode:agent` does not apply fixes/i)

    // Bias to act, push back if wrong, no deny-list
    expect(content).toMatch(/bias to act/i)
    expect(content).toMatch(/Push back.*do not apply.*reviewer is wrong/i)
    expect(content).toMatch(/There is no deny-list/i)

    // Scope invariant + verify-then-keep + commit-on-clean-tree, never push
    expect(content).toMatch(/Apply only when the working tree \*?is\*? what was reviewed/i)
    expect(content).toMatch(/revert that fix and report it/i)
    expect(content).toMatch(/Commit when the pre-review tree was clean/i)
    expect(content).toMatch(/Never push, open a PR, or file tickets/i)

    // Applied reporting (skill + template)
    expect(content).toMatch(/Applied \(default mode only\)/i)
    expect(template).toContain("### Applied")

    // No apply mode revived
    expect(content).toMatch(/there is no apply \*?mode\*?/i)
  })

  test("findings presentation is action-shaped and enforces hard constraints, mirrors the template", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")
    const template = await readRepoFile(
      "skills/ce-code-review/references/review-output-template.md",
    )

    // Render-time load of the canonical skeleton (not just "see the template")
    expect(content).toContain("load `references/review-output-template.md` and mirror")
    expect(template).toContain("canonical skeleton")

    // Per-finding clarity: the four things an actor needs (what/why/response/confidence)
    expect(content).toMatch(/what response it needs/i)
    expect(content).toMatch(/why it matters/i)

    // Group by unit of work/decision: decisions a human must make vs mechanical work
    expect(content).toMatch(/decision/i)
    expect(content).toMatch(/mechanical/i)

    // Economy is about expression, not coverage: no file pasting / diff restating
    expect(content).toMatch(/do not paste file contents/i)

    // Long output: the closing (verdict + actionable list) stands alone
    expect(content).toMatch(/stand alone without scrolling/i)
    expect(content).toMatch(/Actionable list are present, last, and self-sufficient/i)

    // Shape serves the finding type, but consistent within a section
    expect(content).toMatch(/consistent within (a |the )?section/i)

    // Hard constraint: ASCII-safe, no box-drawing (skill + template)
    expect(content).toMatch(/box-drawing/i)
    expect(template).toMatch(/box-drawing/i)

    // Stable numbering reused; multi-file applied fix is one row; keyed detail line is the home for depth
    expect(content).toMatch(/reuse the same `#`/i)
    expect(template).toMatch(/one row with one `#`/i)
    expect(template).toMatch(/\*\*#N\*\*/)
  })

  test("PR-mode skip-condition pre-check stops without dispatching reviewers", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")

    // Skip-check section exists
    expect(content).toContain("**Skip-condition pre-check.**")

    // gh pr view fetches state and file list for trivial judgment
    expect(content).toMatch(/gh pr view.*--json state,title,body,files/)

    // Hard skip rules
    expect(content).toMatch(/state.*CLOSED.*MERGED/)

    // Draft PRs are explicitly NOT skipped
    expect(content).not.toMatch(/isDraft.*true.*stop/)
    expect(content).toMatch(/Draft PRs are reviewed normally/)

    // Trivial-PR judgment uses lightweight model, not a regex
    expect(content).toMatch(/lightweight sub-agent/)
    expect(content).toMatch(/cheapest capable model/)
    expect(content).toMatch(/omit the model override/)
    expect(content).not.toMatch(/chore\\?\(deps\\?\)/)

    // Skip cleanly without dispatching reviewers
    expect(content).toMatch(/stop without dispatching reviewers/)

    // Standalone, base:, and branch-remote paths unaffected by PR skip rules
    expect(content).toMatch(/Standalone.*`base:`.*branch-remote/)
  })

  test("remote scope modes forbid workspace inspection on wrong tree", async () => {
    const skill = await readRepoFile("skills/ce-code-review/SKILL.md")
    const diffScope = await readRepoFile(
      "skills/ce-code-review/references/diff-scope.md",
    )
    const validator = await readRepoFile(
      "skills/ce-code-review/references/validator-template.md",
    )

    expect(skill).toContain("<pr-scope-mode>branch-remote</pr-scope-mode>")
    expect(skill).toContain("<branch-head-ref>")
    expect(skill).toMatch(/local-aligned.*local tree diff/i)
    expect(skill).not.toMatch(/append.*`DIFF:`.*unpushed/i)
    expect(skill).toMatch(/Do \*\*not\*\* call `gh pr diff` or append remote hunks/)

    expect(diffScope).toContain("branch-remote")
    expect(diffScope).toContain("pr-remote")

    expect(validator).toContain("branch-remote")
  })

  test("mode-aware demotion routes weak general-quality findings to soft buckets", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")

    // Mode-aware demotion step exists (sub-step within Stage 5; numbering may shift if steps reorder)
    expect(content).toMatch(/Mode-aware demotion of weak general-quality findings/i)

    // Conservative scope: testing + maintainability personas only
    expect(content).toContain("`testing` or `maintainability`")

    // Severity P2 or P3 only (P0/P1 always stay primary)
    expect(content).toMatch(/Severity is P2 or P3/)

    // autofix_class is advisory
    expect(content).toMatch(/`autofix_class` is `advisory`/)

    // Route demoted findings to soft buckets
    expect(content).toMatch(/`testing_gaps`/)
    expect(content).toMatch(/`residual_risks`/)

    // Demotion entry uses title-only (compact return omits why_it_matters)
    expect(content).toMatch(/append `<file:line> -- <title>` to/)
    expect(content).toMatch(/compact return omits/i)

    // Coverage section reports demotion count
    expect(content).toMatch(/mode-aware demotion/)
  })

  test("personas use anchored rubric language and no float references remain", async () => {
    const personas = [
      "correctness-reviewer",
      "testing-reviewer",
      "maintainability-reviewer",
      "project-standards-reviewer",
      "security-reviewer",
      "performance-reviewer",
      "api-contract-reviewer",
      "data-migration-reviewer",
      "reliability-reviewer",
      "adversarial-reviewer",
      "previous-comments-reviewer",
      "julik-frontend-races-reviewer",
      "swift-ios-reviewer",
      "agent-native-reviewer",
    ]

    for (const persona of personas) {
      const content = await readRepoFile(personaPromptPath(persona))

      // Anchored language appears
      expect(content).toMatch(/Anchor (75|100)/)
      expect(content).toMatch(/Anchor 25 or below.*suppress/i)

      // No float confidence references
      expect(content).not.toMatch(/0\.\d{2}\+/)
      expect(content).not.toMatch(/0\.60-0\.79/)
      expect(content).not.toMatch(/below 0\.60/)
    }
  })

  test("documents stack-specific conditional reviewers for the JSON pipeline", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")
    const catalog = await readRepoFile(
      "skills/ce-code-review/references/persona-catalog.md",
    )

    for (const agent of ["julik-frontend-races-reviewer", "swift-ios-reviewer"]) {
      expect(content).toContain(agent)
      expect(catalog).toContain(agent)
    }

    for (const removed of [
      "ce-dhh-rails-reviewer",
      "ce-kieran-rails-reviewer",
      "ce-kieran-python-reviewer",
      "ce-kieran-typescript-reviewer",
    ]) {
      expect(content).not.toContain(removed)
      expect(catalog).not.toContain(removed)
    }

    expect(content).toContain("## Language-Aware Conditionals")
    expect(content).not.toContain("## Language-Agnostic")
  })

  test("stack-specific reviewer agents follow the structured findings contract", async () => {
    const reviewers = [
      {
        path: personaPromptPath("julik-frontend-races-reviewer"),
        reviewer: "julik-frontend-races",
      },
      {
        path: personaPromptPath("swift-ios-reviewer"),
        reviewer: "swift-ios",
      },
    ]

    for (const reviewer of reviewers) {
      const content = await readRepoFile(reviewer.path)

      expect(content).not.toMatch(/^---\n/)
      expect(content).toContain("## Confidence calibration")
      expect(content).toContain("## What you don't flag")
      expect(content).toContain("Return your findings as JSON matching the findings schema. No prose outside the JSON.")
      expect(content).toContain(`"reviewer": "${reviewer.reviewer}"`)
    }
  })

  test("JSON-pipeline prompt assets stay frontmatter-free while template permits artifact write", async () => {
    // The ce-code-review subagent template instructs each persona to write its full
    // analysis to /tmp/compound-engineering/ce-code-review/{run_id}/{reviewer}.json.
    // Prompt assets no longer carry tool frontmatter; the caller/template owns
    // artifact-write permission in the generic subagent dispatch.
    const skill = await readRepoFile("skills/ce-code-review/SKILL.md")
    const template = await readRepoFile(
      "skills/ce-code-review/references/subagent-template.md",
    )
    const personas = [
      "correctness-reviewer",
      "testing-reviewer",
      "maintainability-reviewer",
      "project-standards-reviewer",
      "security-reviewer",
      "performance-reviewer",
      "api-contract-reviewer",
      "data-migration-reviewer",
      "reliability-reviewer",
      "adversarial-reviewer",
      "previous-comments-reviewer",
      "julik-frontend-races-reviewer",
      "swift-ios-reviewer",
    ]

    for (const persona of personas) {
      const content = await readRepoFile(personaPromptPath(persona))

      expect(content).not.toMatch(/^---\n/)
      expect(content).not.toMatch(/^tools:/m)
    }

    expect(skill).toContain("The one permitted write is saving their full analysis")
    expect(template).toContain("This is the ONE write operation you are permitted to make")
  })

  test("data-migration reviewer consolidates schema drift and migration safety", async () => {
    const content = await readRepoFile(personaPromptPath("data-migration-reviewer"))
    const skill = await readRepoFile("skills/ce-code-review/SKILL.md")

    expect(content).toContain("## Step 0: Schema drift")
    expect(content).toContain('"reviewer": "data-migration"')
    expect(content).toContain("Return your findings as JSON matching the findings schema.")
    expect(skill).toContain("data-migration` spawn gate")
    expect(skill).not.toContain("ce-schema-drift-detector")
    expect(skill).not.toContain("ce-data-migration-expert")
    expect(skill).not.toContain("ce-data-migrations-reviewer")
  })

  test("PR mode uses gh pr diff without checkout; branch/standalone fail closed on missing base", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")

    // No scope path should fall back to `git diff HEAD` or `git diff --cached` — those only
    // show uncommitted changes and silently produce empty diffs on clean feature branches.
    expect(content).not.toContain("git diff --name-only HEAD")
    expect(content).not.toContain("git diff -U10 HEAD")
    expect(content).not.toContain("git diff --cached")

    // PR mode uses remote diff API, not checkout
    expect(content).toContain("gh pr diff")
    expect(content).toMatch(/Do not fall back to checkout/i)

    // Branch and standalone modes must stop when no base can be resolved
    const stopGuardMatches = content.match(/Do not fall back to `git diff HEAD`/g)
    expect(stopGuardMatches?.length).toBeGreaterThanOrEqual(1)
  })

  test("orchestration callers invoke review-only code review", async () => {
    const lfg = await readRepoFile("skills/lfg/SKILL.md")
    expect(lfg).toMatch(/ce-code-review[^\n]*mode:agent/)
    expect(lfg).toContain("references/review-followup.md")
    expect(lfg).not.toMatch(/mode:autofix/)
  })

  test("ce-work documents review-findings followup after Tier 2", async () => {
    const followup = await readRepoFile(
      "skills/ce-work/references/review-findings-followup.md",
    )
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    expect(followup).toContain("review-only")
    expect(followup).toContain("suggested_fix")
    // The apply followup consumes the review the caller already ran; re-invocation is a
    // cold-caller fallback only (it must not start a second review in the ce-work Tier 2 path).
    expect(followup).toMatch(/consume the completed review/i)
    expect(followup).toMatch(/invoke[^\n]*review[^\n]*cold caller/i)
    expect(followup).toMatch(/does not investigate findings/i)
    expect(followup).toMatch(/Group by `file`/i)
    expect(followup).toMatch(/batch/i)
    expect(followup).toContain("mode:agent")
    expect(skill).toMatch(/ce-code-review.*review-only|review-only.*ce-code-review/i)
    expect(skill).toContain("review-findings-followup.md")
    expect(skill).toMatch(/batch.*file|batch applicable findings by file/i)
  })

  test("ce-work shipping-workflow enforces a residual-work gate after Tier 2 review", async () => {
    for (const path of [
      "skills/ce-work/references/shipping-workflow.md",
    ]) {
      const workflow = await readRepoFile(path)
      await expect(readRepoFile(path.replace("shipping-workflow.md", "tracker-defer.md"))).resolves.toContain(
        "Non-interactive mode",
      )
      await expect(readRepoFile(path.replace("shipping-workflow.md", "tracker-defer.md"))).resolves.not.toMatch(
        /no-sink/,
      )

      // Gate step is explicitly labeled and required after Tier 2.
      expect(workflow).toContain("**Residual Work Gate**")
      expect(workflow).toMatch(/do not proceed to Final Validation/i)

      // Three forward options + one abort; labels are self-contained.
      expect(workflow).toContain("Apply/fix now")
      expect(workflow).toContain("File tickets via project tracker")
      expect(workflow).toContain("Accept and proceed")
      expect(workflow).toContain("Stop — do not ship")

      // Accept-and-proceed path threads findings into the PR description.
      expect(workflow).toContain("Known Residuals")
      expect(workflow).toContain("docs/residual-review-findings/<branch-or-head-sha>.md")
      expect(workflow).toContain("If the user later chooses the no-PR `ce-commit` path")
      expect(workflow).toContain("must not live only in the transient session")
    }
  })

  test("lfg autonomously handles residuals via non-interactive tracker-defer and PR description", async () => {
    const lfg = await readRepoFile("skills/lfg/SKILL.md")
    await expect(readRepoFile("skills/lfg/references/tracker-defer.md")).resolves.toContain(
      "Non-interactive mode",
    )
    await expect(readRepoFile("skills/lfg/references/tracker-defer.md")).resolves.not.toMatch(
      /no-sink/,
    )

    // Autonomous residual handoff step exists between code review and test-browser.
    expect(lfg).toContain("Apply and persist review fixes")
    const followup = await readRepoFile("skills/lfg/references/review-followup.md")
    expect(followup).toContain("fix(review): apply review findings")
    expect(lfg).toContain("references/review-followup.md")
    expect(lfg).toContain("Autonomous residual handoff")
    expect(lfg).toMatch(/Do not prompt the user/)

    // tracker-defer is invoked in non-interactive mode.
    expect(lfg).toContain("references/tracker-defer.md")
    expect(lfg).not.toContain("skills/ce-code-review/references/tracker-defer.md")

    // Structured return buckets drive PR description content.
    expect(lfg).toMatch(/filed/)
    expect(lfg).toMatch(/failed/)
    expect(lfg).toMatch(/no_sink/)

    // PR description update path is non-interactive and does not route through
    // confirmation-driven PR update skills. The positive assertion on
    // `gh pr edit` below is the actual check; a broad `not.toContain` would
    // falsely trip on step 7's legitimate use of ce-commit-push-pr for the
    // post-work commit/PR-open step.
    expect(lfg).toContain("do not load any confirmation-driven PR update skill")
    expect(lfg).toContain("gh pr edit PR_NUMBER --body-file BODY_FILE")
    expect(lfg).toContain("## Residual Review Findings")
    expect(lfg).toContain("docs/residual-review-findings/<branch-or-head-sha>.md")
    expect(lfg).toContain("prefer `origin` when present")
    expect(lfg).toContain("choose the first configured remote")
    expect(lfg).toContain("git push --set-upstream <remote> HEAD")
    expect(lfg).not.toContain("git push --set-upstream origin HEAD")
    expect(lfg).toContain("Do not output DONE until the residual findings are durable")

    // Shipping precondition: a remote-less repo (e.g. a sandbox/throwaway checkout)
    // finishes locally instead of deadlocking on an impossible push.
    expect(lfg).toContain("Shipping precondition")
    expect(lfg).toContain("skip every push, PR create/edit, and CI-watch action")

    // Autopilot contract: never prompt, but require a durable sink before DONE.
    expect(lfg).toContain("Do not prompt the user")
    expect(lfg).toMatch(/Never block DONE on tracker filing failures/i)
  })

  test("ce-code-review emits actionable findings summary for callers", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")
    expect(content).toContain("### Emit actionable findings summary")
    expect(content).toContain("Actionable Findings")
    expect(content).toContain("with stable `#`, severity, file:line, title, `autofix_class`")
    expect(content).toContain("Actionable findings: none.")
  })

  test("ce-code-review uses stable sequential finding numbers across grouped output", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")
    const template = await readRepoFile(
      "skills/ce-code-review/references/review-output-template.md",
    )
    const fixture = await readRepoFile("tests/fixtures/ce-code-review-stable-numbering.md")

    const stage5 = content.split("### Stage 5b:")[0].split("### Stage 5:")[1]
    expect(stage5).toMatch(/Sort and number/)
    expect(stage5).toMatch(/Do not restart numbering inside each severity table, triage group, or autofix\/routing bucket/)
    expect(stage5).toMatch(/reuse the same stable `#`/)
    expect(stage5).toMatch(/downstream workflows/)

    const stage6 = content.split("### Headless output format")[0].split("### Stage 6: Synthesize and present")[1]
    expect(stage6).toContain("Finding numbers come from the stable assignment in Stage 5")
    expect(stage6).toContain("never re-derive them per severity section")
    expect(template).toContain("Stable sequential finding numbers")
    expect(template).toContain("reuse those same numbers when findings are repeated in Actionable Findings")

    // Per-severity tables are 5-column (# | File | Issue | Reviewer | Confidence);
    // Route lives in the Actionable Findings table + JSON, not the scannable tables.
    const primaryFindingIds = Array.from(
      fixture.matchAll(/^\| (\d+) \| `[^`]+` \| .* \| .* \| \d+ \|$/gm),
      ([, id]) => Number(id),
    )
    expect(primaryFindingIds).toEqual([1, 2, 3])

    // Applied findings keep their stable # and appear only in the Applied section (default mode), not severity tables
    const appliedSection = fixture.split("### Applied")[1].split("\n### ")[0]
    const appliedIds = Array.from(
      appliedSection.matchAll(/^\| (\d+) \| `[^`]+` \| .* \| .* \|$/gm),
      ([, id]) => Number(id),
    )
    expect(appliedIds).toEqual([4])
    expect(appliedIds.every((id) => !primaryFindingIds.includes(id))).toBe(true)

    // Keyed detail lines under a table are supplements, not findings — they reuse a # and never add one
    expect(fixture).toMatch(/^- \*\*#1\*\*/m)

    const residualSection = fixture.split("### Actionable Findings")[1]
    const residualIds = Array.from(
      residualSection.matchAll(/^\| (\d+) \| `[^`]+` \| .* \| `.*` \| .* \|$/gm),
      ([, id]) => Number(id),
    )
    expect(residualIds).toEqual([2, 3])
    expect(residualIds.every((id) => primaryFindingIds.includes(id))).toBe(true)
  })

  test("documents grouping tokens as presentation with conflict handling", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")

    // Three grouping tokens in the Argument Parsing table, auto as default
    expect(content).toContain("`grouping:auto`")
    expect(content).toContain("`grouping:off`")
    expect(content).toContain("`grouping:always`")

    // Grouping never changes review behavior — presentation only
    expect(content).toContain("Grouping is presentation, not a mode.")
    expect(content).toMatch(/never reviewer selection, merge logic, scope rules, or the Stage 5c apply decision/)

    // Conflicting grouping tokens stop the review like conflicting modes do
    expect(content).toMatch(/Multiple distinct `grouping:` tokens/)
  })

  test("Stage 5 builds triage groups without mutating findings", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")
    const stage5 = content.split("### Stage 5b:")[0].split("### Stage 5:")[1]

    expect(stage5).toMatch(/Build thematic triage groups/)
    // Grouping is distinct from dedup and never alters the merged finding set
    expect(stage5).toMatch(/distinct from deduplication/)
    expect(stage5).toMatch(/never change a finding's severity, confidence, route, owner, or stable `#`/)
    // Stable numbering extends across groups, same as severity tables
    expect(stage5).toMatch(/Do not restart numbering inside each severity table, triage group, or autofix\/routing bucket/)
    // auto triggers on distinct concerns (mirrors plan Requirements grouping), not item count
    expect(stage5).toMatch(/the trigger is distinct concerns, not item count/)
    expect(stage5).toMatch(/prefer no groups over decorative single-item groups/)
    expect(stage5).toMatch(/A finding appears in at most one group/)
  })

  test("triage groups are pruned after validation drops and after apply", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")

    // Stage 5b: groups never reference findings dropped by validation
    const stage5b = content.split("### Stage 5c:")[0].split("### Stage 5b:")[1]
    expect(stage5b).toMatch(/Prune triage groups after drops/)
    expect(stage5b).toMatch(/must never reference a `#` that was rejected or dropped/)

    // Stage 5c: groups describe remaining work — applied findings leave the groups
    const stage5c = content.split("### Stage 6:")[0].split("### Stage 5c:")[1]
    expect(stage5c).toMatch(/Re-partition triage groups after apply/)
    expect(stage5c).toMatch(/never tell the user to handle a finding that was already applied/)
  })

  test("triage groups render as a stable-numbered pipe table and JSON field", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")
    const template = await readRepoFile(
      "skills/ce-code-review/references/review-output-template.md",
    )
    const fixture = await readRepoFile("tests/fixtures/ce-code-review-stable-numbering.md")

    // Stage 6 renders groups as a compact table that supplements, never replaces, the findings,
    // and marks each group as an apply-queue or a decision-gate for downstream actors
    const stage6 = content.split("### Stage 6: Synthesize and present")[1].split("## Quality Gates")[0]
    expect(stage6).toMatch(/render a `### Triage Groups` section before the findings/)
    expect(stage6).toContain("| Group | Findings | Context | Preferred Resolution | Why |")
    expect(stage6).toMatch(/groups supplement the findings, never replace them/i)
    expect(stage6).toMatch(/apply-queue or a decision-gate/i)

    // Template carries the canonical skeleton and formatting rule
    expect(template).toContain("### Triage Groups")
    expect(template).toContain("| Group | Findings | Context | Preferred Resolution | Why |")
    expect(template).toMatch(/never replace the severity tables, merge findings, or renumber them/)

    // Fixture group references resolve to primary finding numbers
    const primaryFindingIds = Array.from(
      fixture.matchAll(/^\| (\d+) \| `[^`]+` \| .* \| .* \| \d+ \|$/gm),
      ([, id]) => Number(id),
    )
    const groupSection = fixture.split("### Triage Groups")[1].split("\n### ")[0]
    const groupIds = Array.from(groupSection.matchAll(/#(\d+)/g), ([, id]) => Number(id))
    expect(groupIds.length).toBeGreaterThan(0)
    expect(groupIds.every((id) => primaryFindingIds.includes(id))).toBe(true)

    // mode:agent carries groups in the JSON contract instead of a markdown section
    expect(content).toContain('"triage_groups": []')
    expect(content).toMatch(/Each object in `triage_groups` carries/)
    expect(template).toMatch(/`triage_groups`.*batch related fixes by theme/)
  })
})

describe("testing-reviewer contract", () => {
  test("includes behavioral-changes-with-no-test-additions check", async () => {
    const content = await readRepoFile(personaPromptPath("testing-reviewer"))

    // New check exists in "What you're hunting for" section
    expect(content).toContain("Behavioral changes with no test additions")

    // Check is distinct from untested branches check
    expect(content).toContain("distinct from untested branches")

    // Non-behavioral changes are excluded
    expect(content).toContain("Non-behavioral changes")
  })
})
