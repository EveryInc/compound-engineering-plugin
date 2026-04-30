import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-work review contract", () => {
  test("requires code review before shipping", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")
    // Review content extracted to references/shipping-workflow.md
    const shipping = await readRepoFile("plugins/compound-engineering/skills/ce-work/references/shipping-workflow.md")

    // SKILL.md should not contain extracted content
    expect(content).not.toContain("3. **Code Review**")
    expect(content).not.toContain("Consider Code Review")
    expect(content).not.toContain("Code Review** (Optional)")

    // Phase 3 has a Claude-Code-only Simplify step at position 2 (gated on >=30 LOC)
    // and a mandatory code review at position 3
    expect(shipping).toContain("2. **Simplify**")
    expect(shipping).toContain("Claude Code only")
    expect(shipping).toContain("3. **Code Review**")

    // Two-tier rubric in reference file: Tier 1 is harness-native (default),
    // Tier 2 is ce-code-review (risk-based escalation)
    expect(shipping).toContain("**Tier 1 -- harness-native code review (default).**")
    expect(shipping).toContain("**Tier 2 -- `ce-code-review` (escalation).**")
    expect(shipping).toContain("ce-code-review")
    expect(shipping).toContain("mode:autofix")

    // Quality checklist includes review
    expect(shipping).toContain("Code review completed (Tier 1 harness-native or Tier 2 `ce-code-review`)")
  })

  test("delegates commit and PR to dedicated skills", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")
    // Commit/PR delegation content extracted to references/shipping-workflow.md
    const shipping = await readRepoFile("plugins/compound-engineering/skills/ce-work/references/shipping-workflow.md")

    expect(shipping).toContain("`ce-commit-push-pr` skill")
    expect(shipping).toContain("`ce-commit` skill")

    // Should not contain inline PR templates or attribution placeholders
    expect(content).not.toContain("gh pr create")
    expect(content).not.toContain("[HARNESS_URL]")
  })

  test("ce-work-beta mirrors review and commit delegation", async () => {
    const beta = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/SKILL.md")
    // Review/commit content extracted to references/shipping-workflow.md
    const shipping = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/references/shipping-workflow.md")

    // Extracted content in reference file: Simplify step at position 2,
    // Code Review at position 3
    expect(shipping).toContain("2. **Simplify**")
    expect(shipping).toContain("3. **Code Review**")
    expect(shipping).toContain("`ce-commit-push-pr` skill")
    expect(shipping).toContain("`ce-commit` skill")

    // Negative assertions stay on SKILL.md
    expect(beta).not.toContain("Consider Code Review")
    expect(beta).not.toContain("gh pr create")
  })

  test("includes per-task testing deliberation in execution loop", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    // Testing deliberation exists in the execution loop
    expect(content).toContain("Assess testing coverage")

    // Deliberation is between "Run tests after changes" and "Mark task as completed"
    const runTestsIdx = content.indexOf("Run tests after changes")
    const assessIdx = content.indexOf("Assess testing coverage")
    const markDoneIdx = content.indexOf("Mark task as completed")
    expect(runTestsIdx).toBeLessThan(assessIdx)
    expect(assessIdx).toBeLessThan(markDoneIdx)
  })

  test("quality checklist says 'Testing addressed' not 'Tests pass'", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")
    // Quality checklist extracted to references/shipping-workflow.md
    const shipping = await readRepoFile("plugins/compound-engineering/skills/ce-work/references/shipping-workflow.md")

    // New language present in reference file
    expect(shipping).toContain("Testing addressed")

    // Old language fully removed from both
    expect(content).not.toContain("Tests pass (run project's test command)")
    expect(content).not.toContain("- All tests pass")
    expect(shipping).not.toContain("Tests pass (run project's test command)")
  })

  test("ce-work-beta mirrors testing deliberation and checklist changes", async () => {
    const beta = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/SKILL.md")
    // Checklist extracted to references/shipping-workflow.md
    const shipping = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/references/shipping-workflow.md")

    // Testing deliberation stays in SKILL.md (Phase 2 content)
    expect(beta).toContain("Assess testing coverage")

    // New checklist language in reference file
    expect(shipping).toContain("Testing addressed")

    // Old language removed from both
    expect(beta).not.toContain("Tests pass (run project's test command)")
    expect(beta).not.toContain("- All tests pass")
    expect(shipping).not.toContain("Tests pass (run project's test command)")
  })

  test("SKILL.md stub points to shipping-workflow reference", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    // Stub references the shipping-workflow file
    expect(content).toContain("`references/shipping-workflow.md`")

    // Extracted content is not in SKILL.md
    expect(content).not.toContain("3. **Code Review**")
    expect(content).not.toContain("## Quality Checklist")
    expect(content).not.toContain("## Code Review Tiers")
  })

  test("ce:work-beta SKILL.md stub points to shipping-workflow reference", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/SKILL.md")

    // Stub references the shipping-workflow file
    expect(content).toContain("`references/shipping-workflow.md`")

    // Extracted content is not in SKILL.md
    expect(content).not.toContain("3. **Code Review**")
    expect(content).not.toContain("## Quality Checklist")
    expect(content).not.toContain("## Code Review Tiers")
  })

  test("ce:work remains the stable non-delegating surface", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    expect(content).not.toContain("## Argument Parsing")
    expect(content).not.toContain("## Codex Delegation Mode")
    expect(content).not.toContain("delegate:codex")
  })
})

