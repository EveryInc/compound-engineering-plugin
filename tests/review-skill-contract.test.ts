import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"
import { parseFrontmatter } from "../src/utils/frontmatter"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-code-review contract", () => {
  test("documents explicit modes and orchestration boundaries", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

    expect(content).toContain("## Argument Parsing")
    expect(content).toContain("mode:agent")
    // Dead mode tokens are demolished — only mode:agent is a real mode.
    expect(content).not.toContain("mode:headless")
    expect(content).not.toContain("mode:autofix")
    expect(content).not.toContain("mode:report-only")
    expect(content).not.toContain("Deprecated alias")
    expect(content).toContain("/tmp/compound-engineering/ce-code-review/<run-id>/")
    expect(content).toMatch(/Never push, open PRs, or file tickets/i)
    expect(content).toContain("run artifact")
    expect(content).toMatch(/check out the PR branch/i)
    expect(content).toMatch(/Never run `gh pr checkout`/i)
    expect(content).not.toContain("Which severities should I fix?")
  })

  test("keeps plan requirements completeness compatible with current and legacy unit formats", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

    expect(content).toContain("current numeric subsections")
    expect(content).toContain("`### U1.`")
    expect(content).toContain("`### Unit 1:`")
    expect(content).toContain("legacy bullet or checkbox unit entries")
    expect(content).toContain("unaddressed requirements or implementation units")
  })

  test("documents agent mode contract for programmatic callers", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

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

    // Dead mode tokens are demolished — only mode:agent is recognized
    expect(content).not.toContain("mode:headless")
    expect(content).not.toContain("mode:autofix")
    expect(content).not.toContain("mode:report-only")
    expect(content).not.toContain("Deprecated alias")
  })

  test("documents policy-driven routing and actionable handoff", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

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
      "plugins/compound-engineering/skills/ce-code-review/references/subagent-template.md",
    )
    expect(subagentTemplate).toMatch(/observable behavior/i)
    expect(subagentTemplate).toMatch(/required/i)

    expect(content).toContain("Do not offer push/PR/create-branch next steps from this skill.")
  })

  test("keeps findings schema and downstream docs aligned", async () => {
    const rawSchema = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/findings-schema.json",
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
      "plugins/compound-engineering/skills/ce-code-review/references/subagent-template.md",
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
      "plugins/compound-engineering/skills/ce-code-review/references/subagent-template.md",
    )

    expect(template).toContain("references/action-class-rubric.md")
    expect(template).not.toContain("safe_auto")
    expect(template).not.toContain("review-fixer")
    expect(template).toMatch(/gated_auto.*manual.*advisory/s)
  })

  test("action-class rubric defines caller routing without safe_auto", async () => {
    const rubric = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/action-class-rubric.md",
    )

    expect(rubric).toContain("gated_auto")
    expect(rubric).toContain("manual")
    expect(rubric).toContain("advisory")
    expect(rubric).toMatch(/Do \*\*not\*\* emit `safe_auto`/)
    expect(rubric).toMatch(/Do not use `review-fixer`/i)
  })

  test("Stage 4 spawning restates model-override imperative at point of action", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

    // Model tiering subsection still enumerates the three session-model exceptions
    expect(content).toMatch(/ce-correctness-reviewer.*ce-security-reviewer.*ce-adversarial-reviewer/s)

    // Imperative lives inside the Spawning subsection, not only in the rationale block.
    // Extract the Spawning subsection and assert the model-override directive appears there
    // with cross-platform dispatch primitives named at the call site.
    const spawningMatch = content.match(/#### Spawning\n([\s\S]*?)(?=\n####|\n### )/)
    expect(spawningMatch).not.toBeNull()
    const spawning = spawningMatch![1]

    expect(spawning).toMatch(/Model override at dispatch time/)
    expect(spawning).toContain('model: "sonnet"')
    expect(spawning).toContain("Agent")
    expect(spawning).toContain("spawn_agent")
    expect(spawning).toContain("subagent")
    expect(spawning).toMatch(/Bounded parallel dispatch/)
    expect(spawning).toMatch(/active-subagent limit/)
    expect(spawning).toMatch(/spawn errors as backpressure, not reviewer failure/)
    expect(spawning).toMatch(/fill freed slots/)
    // Exceptions are restated at point of action so the agent does not have to recall them
    // from the Model tiering subsection above during a 12-agent parallel dispatch.
    expect(spawning).toContain("ce-correctness-reviewer")
    expect(spawning).toContain("ce-security-reviewer")
    expect(spawning).toContain("ce-adversarial-reviewer")
  })

  test("Stage 5 synthesis uses anchor gate and one-anchor promotion", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

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
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")
    const validatorTemplate = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/validator-template.md",
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
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")
    const template = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/review-output-template.md",
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

  test("findings use terse cell + keyed detail line, mirror the template, stay consistent across severities", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")
    const template = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/review-output-template.md",
    )

    // Render-time load of the canonical skeleton (not just "see the template")
    expect(content).toContain("load `references/review-output-template.md` and mirror")
    expect(template).toContain("canonical skeleton")

    // Terse cell + keyed detail line is the sanctioned home for depth
    expect(content).toMatch(/keyed detail line/i)
    expect(template).toMatch(/Detail line \(per finding/i)
    expect(template).toMatch(/\*\*#N\*\*/)

    // Terse-cell discipline carries a concrete named test (not just "terse")
    expect(content).toMatch(/one short clause/i)
    expect(template).toMatch(/one short clause/i)

    // Consistency across severities is enforced (the failure seen in the wild: P1 blocks vs P2/P3 tables)
    expect(content).toMatch(/Inconsistent treatment across severities/i)

    // Multi-file applied fix is one row with one number (no duplicate #)
    expect(template).toMatch(/one row with one `#`/i)
  })

  test("PR-mode skip-condition pre-check stops without dispatching reviewers", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

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
    expect(content).toMatch(/model.*haiku/i)
    expect(content).not.toMatch(/chore\\?\(deps\\?\)/)

    // Skip cleanly without dispatching reviewers
    expect(content).toMatch(/stop without dispatching reviewers/)

    // Standalone, base:, and branch-remote paths unaffected by PR skip rules
    expect(content).toMatch(/Standalone.*`base:`.*branch-remote/)
  })

  test("remote scope modes forbid workspace inspection on wrong tree", async () => {
    const skill = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")
    const diffScope = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/diff-scope.md",
    )
    const validator = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/validator-template.md",
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
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

    // Mode-aware demotion step exists (sub-step within Stage 5; numbering may shift if steps reorder)
    expect(content).toMatch(/Mode-aware demotion of weak general-quality findings/i)

    // Conservative scope: testing persona only (maintainability findings now arrive
    // tagged `correctness` and are not demotable as a testing-only signal).
    expect(content).toContain("The only** contributing reviewer is `testing`")

    // Severity P2 or P3 only (P0/P1 always stay primary)
    expect(content).toMatch(/Severity is P2 or P3/)

    // autofix_class is advisory
    expect(content).toMatch(/`autofix_class` is `advisory`/)

    // Route demoted findings to the testing_gaps soft bucket. Maintainability
    // findings no longer have a demotion path (they arrive tagged `correctness`
    // after the persona merge), so residual_risks is no longer a demotion target.
    expect(content).toMatch(/`testing_gaps`/)

    // Demotion entry uses title-only (compact return omits why_it_matters)
    expect(content).toMatch(/append `<file:line> -- <title>` to/)
    expect(content).toMatch(/compact return omits/i)

    // Coverage section reports demotion count
    expect(content).toMatch(/mode-aware demotion/)
  })

  test("personas use anchored rubric language and no float references remain", async () => {
    const personas = [
      "ce-correctness-reviewer",
      "ce-testing-reviewer",
      "ce-security-reviewer",
      "ce-performance-reviewer",
      "ce-adversarial-reviewer",
      "ce-previous-comments-reviewer",
    ]

    for (const persona of personas) {
      const content = await readRepoFile(`plugins/compound-engineering/agents/${persona}.md`)

      // Anchored language appears
      expect(content).toMatch(/Anchor (75|100)/)
      expect(content).toMatch(/Anchor 25 or below.*suppress/i)

      // No float confidence references
      expect(content).not.toMatch(/0\.\d{2}\+/)
      expect(content).not.toMatch(/0\.60-0\.79/)
      expect(content).not.toMatch(/below 0\.60/)
    }
  })

  test("JSON-pipeline persona agents grant Write so they can save run artifacts", async () => {
    // The ce-code-review subagent template instructs each persona to write its full
    // analysis to /tmp/compound-engineering/ce-code-review/{run_id}/{reviewer}.json.
    // Without Write in tools, that "one permitted write" cannot happen and headless
    // detail enrichment loses its Why:/Evidence: source. See issue #733.
    const personas = [
      "ce-correctness-reviewer",
      "ce-testing-reviewer",
      "ce-security-reviewer",
      "ce-performance-reviewer",
      "ce-adversarial-reviewer",
      "ce-previous-comments-reviewer",
    ]

    for (const persona of personas) {
      const content = await readRepoFile(`plugins/compound-engineering/agents/${persona}.md`)
      const parsed = parseFrontmatter(content)
      const tools = String(parsed.data.tools ?? "")

      expect(tools).toContain("Write")
    }
  })

  test("PR mode uses gh pr diff without checkout; branch/standalone fail closed on missing base", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

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

  test("ce-work documents review-findings followup after Tier 2", async () => {
    const followup = await readRepoFile(
      "plugins/compound-engineering/skills/ce-work/references/review-findings-followup.md",
    )
    const skill = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")
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
      "plugins/compound-engineering/skills/ce-work/references/shipping-workflow.md",
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
      expect(workflow).toContain("If the user later chooses the no-PR commit-only path")
      expect(workflow).toContain("must not live only in the transient session")
    }
  })

  test("ce-code-review emits actionable findings summary for callers", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")
    expect(content).toContain("### Emit actionable findings summary")
    expect(content).toContain("Actionable Findings")
    expect(content).toContain("with stable `#`, severity, file:line, title, `autofix_class`")
    expect(content).toContain("Actionable findings: none.")
  })

  test("ce-code-review uses stable sequential finding numbers across grouped output", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")
    const template = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/review-output-template.md",
    )
    const fixture = await readRepoFile("tests/fixtures/ce-code-review-stable-numbering.md")

    const stage5 = content.split("### Stage 5b:")[0].split("### Stage 5:")[1]
    expect(stage5).toMatch(/Sort and number/)
    expect(stage5).toMatch(/Do not restart numbering inside each severity table or autofix\/routing bucket/)
    expect(stage5).toMatch(/reuse the same stable `#`/)
    expect(stage5).toMatch(/downstream workflows/)

    const stage6 = content.split("### Headless output format")[0].split("### Stage 6: Synthesize and present")[1]
    expect(stage6).toContain("Finding numbers come from the stable assignment in Stage 5")
    expect(stage6).toContain("never re-derive them per severity table")
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
})

describe("testing-reviewer contract", () => {
  test("includes behavioral-changes-with-no-test-additions check", async () => {
    const content = await readRepoFile("plugins/compound-engineering/agents/ce-testing-reviewer.md")

    // New check exists in "What you're hunting for" section
    expect(content).toContain("Behavioral changes with no test additions")

    // Check is distinct from untested branches check
    expect(content).toContain("distinct from untested branches")

    // Non-behavioral changes are excluded
    expect(content).toContain("Non-behavioral changes")
  })
})
