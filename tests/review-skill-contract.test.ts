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

    expect(content).toContain("## Mode Detection")
    expect(content).toContain("mode:autofix")
    expect(content).toContain("mode:report-only")
    expect(content).toContain("mode:headless")
    expect(content).toContain("/tmp/compound-engineering/ce-code-review/<run-id>/")
    expect(content).toContain("Do not write run artifacts.")
    expect(content).toContain(
      "Do not start a mutating review round concurrently with browser testing on the same checkout.",
    )
    expect(content).toContain("mode:report-only cannot switch the shared checkout to review a PR target")
    expect(content).toContain("mode:report-only cannot switch the shared checkout to review another branch")
    expect(content).toContain("Resolve the base ref from the PR's actual base repository, not by assuming `origin`")
    expect(content).not.toContain("Which severities should I fix?")
  })

  test("documents headless mode contract for programmatic callers", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

    // Headless mode has its own rules section
    expect(content).toContain("### Headless mode rules")

    // No interactive prompts (cross-platform)
    expect(content).toContain(
      "Never use the platform question tool",
    )

    // Structured output format
    expect(content).toContain("### Headless output format")
    expect(content).toContain("Code review complete (headless mode).")
    expect(content).toContain('"Review complete" as the terminal signal')

    // Applies safe_auto fixes but NOT safe for concurrent use
    expect(content).toContain(
      "Not safe for concurrent use on a shared checkout.",
    )

    // Writes artifacts but no externalized work, no commit/push/PR
    expect(content).toContain("Do not file tickets or externalize work.")
    expect(content).toContain(
      "Never commit, push, or create a PR",
    )

    // Single-pass fixing, no bounded re-review rounds
    expect(content).toContain("No bounded re-review rounds")

    // Checkout guard — headless shares report-only's guard
    expect(content).toMatch(/mode:headless.*must run in an isolated checkout\/worktree or stop/)

    // Conflicting mode flags
    expect(content).toContain("**Conflicting mode flags:**")

    // Structured error for missing scope
    expect(content).toContain("Review failed (headless mode). Reason: no diff scope detected.")

    // Degraded signal when all reviewers fail
    expect(content).toContain("Code review degraded (headless mode).")
  })

  test("documents policy-driven routing and residual handoff", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

    // Routing taxonomy and fixer queue semantics
    expect(content).toContain("## Action Routing")
    expect(content).toContain("Only `safe_auto -> review-fixer` enters the in-skill fixer queue automatically.")

    // Interactive mode four-option routing structure: each distinguishing word must appear
    // as a routing-option label so truncation-safe menus stay intact.
    // Assert presence rather than exact copy — wording can be improved without breaking the test.
    expect(content).toMatch(/\(A\)\s*`Review each finding one by one/)
    expect(content).toMatch(/\(B\)\s*Auto-resolve with best judgment/)
    expect(content).toMatch(/\(C\)\s*`File a \[TRACKER\] ticket/)
    expect(content).toMatch(/\(D\)\s*`Report only/)

    // The new routing question dispatches to focused reference files, not inline prose.
    // bulk-preview.md is now invoked by option C only (the best-judgment path no longer uses it).
    expect(content).toContain("references/walkthrough.md")
    expect(content).toContain("references/bulk-preview.md")
    expect(content).toContain("references/tracker-defer.md")
    // Option C still references bulk-preview; option B does not.
    expect(content).toMatch(/\(C\)\s*`File a \[TRACKER\][^\n]*?references\/bulk-preview\.md/s)

    // Stem is third-person (AGENTS.md:127 — no first-person "I" / "me" in the new routing question).
    // The Interactive branch of After Review Step 2 must not reintroduce the removed bucket-policy wording.
    expect(content).not.toContain("What should I do with the remaining findings?")
    expect(content).not.toContain("What should I do?")

    // Zero-remaining case: routing question is skipped with a completion summary.
    expect(content).toMatch(/skip the routing question entirely/i)

    // Stage 5 tie-breaking rule — the walk-through's recommendation is deterministic.
    expect(content).toMatch(/Skip\s*>\s*Defer\s*>\s*Apply/)

    // Autofix-mode residual handoff is the run artifact (file-based todo system removed).
    expect(content).toContain(
      "In autofix mode, the run artifact is the handoff.",
    )
    expect(content).not.toContain("ce-todo-create")
    expect(content).not.toContain("create durable todo files")

    // Tracker fallback chain still exists for defer actions.
    const trackerDefer = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/tracker-defer.md",
    )
    expect(trackerDefer).toContain("Named tracker")
    expect(trackerDefer).toContain("GitHub Issues via `gh`")
    expect(trackerDefer).not.toContain(".context/compound-engineering/todos/")
    expect(content).not.toMatch(/harness task primitive|task-tracking primitive/)

    // Harness task-tracking primitive is no longer a fallback tier — it was removed
    // because in-session tasks do not meet the durable-filing intent of a Defer action.
    expect(trackerDefer).not.toMatch(/Harness task primitive \(last resort\)/)
    expect(trackerDefer).not.toMatch(/Once-per-session harness-fallback confirmation/)
    expect(trackerDefer).not.toMatch(/no-sink/)

    // Non-interactive execution mode exists for autonomous callers (e.g., lfg).
    expect(trackerDefer).toContain("## Execution Modes")
    expect(trackerDefer).toContain("Non-interactive mode")
    expect(trackerDefer).toMatch(/no_sink/)

    // Subagent template carries the why_it_matters framing guidance that replaces the
    // rejected synthesis-time rewrite pass. Assert presence of the observable-behavior
    // rule and the required-field reminder without pinning exact prose.
    const subagentTemplate = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/subagent-template.md",
    )
    expect(subagentTemplate).toMatch(/observable behavior/i)
    expect(subagentTemplate).toMatch(/required/i)

    // walkthrough.md carries the four per-finding option labels (Apply / Defer / Skip /
    // Auto-resolve with best judgment on the rest). Assert presence of each distinguishing
    // word so renaming an option breaks the test. Exact label wording may be refined for
    // clarity — these assertions check the structural contract, not the prose.
    const walkthrough = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/walkthrough.md",
    )
    expect(walkthrough).toContain("Apply the proposed fix")
    expect(walkthrough).toContain("Defer — file a [TRACKER] ticket")
    expect(walkthrough).toContain("Skip — don't apply, don't track")
    expect(walkthrough).toMatch(/Auto-resolve with best judgment on the rest/)

    // bulk-preview.md contract: exactly Proceed / Cancel, no third option.
    const bulkPreview = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/bulk-preview.md",
    )
    expect(bulkPreview).toContain("Proceed")
    expect(bulkPreview).toContain("Cancel")

    // Step 5 final-next-steps flow is gated on fixes-applied count, not routing option.
    expect(content).toContain("fixes_applied_count")
    expect(content).toMatch(/Step 5 runs only when `fixes_applied_count > 0`/i)

    // Final-next-steps wording preserved.
    expect(content).toContain("**On the resolved review base/default branch:**")
    expect(content).toContain("git push --set-upstream origin HEAD")
    expect(content).not.toContain("**On main/master:**")
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
      "safe_auto",
      "gated_auto",
      "manual",
      "advisory",
    ])
    expect(schema.properties.findings.items.properties.owner.enum).toEqual([
      "review-fixer",
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

  test("autofix_class decision guide includes safe_auto operational test and boundary cases", async () => {
    const template = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/subagent-template.md",
    )

    // Symmetry-of-error framing: classifying a mechanical fix as gated_auto has cost
    expect(template).toMatch(/wrong-side cost is symmetric/i)
    expect(template).toMatch(/Bias toward `safe_auto`/i)

    // Operational test for safe_auto: one-sentence + no-contract-change exclusion list
    expect(template).toMatch(/one sentence with no .depends on. clauses/i)
    expect(template).toMatch(/function signature.*public-API.*error contract.*security posture.*permission model/i)

    // The four boundary cases that often feel risky but are still safe_auto
    expect(template).toMatch(/Boundary cases that often feel risky but are still `safe_auto`/i)
    expect(template).toMatch(/nil guard that turns a crash into a nil-return is `safe_auto`/i)
    expect(template).toMatch(/off-by-one fix is `safe_auto`/i)
    expect(template).toMatch(/Dead-code removal is `safe_auto`/i)
    expect(template).toMatch(/Helper extraction is `safe_auto`/i)

    // Cross-file extraction discriminator (the F4b case from the calibration eval)
    expect(template).toMatch(/naming or placement requires a design conversation/i)

    // Anti-default guards on both sides
    expect(template).toMatch(/Do not default to `advisory`/i)
    expect(template).toMatch(/Do not default to `gated_auto` when the fix is mechanical/i)
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

    // Mode-conditional dispatch — runs on autofix/headless/option C; explicitly does NOT
    // run on the best-judgment path (option B and walk-through's auto-resolve-the-rest).
    expect(content).toContain("`headless`")
    expect(content).toContain("`autofix`")
    expect(content).toContain("walk-through routing (option A)")
    expect(content).toContain("best-judgment routing (option B)")
    expect(content).toContain("File-tickets routing (option C)")
    expect(content).toMatch(/Report-only routing.*nothing is being externalized/i)

    // Best-judgment path explicitly skips Stage 5b — the fixer's apply/fail outcome is the validation.
    expect(content).toMatch(/best-judgment routing \(option B\) \| No --/)
    expect(content).toMatch(/best-judgment-the-rest handoff \| No --/)
    expect(content).toMatch(/best-judgment path skips Stage 5b deliberately/i)

    // Per-finding parallel dispatch (not batched)
    expect(content).toMatch(/per.finding parallel dispatch/i)
    expect(content).toMatch(/Independence is the point/i)

    // Budget cap of 15
    expect(content).toMatch(/exceeds 15 findings/i)
    expect(content).toMatch(/highest-severity 15.*Drop the remainder/i)

    // Option C invokes validation before externalizing (option B no longer does).
    expect(content).toMatch(/\(C\)\s*`File a \[TRACKER\].*first run Stage 5b validation/)
    expect(content).not.toMatch(/\(B\).*first run Stage 5b validation/)

    // Option B dispatches the fixer immediately — no Stage 5b, no bulk-preview.
    expect(content).toMatch(/\(B\)\s*`Auto-resolve with best judgment.*dispatch the fixer subagent.*immediately/i)
    expect(content).toMatch(/No Stage 5b validator pre-pass/i)
    expect(content).toMatch(/No bulk-preview approval gate/i)

    // Validator template exists and is read-only
    expect(validatorTemplate).toContain("independent validator")
    expect(validatorTemplate).toContain("operationally read-only")
    expect(validatorTemplate).toContain('"validated": true | false')
    expect(validatorTemplate).toMatch(/introduced by THIS diff/i)
    expect(validatorTemplate).toMatch(/handled elsewhere/i)
  })

  test("best-judgment path post-run failure-handling question fires only when failed bucket non-empty", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

    // Post-run question fires when the fixer's `failed` bucket is non-empty.
    expect(content).toMatch(/N findings could not be auto-resolved/)
    expect(content).toContain("File tickets for these")
    expect(content).toContain("Walk through these one at a time")
    expect(content).toContain("Ignore — leave them in the report")

    // Sink-availability rule mirrors tracker-defer.md: omit file-tickets when no sink.
    expect(content).toMatch(/Omit this option when.*any_sink_available\s*=\s*false/i)
  })

  test("fixer subagent contract supports heterogeneous best-judgment queue", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

    // Step 3 documents both queue shapes: homogeneous (autofix/headless/walk-through Apply)
    // and heterogeneous (best-judgment path with gated_auto + manual + advisory).
    expect(content).toMatch(/Heterogeneous queue/i)
    expect(content).toMatch(/`gated_auto`,\s*`manual`,\s*and\s*`advisory`/i)

    // Fixer routes items by class with explicit reason taxonomy for the failed bucket.
    expect(content).toMatch(/no fix proposed by reviewer/i)
    expect(content).toMatch(/evidence no longer matches code/i)
    expect(content).toMatch(/fix did not apply cleanly/i)

    // Best-judgment path is single-pass; bounded re-review applies to autofix and walk-through Apply.
    expect(content).toMatch(/Best-judgment path is single-pass/i)
    expect(content).toMatch(/max_rounds:\s*2/)

    // Fixer return shape includes the {applied, failed, advisory} partition.
    expect(content).toMatch(/\{applied,\s*failed,\s*advisory\}/)
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

    // Standalone branch and base: modes unaffected
    expect(content).toMatch(/Standalone branch mode and `base:` mode are unaffected/)
  })

  test("mode-aware demotion routes weak general-quality findings to soft buckets", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

    // Mode-aware demotion step exists (sub-step within Stage 5; numbering may shift if steps reorder)
    expect(content).toMatch(/Mode-aware demotion of weak general-quality findings/i)

    // Conservative scope: testing + maintainability personas only
    expect(content).toContain("`testing` or `maintainability`")

    // Severity P2 or P3 only (P0/P1 always stay primary)
    expect(content).toMatch(/Severity is P2 or P3/)

    // autofix_class is advisory
    expect(content).toMatch(/`autofix_class` is `advisory`/)

    // Interactive/report-only: route to testing_gaps or residual_risks
    expect(content).toMatch(/`testing`,?\s*append.*`testing_gaps`/)
    expect(content).toMatch(/`maintainability`,?\s*append.*`residual_risks`/)

    // Demotion entry uses title-only (compact return omits why_it_matters; report-only has no artifact)
    expect(content).toMatch(/append `<file:line> -- <title>` to/)
    expect(content).toMatch(/title only.*compact return omits/i)

    // Headless/autofix: suppress entirely
    expect(content).toMatch(/Headless and autofix modes.*Suppress/)

    // Coverage section reports demotion count
    expect(content).toMatch(/mode-aware demotion/)
  })

  test("personas use anchored rubric language and no float references remain", async () => {
    const personas = [
      "ce-correctness-reviewer",
      "ce-testing-reviewer",
      "ce-maintainability-reviewer",
      "ce-project-standards-reviewer",
      "ce-security-reviewer",
      "ce-performance-reviewer",
      "ce-api-contract-reviewer",
      "ce-data-migrations-reviewer",
      "ce-reliability-reviewer",
      "ce-adversarial-reviewer",
      "ce-cli-readiness-reviewer",
      "ce-previous-comments-reviewer",
      "ce-dhh-rails-reviewer",
      "ce-kieran-rails-reviewer",
      "ce-kieran-python-reviewer",
      "ce-kieran-typescript-reviewer",
      "ce-julik-frontend-races-reviewer",
      "ce-swift-ios-reviewer",
      "ce-agent-native-reviewer",
    ]

    for (const persona of personas) {
      const content = await readRepoFile(`plugins/compound-engineering/agents/${persona}.agent.md`)

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
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")
    const catalog = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/persona-catalog.md",
    )

    for (const agent of [
      "ce-dhh-rails-reviewer",
      "ce-kieran-rails-reviewer",
      "ce-kieran-python-reviewer",
      "ce-kieran-typescript-reviewer",
      "ce-julik-frontend-races-reviewer",
    ]) {
      expect(content).toContain(agent)
      expect(catalog).toContain(agent)
    }

    expect(content).toContain("## Language-Aware Conditionals")
    expect(content).not.toContain("## Language-Agnostic")
  })

  test("stack-specific reviewer agents follow the structured findings contract", async () => {
    const reviewers = [
      {
        path: "plugins/compound-engineering/agents/ce-dhh-rails-reviewer.agent.md",
        reviewer: "dhh-rails",
      },
      {
        path: "plugins/compound-engineering/agents/ce-kieran-rails-reviewer.agent.md",
        reviewer: "kieran-rails",
      },
      {
        path: "plugins/compound-engineering/agents/ce-kieran-python-reviewer.agent.md",
        reviewer: "kieran-python",
      },
      {
        path: "plugins/compound-engineering/agents/ce-kieran-typescript-reviewer.agent.md",
        reviewer: "kieran-typescript",
      },
      {
        path: "plugins/compound-engineering/agents/ce-julik-frontend-races-reviewer.agent.md",
        reviewer: "julik-frontend-races",
      },
    ]

    for (const reviewer of reviewers) {
      const content = await readRepoFile(reviewer.path)
      const parsed = parseFrontmatter(content)
      const tools = String(parsed.data.tools ?? "")

      expect(String(parsed.data.description)).toContain("Conditional code-review persona")
      expect(tools).toContain("Read")
      expect(tools).toContain("Grep")
      expect(tools).toContain("Glob")
      expect(tools).toContain("Bash")
      expect(content).toContain("## Confidence calibration")
      expect(content).toContain("## What you don't flag")
      expect(content).toContain("Return your findings as JSON matching the findings schema. No prose outside the JSON.")
      expect(content).toContain(`"reviewer": "${reviewer.reviewer}"`)
    }
  })

  test("leaves data-migration-expert as the unstructured review format", async () => {
    const content = await readRepoFile(
      "plugins/compound-engineering/agents/ce-data-migration-expert.agent.md",
    )

    expect(content).toContain("## Reviewer Checklist")
    expect(content).toContain("Refuse approval until there is a written verification + rollback plan.")
    expect(content).not.toContain("Return your findings as JSON matching the findings schema.")
  })

  test("fails closed when merge-base is unresolved instead of falling back to git diff HEAD", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

    // No scope path should fall back to `git diff HEAD` or `git diff --cached` — those only
    // show uncommitted changes and silently produce empty diffs on clean feature branches.
    expect(content).not.toContain("git diff --name-only HEAD")
    expect(content).not.toContain("git diff -U10 HEAD")
    expect(content).not.toContain("git diff --cached")

    // PR mode still has an inline error for unresolved base
    expect(content).toContain('echo "ERROR: Unable to resolve PR base branch')

    // Branch and standalone modes delegate to resolve-base.sh and check its ERROR: output.
    // The script itself emits ERROR: when the base is unresolved.
    expect(content).toContain("references/resolve-base.sh")
    const resolveScript = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/resolve-base.sh",
    )
    expect(resolveScript).toContain("ERROR:")

    // Branch and standalone modes must stop on script error, not fall back
    expect(content).toContain(
      "If the script outputs an error, stop instead of falling back to `git diff HEAD`",
    )
  })

  test("orchestration callers pass explicit mode flags", async () => {
    const lfg = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")
    expect(lfg).toMatch(/ce-code-review[^\n]*mode:autofix/)
  })

  test("ce-work shipping-workflow enforces a residual-work gate after Tier 2 review", async () => {
    for (const path of [
      "plugins/compound-engineering/skills/ce-work/references/shipping-workflow.md",
      "plugins/compound-engineering/skills/ce-work-beta/references/shipping-workflow.md",
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
    const lfg = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")
    await expect(readRepoFile("plugins/compound-engineering/skills/lfg/references/tracker-defer.md")).resolves.toContain(
      "Non-interactive mode",
    )
    await expect(readRepoFile("plugins/compound-engineering/skills/lfg/references/tracker-defer.md")).resolves.not.toMatch(
      /no-sink/,
    )

    // Autonomous residual handoff step exists between code review and test-browser.
    expect(lfg).toContain("Persist review autofixes")
    expect(lfg).toContain("fix(review): apply autofix feedback")
    expect(lfg).toContain("Do not proceed to step 5, run browser tests, or output DONE while review autofix edits remain only in the working tree.")
    expect(lfg).toContain("there were no review autofixes to persist")
    expect(lfg).toContain("Autonomous residual handoff")
    expect(lfg).toMatch(/Do not prompt the user/)

    // tracker-defer is invoked in non-interactive mode.
    expect(lfg).toContain("references/tracker-defer.md")
    expect(lfg).not.toContain("plugins/compound-engineering/skills/ce-code-review/references/tracker-defer.md")
    expect(lfg).toMatch(/non-interactive mode/)

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
    expect(lfg).toContain("Do not output DONE until either the existing PR body has been updated or this fallback file commit has been pushed.")

    // Autopilot contract: never prompt, but require a durable sink before DONE.
    expect(lfg).toContain("Do not prompt the user")
    expect(lfg).toMatch(/Never block DONE on tracker filing failures/i)
  })

  test("ce-code-review autofix emits a residual-work summary in-chat, not only in the artifact", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")
    expect(content).toMatch(/Emit a compact Residual Actionable Work summary/)
    expect(content).toContain("Residual actionable work: none.")
  })
})

describe("testing-reviewer contract", () => {
  test("includes behavioral-changes-with-no-test-additions check", async () => {
    const content = await readRepoFile("plugins/compound-engineering/agents/ce-testing-reviewer.agent.md")

    // New check exists in "What you're hunting for" section
    expect(content).toContain("Behavioral changes with no test additions")

    // Check is distinct from untested branches check
    expect(content).toContain("distinct from untested branches")

    // Non-behavioral changes are excluded
    expect(content).toContain("Non-behavioral changes")
  })
})