describe("ce:work-beta codex delegation contract", () => {
  test("has argument parsing with delegate tokens", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/SKILL.md")

    // Argument parsing section exists with delegation tokens
    expect(content).toContain("## Argument Parsing")
    expect(content).toContain("`delegate:codex`")
    expect(content).toContain("`delegate:local`")

    // Resolution chain present
    expect(content).toContain("### Settings Resolution Chain")
    expect(content).toContain("work_delegate")
    expect(content).toContain("config.local.yaml")
  })

  test("argument-hint includes delegate:codex for discoverability", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/SKILL.md")

    expect(content).toContain("argument-hint:")
    expect(content).toContain("delegate:codex")
  })

  test("remains manual-invocation beta during rollout", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/SKILL.md")

    expect(content).toContain("disable-model-invocation: true")
    expect(content).toContain("Invoke `ce-work-beta` manually")
    expect(content).toContain("planning and workflow handoffs remain pointed at stable `ce-work`")
  })

  test("SKILL.md has delegation routing stub pointing to reference", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/SKILL.md")

    expect(content).toContain("## Codex Delegation Mode")
    expect(content).toContain("references/codex-delegation-workflow.md")
    // Delegation details are NOT in SKILL.md body — they're in the reference
    expect(content).not.toContain("### Pre-Delegation Checks")
    expect(content).not.toContain("### Prompt Template")
    expect(content).not.toContain("### Execution Loop")
  })

  test("delegation routing gate in Phase 1 Step 4", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/SKILL.md")

    const gateIdx = content.indexOf("Delegation routing gate")
    const strategyTableIdx = content.indexOf("| **Inline**")
    expect(gateIdx).toBeGreaterThan(0)
    expect(gateIdx).toBeLessThan(strategyTableIdx)
    expect(content).toContain("Codex delegation requires a plan file")
  })

  test("delegation branches in Phase 2 task loop", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/SKILL.md")

    expect(content).toContain("If delegation_active: branch to the Codex Delegation Execution Loop")
  })

  test("delegation reference has all required sections", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/references/codex-delegation-workflow.md")

    // Pre-delegation checks
    expect(content).toContain("## Pre-Delegation Checks")
    expect(content).toContain("Platform Gate")
    expect(content).toContain("CODEX_SANDBOX")
    expect(content).toContain("command -v codex")
    expect(content).toContain("Consent Flow")

    // Batching
    expect(content).toContain("## Batching")

    // Prompt template
    expect(content).toContain("## Prompt Template")
    expect(content).toContain("<task>")
    expect(content).toContain("<constraints>")
    expect(content).toContain("<output_contract>")
    expect(content).toContain("the orchestrator will not re-run verification independently")

    // Result schema and execution loop
    expect(content).toContain("## Result Schema")
    expect(content).toContain("## Execution Loop")
    expect(content).toContain("codex exec")

    // Circuit breaker
    expect(content).toContain("consecutive_failures")
    expect(content).toContain("3 consecutive failures")

    // Rollback safety
    expect(content).toContain("git diff --quiet HEAD")
    expect(content).toContain("git checkout -- .")
    expect(content).toContain("Do NOT use bare `git clean -fd` without path arguments")

    // Mixed-model attribution
    expect(content).toContain("## Mixed-Model Attribution")
  })

  test("delegation reference has decision prompts for ask mode", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/references/codex-delegation-workflow.md")

    expect(content).toContain("## Delegation Decision")
    expect(content).toContain("work_delegate_decision")
    expect(content).toContain("Execute with Claude Code instead")
    expect(content).toContain("Delegate to Codex anyway")
    expect(content).toContain("the cost of delegating outweighs having Claude Code do them")
  })

  test("settings resolution includes delegation decision setting", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/SKILL.md")

    expect(content).toContain("work_delegate_decision")
    expect(content).toContain("`auto`")
    expect(content).toContain("`ask`")
  })

  test("has frontend design guidance ported from beta", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/SKILL.md")

    expect(content).toContain("**Frontend Design Guidance**")
    expect(content).toContain("`ce-frontend-design` skill")
  })
})

describe("ce:plan remains neutral during ce:work-beta rollout", () => {
  test("removes delegation-specific execution posture guidance", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-plan/SKILL.md")

    // Old tag removed from execution posture signals
    expect(content).not.toContain("add `Execution target: external-delegate`")

    // Old tag removed from execution note examples
    expect(content).not.toContain("Execution note: Execution target: external-delegate")

    // Planner stays neutral instead of teaching beta-only invocation
    expect(content).not.toContain("delegate:codex")
  })
})

describe("ce-brainstorm review contract", () => {
  test("exposes document review as an opt-in handoff option", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-brainstorm/SKILL.md")
    const handoff = await readRepoFile("plugins/compound-engineering/skills/ce-brainstorm/references/handoff.md")

    // Document review is no longer a forced Phase 3.5 step. Users opt in from the Phase 4 menu.
    expect(content).not.toContain("Phase 3.5")

    // Phase 3 and Phase 4 are extracted to references for token optimization
    expect(content).toContain("`references/requirements-capture.md`")
    expect(content).toContain("`references/handoff.md`")

    // Phase 4 menu exposes agent review as a first-class option and routes to ce-doc-review
    expect(handoff).toContain("Agent review of requirements doc with `ce-doc-review`")
    expect(handoff).toContain("Load the `ce-doc-review` skill")

    // Subsequent-round residual findings are surfaced as a prose nudge, not a separate menu option
    expect(handoff).toContain("Post-review nudge")
    expect(handoff).not.toContain("**Review and refine**")
  })
})

describe("ce-plan testing contract", () => {
  test("flags blank test scenarios on feature-bearing units as incomplete", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-plan/SKILL.md")

    // Phase 5.1 review checklist addresses blank test scenarios
    expect(content).toContain("blank or missing test scenarios")
    expect(content).toContain("Test expectation: none")

    // Template comment mentions the annotation convention
    expect(content).toContain("Test expectation: none -- [reason]")
  })
})

describe("ce-plan review contract", () => {
  test("requires document review after confidence check", async () => {
    // Document review instructions extracted to references/plan-handoff.md
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-plan/references/plan-handoff.md")

    // Phase 5.3.8 runs document-review before final checks (5.3.9)
    expect(content).toContain("## 5.3.8 Document Review")
    expect(content).toContain("`ce-doc-review` skill")

    // Document review must come before final checks so auto-applied edits are validated
    const docReviewIdx = content.indexOf("5.3.8 Document Review")
    const finalChecksIdx = content.indexOf("5.3.9 Final Checks")
    expect(docReviewIdx).toBeLessThan(finalChecksIdx)
  })

  test("SKILL.md stub points to plan-handoff reference", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-plan/SKILL.md")

    // Stub references the handoff file and marks document review as mandatory
    expect(content).toContain("`references/plan-handoff.md`")
    expect(content).toContain("Document review is mandatory")
  })

  test("uses headless mode in pipeline context", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-plan/references/plan-handoff.md")

    // Pipeline mode runs document-review headlessly, not skipping it
    expect(content).toContain("ce-doc-review` with `mode:headless`")
    expect(content).not.toContain("skip document-review and return control")
  })

  test("handoff options recommend ce-work after review", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-plan/references/plan-handoff.md")

    // ce-work is recommended (review already happened)
    expect(content).toContain("**Start `/ce-work`** (recommended) - Begin implementing this plan in the current session")

    // Additional review passes are surfaced contextually (not as a menu fixture) and still
    // route through the ce-doc-review skill when requested
    expect(content).toContain("Surface additional document review contextually")
    expect(content).toContain("Load the `ce-doc-review` skill")

    // No conditional ordering based on plan depth (review already ran)
    expect(content).not.toContain("**Options when ce-doc-review is recommended:**")
    expect(content).not.toContain("**Options for Standard or Lightweight plans:**")
  })
})

describe("ce-doc-review contract", () => {
  test("findings-schema autofix_class enum uses ce-code-review-aligned tier names", async () => {
    const schema = JSON.parse(
      await readRepoFile("plugins/compound-engineering/skills/ce-doc-review/references/findings-schema.json")
    )
    const enumValues = schema.properties.findings.items.properties.autofix_class.enum

    // Three-tier system aligned with ce-code-review's first three tier names
    expect(enumValues).toEqual(["safe_auto", "gated_auto", "manual"])

    // No advisory tier — advisory-style findings surface as an FYI subsection at presentation layer
    expect(enumValues).not.toContain("advisory")

    // Old tier names must be gone after the rename
    expect(enumValues).not.toContain("auto")
    expect(enumValues).not.toContain("present")
  })

  test("findings schema enforces discrete confidence anchors", async () => {
    const schema = JSON.parse(
      await readRepoFile("plugins/compound-engineering/skills/ce-doc-review/references/findings-schema.json")
    )
    const confidence = schema.properties.findings.items.properties.confidence

    // Anchored integer enum, not continuous float
    expect(confidence.type).toBe("integer")
    expect(confidence.enum).toEqual([0, 25, 50, 75, 100])

    // No stale continuous-range properties
    expect(confidence.minimum).toBeUndefined()
    expect(confidence.maximum).toBeUndefined()

    // Rubric text embedded in the description so persona agents see it
    expect(confidence.description).toContain("Absolutely certain")
    expect(confidence.description).toContain("Highly confident")
    expect(confidence.description).toContain("Moderately confident")
    expect(confidence.description).toContain("double-checked")
    expect(confidence.description).toContain("evidence directly confirms")
  })

  test("subagent template embeds anchor rubric and bans float confidence", async () => {
    const template = await readRepoFile(
      "plugins/compound-engineering/skills/ce-doc-review/references/subagent-template.md"
    )

    // Rubric section embedded verbatim in the persona-facing template
    expect(template).toContain("Confidence rubric")
    expect(template).toContain("`0`")
    expect(template).toContain("`25`")
    expect(template).toContain("`50`")
    expect(template).toContain("`75`")
    expect(template).toContain("`100`")

    // Example finding uses anchor, not float
    expect(template).toContain('"confidence": 100')
    expect(template).not.toMatch(/"confidence":\s*0\.\d+/)

    // Advisory observations route to anchor 50, not to a 0.40-0.59 band
    expect(template).toContain("`confidence: 50`")
    expect(template).not.toContain("0.40–0.59 LOW/Advisory band")
    expect(template).not.toContain("0.40-0.59 LOW/Advisory band")
  })

  test("subagent template carries framing guidance and strawman rule", async () => {
    const template = await readRepoFile(
      "plugins/compound-engineering/skills/ce-doc-review/references/subagent-template.md"
    )

    // Framing guidance block present
    expect(template).toContain("observable consequence")
    expect(template).toContain("2-4 sentences")

    // Strawman-aware classification rule
    expect(template).toContain("Strawman-aware classification rule")
    expect(template).toContain("is NOT a real alternative")

    // Strawman safeguard on safe_auto
    expect(template).toContain("Strawman safeguard")

    // Persona exclusion of Open Questions section (prevents round-2 feedback loop)
    expect(template).toContain("Exclude prior-round deferred entries")
    expect(template).toContain("Deferred / Open Questions")

    // Decision primer slot and rules
    expect(template).toContain("{decision_primer}")
    expect(template).toContain("<decision-primer-rules>")
  })

  test("synthesis pipeline routes three tiers with anchor-based gating and FYI subsection", async () => {
    const synthesis = await readRepoFile(
      "plugins/compound-engineering/skills/ce-doc-review/references/synthesis-and-presentation.md"
    )

    // Anchor-based confidence gate
    expect(synthesis).toContain("Anchor-Based")
    expect(synthesis).toMatch(/`0`\s*\|/)
    expect(synthesis).toMatch(/`25`\s*\|/)
    expect(synthesis).toMatch(/`50`\s*\|/)
    expect(synthesis).toMatch(/`75`\s*\|/)
    expect(synthesis).toMatch(/`100`\s*\|/)

    // Anchor 50 routes to FYI, anchors 75/100 enter actionable tier
    expect(synthesis).toContain("FYI subsection")

    // Three-tier routing table present (autofix_class)
    expect(synthesis).toContain("`safe_auto`")
    expect(synthesis).toContain("`gated_auto`")
    expect(synthesis).toContain("`manual`")

    // Cross-persona agreement promotion (replaces +0.10 boost)
    expect(synthesis).toContain("Cross-Persona Agreement Promotion")
    expect(synthesis).toContain("one anchor step")

    // R29 and R30 round-2 rules
    expect(synthesis).toContain("R29 Rejected-Finding Suppression")
    expect(synthesis).toContain("R30 Fix-Landed Matching Predicate")
  })

  test("headless envelope surfaces new tiers distinctly", async () => {
    const synthesis = await readRepoFile(
      "plugins/compound-engineering/skills/ce-doc-review/references/synthesis-and-presentation.md"
    )

    // Bucket headers for the new tiers appear in the headless envelope template.
    // User-facing vocabulary: fixes / Proposed fixes / Decisions / FYI observations
    // maps to the safe_auto / gated_auto / manual / FYI internal enum values.
    expect(synthesis).toContain("Applied N fixes")
    expect(synthesis).toContain("Proposed fixes")
    expect(synthesis).toContain("Decisions")
    expect(synthesis).toContain("FYI observations")

    // Terminal signal preserved for programmatic callers
    expect(synthesis).toContain("Review complete")
  })

  test("terminal question is three-option by default with label adaptation", async () => {
    const synthesis = await readRepoFile(
      "plugins/compound-engineering/skills/ce-doc-review/references/synthesis-and-presentation.md"
    )

    // Three options when fixes are queued
    expect(synthesis).toContain("Apply decisions and proceed to <next stage>")
    expect(synthesis).toContain("Apply decisions and re-review")
    expect(synthesis).toContain("Exit without further action")

    // Two options in the zero-actionable case with the adapted label
    expect(synthesis).toContain("fixes_applied_count == 0")
    expect(synthesis).toContain("zero-actionable case")

    // Next-stage substitution rules documented
    expect(synthesis).toContain("Requirements document")
    expect(synthesis).toContain("Plan document")
    expect(synthesis).toContain("ce-plan")
    expect(synthesis).toContain("ce-work")
  })

  test("SKILL.md has Interactive mode rules with AskUserQuestion pre-load", async () => {
    const content = await readRepoFile(
      "plugins/compound-engineering/skills/ce-doc-review/SKILL.md"
    )

    // Interactive mode rules section at top
    expect(content).toContain("## Interactive mode rules")
    expect(content).toContain("AskUserQuestion")
    expect(content).toContain("ToolSearch")
    expect(content).toContain("numbered-list fallback")
    expect(content).toContain("bounded parallelism")
    expect(content).toContain("active-subagent limit")
    expect(content).toContain("spawn errors as backpressure, not reviewer failure")
    expect(content).toContain("queue the remainder")

    // Decision primer variable in the dispatch table
    expect(content).toContain("{decision_primer}")
    expect(content).toContain("<prior-decisions>")

    // References loaded lazily via backtick paths for walk-through and bulk-preview
    expect(content).toContain("`references/walkthrough.md`")
    expect(content).toContain("`references/bulk-preview.md`")
  })

  test("walkthrough and bulk-preview reference files exist with required mechanics", async () => {
    const walkthrough = await readRepoFile(
      "plugins/compound-engineering/skills/ce-doc-review/references/walkthrough.md"
    )
    const bulkPreview = await readRepoFile(
      "plugins/compound-engineering/skills/ce-doc-review/references/bulk-preview.md"
    )

    // Routing question distinguishing words present (front-loaded per AGENTS.md Interactive Question Tool Design)
    expect(walkthrough).toContain("Review each finding one by one")
    expect(walkthrough).toContain("Auto-resolve with best judgment")
    expect(walkthrough).toContain("Append findings to the doc's Open Questions section")
    expect(walkthrough).toContain("Report only")

    // Four per-finding options
    expect(walkthrough).toContain("Apply the proposed fix")
    expect(walkthrough).toContain("Defer — append to the doc's Open Questions section")
    expect(walkthrough).toContain("Skip — don't apply, don't append")
    expect(walkthrough).toContain("Auto-resolve with best judgment on the rest")

    // Recommended marker mandatory
    expect(walkthrough).toContain("(recommended)")

    // No advisory variant (advisory is a presentation-layer concept, not a walkthrough option)
    expect(walkthrough).not.toContain("Acknowledge — mark as reviewed")

    // No tracker-detection machinery (ce-doc-review has no external tracker)
    expect(walkthrough).not.toContain("named_sink_available")
    expect(walkthrough).not.toContain("any_sink_available")
    expect(walkthrough).not.toContain("[TRACKER]")

    // Bulk preview has Proceed/Cancel options and the four bucket labels
    expect(bulkPreview).toContain("Proceed")
    expect(bulkPreview).toContain("Cancel")
    expect(bulkPreview).toContain("Applying (N):")
    expect(bulkPreview).toContain("Appending to Open Questions (N):")
    expect(bulkPreview).toContain("Skipping (N):")

    // No Acknowledge bucket in bulk preview either
    expect(bulkPreview).not.toContain("Acknowledging (N):")
  })

  test("open-questions-defer reference implements append mechanic with failure path", async () => {
    const defer = await readRepoFile(
      "plugins/compound-engineering/skills/ce-doc-review/references/open-questions-defer.md"
    )

    // Append mechanic steps
    expect(defer).toContain("## Deferred / Open Questions")
    expect(defer).toContain("### From YYYY-MM-DD review")

    // Entry format includes required fields but excludes suggested_fix and evidence
    expect(defer).toContain("{title}")
    expect(defer).toContain("{severity}")
    expect(defer).toContain("{reviewer}")
    expect(defer).toContain("{confidence}")
    expect(defer).toContain("{why_it_matters}")

    // Failure-path sub-question with three options
    expect(defer).toContain("Retry")
    expect(defer).toContain("Record the deferral in the completion report only")
    expect(defer).toContain("Convert this finding to Skip")

    // No tracker-detection logic (this is the in-doc defer path, not tracker-defer)
    expect(defer).not.toContain("named_sink_available")
    expect(defer).not.toContain("[TRACKER]")
  })
})

describe("ce-compound frontmatter schema expansion contract", () => {
  test("problem_type enum includes the four new knowledge-track values", async () => {
    const schema = await readRepoFile(
      "plugins/compound-engineering/skills/ce-compound/references/schema.yaml"
    )

    // Four new knowledge-track values present in the enum
    expect(schema).toContain("architecture_pattern")
    expect(schema).toContain("design_pattern")
    expect(schema).toContain("tooling_decision")
    expect(schema).toContain("convention")

    // best_practice remains valid as fallback
    expect(schema).toContain("best_practice")
  })

  test("ce-compound-refresh schema stays in sync with canonical ce-compound schema", async () => {
    const canonical = await readRepoFile(
      "plugins/compound-engineering/skills/ce-compound/references/schema.yaml"
    )
    const refresh = await readRepoFile(
      "plugins/compound-engineering/skills/ce-compound-refresh/references/schema.yaml"
    )

    // Duplicate schemas must be identical (kept in sync intentionally per AGENTS.md)
    expect(refresh).toEqual(canonical)
  })

  test("yaml-schema.md documents category mappings for the four new values", async () => {
    const mapping = await readRepoFile(
      "plugins/compound-engineering/skills/ce-compound/references/yaml-schema.md"
    )

    expect(mapping).toContain("architecture_pattern` -> `docs/solutions/architecture-patterns/")
    expect(mapping).toContain("design_pattern` -> `docs/solutions/design-patterns/")
    expect(mapping).toContain("tooling_decision` -> `docs/solutions/tooling-decisions/")
    expect(mapping).toContain("convention` -> `docs/solutions/conventions/")
  })
})

describe("ce-learnings-researcher domain-agnostic contract", () => {
  test("agent prompt frames as domain-agnostic not bug-focused", async () => {
    const agent = await readRepoFile(
      "plugins/compound-engineering/agents/ce-learnings-researcher.agent.md"
    )

    // Domain-agnostic identity framing
    expect(agent).toContain("domain-agnostic institutional knowledge researcher")

    // Multiple learning shapes named as first-class
    expect(agent).toContain("Architecture patterns")
    expect(agent).toContain("Design patterns")
    expect(agent).toContain("Tooling decisions")
    expect(agent).toContain("Conventions")

    // Structured <work-context> input accepted
    expect(agent).toContain("<work-context>")
    expect(agent).toContain("Activity:")
    expect(agent).toContain("Concepts:")
    expect(agent).toContain("Decisions:")
    expect(agent).toContain("Domains:")

    // Dynamic subdirectory probe replaces hardcoded category table
    expect(agent).toContain("Probe")
    expect(agent).toContain("discover which subdirectories actually exist")

    // Critical-patterns.md read is conditional, not assumed
    expect(agent).toMatch(/critical-patterns.md.*exists/i)

    // Integration Points list no longer includes ce-doc-review (agent is ce-plan-owned)
    const integration = agent.substring(agent.indexOf("Integration Points"))
    expect(integration).not.toContain("ce-doc-review")
  })
})
