import { lstat, mkdtemp, readFile, rm, stat, symlink, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

async function readCeWorkImplementationContract(): Promise<string> {
  const skill = await readRepoFile("skills/ce-work/SKILL.md")
  const implementationLoop = await readRepoFile("skills/ce-work/references/implementation-loop.md").catch(() => "")
  return `${skill}\n${implementationLoop}`
}

describe("ce-work review contract", () => {
  test("requires code review before shipping", async () => {
    const content = await readRepoFile("skills/ce-work/SKILL.md")
    // Review content extracted to references/shipping-workflow.md
    const shipping = await readRepoFile("skills/ce-work/references/shipping-workflow.md")

    // SKILL.md should not contain extracted content
    expect(content).not.toContain("3. **Code Review**")
    expect(content).not.toContain("Consider Code Review")
    expect(content).not.toContain("Code Review** (Optional)")

    // Phase 3 has a conditional Simplify step at position 2 (ce-simplify-code, gated on >=30 LOC)
    // and code review at position 3.
    expect(shipping).toContain("2. **Simplify**")
    expect(shipping).toContain("ce-simplify-code")
    expect(shipping).toContain("3. **Code Review**")

    // Single portable path: ce-code-review self-sizes (lite vs full roster).
    // The former Tier 1 (harness-native /review) / Tier 2 (escalation) split is gone,
    // along with harness-specific review detection.
    expect(shipping).toContain("ce-code-review")
    expect(shipping).toContain("as the single path")
    expect(shipping).not.toContain("**Tier 1 -- harness-native review")
    expect(shipping).not.toContain("(escalation only)")
    // Skip only for a purely mechanical diff; everything else is reviewed
    expect(shipping).toContain("mechanical diff")
    // The one escalation signal ce-code-review cannot infer is passed explicitly
    expect(shipping).toContain("depth:full")
    // Autonomous Residual Gate branch keeps unattended pipelines unblocked
    expect(shipping).toContain("Non-interactive / autonomous")
    // Two-step review -> fix, consumed by followup
    expect(shipping).toContain("review-findings-followup.md")
    expect(shipping).toMatch(/review is not fix|3a\. Review|3b\. Apply/i)
    expect(shipping).toContain("mode:agent")

    // Quality checklist references ce-code-review (self-sized), not tiers
    expect(shipping).toContain("Code review: `ce-code-review` ran")
  })

  test("delegates commit and PR to dedicated skills", async () => {
    const content = await readRepoFile("skills/ce-work/SKILL.md")
    // Commit/PR delegation content extracted to references/shipping-workflow.md
    const shipping = await readRepoFile("skills/ce-work/references/shipping-workflow.md")

    expect(shipping).toContain("`ce-commit-push-pr` skill")
    expect(shipping).toContain("`ce-commit` skill")
    expect(shipping).toContain("`branding:on`")
    expect(shipping).not.toContain("attribution badges")
    expect(shipping).not.toContain("Compound Engineered badge with accurate model and harness")

    // Should not contain inline PR templates or attribution placeholders
    expect(content).not.toContain("gh pr create")
    expect(content).not.toContain("[HARNESS_URL]")
  })

  test("includes per-task testing deliberation in execution loop", async () => {
    const content = await readCeWorkImplementationContract()

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
    const content = await readRepoFile("skills/ce-work/SKILL.md")
    // Quality checklist extracted to references/shipping-workflow.md
    const shipping = await readRepoFile("skills/ce-work/references/shipping-workflow.md")

    // New language present in reference file
    expect(shipping).toContain("Testing addressed")

    // Old language fully removed from both
    expect(content).not.toContain("Tests pass (run project's test command)")
    expect(content).not.toContain("- All tests pass")
    expect(shipping).not.toContain("Tests pass (run project's test command)")
  })

  test("SKILL.md stub points to shipping-workflow reference", async () => {
    const content = await readRepoFile("skills/ce-work/SKILL.md")

    // Stub references the shipping-workflow file
    expect(content).toContain("`references/shipping-workflow.md`")

    // Extracted content is not in SKILL.md
    expect(content).not.toContain("3. **Code Review**")
    expect(content).not.toContain("## Quality Checklist")
    expect(content).not.toContain("## Code Review Tiers")
  })

  test("ce:work remains the stable non-delegating surface", async () => {
    const content = await readRepoFile("skills/ce-work/SKILL.md")

    expect(content).not.toContain("## Argument Parsing")
    expect(content).not.toContain("## Codex Delegation Mode")
    expect(content).not.toContain("delegate:codex")
  })
})

describe("ce-plan stays neutral on delegation", () => {
  test("removes delegation-specific execution posture guidance", async () => {
    const content = await readRepoFile("skills/ce-plan/SKILL.md")

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
    const content = await readRepoFile("skills/ce-brainstorm/SKILL.md")
    const handoff = await readRepoFile("skills/ce-brainstorm/references/handoff.md")

    // Document review is no longer a forced Phase 3.5 step. Users opt in from the Phase 4 menu.
    expect(content).not.toContain("Phase 3.5")

    // Phase 3 and Phase 4 are extracted to references for token optimization.
    // Phase 3 now points at brainstorm-sections.md (content contract) plus a
    // format-rendering ref; Phase 4 points at handoff.md.
    expect(content).toContain("`references/brainstorm-sections.md`")
    expect(content).toContain("`references/handoff.md`")

    // Phase 4 menu exposes a requirements-critique option as a first-class option and routes to ce-doc-review
    expect(handoff).toContain("**Pressure-test the requirements**")
    expect(handoff).toContain("Load the `ce-doc-review` skill")

    // Subsequent-round residual findings are surfaced as a prose nudge, not a separate menu option
    expect(handoff).toContain("Post-review nudge")
    expect(handoff).not.toContain("**Review and refine**")
  })
})

describe("ce-plan testing contract", () => {
  test("flags blank test scenarios on feature-bearing units as incomplete", async () => {
    const content = await readRepoFile("skills/ce-plan/SKILL.md")

    // Phase 5.1 review checklist addresses blank test scenarios
    expect(content).toContain("blank or missing test scenarios")
    expect(content).toContain("Test expectation: none")

    // Template comment mentions the annotation convention
    expect(content).toContain("Test expectation: none -- [reason]")
  })

  test("keeps execution direction natural-language instead of enum-based", async () => {
    const content = await readRepoFile("skills/ce-plan/SKILL.md")

    expect(content).toContain("natural-language signal")
    expect(content).toContain("Do not encode it as a finite enum")
    expect(content).toContain("Do not treat this as an enum")
  })
})

describe("ce-work testing evidence contract", () => {
  test("requires evidence strategy before behavior changes and evidence in return-to-caller", async () => {
    const content = await readCeWorkImplementationContract()

    expect(content).toContain("Choose the evidence strategy for this task before changing behavior")
    expect(content).toContain("default to test-first or characterization-first")
    expect(content).toContain("Do not add a duplicate regression test")
    expect(content).toContain("verification_evidence")
    expect(content).toContain("existing_tests_inspected")
    expect(content).toContain("Return `status: complete` only when behavior-bearing work has verification evidence")
  })
})

describe("verification_evidence seam parity (ce-work <-> lfg)", () => {
  // The lfg step-2 gate consumes ce-work's `verification_evidence` return field.
  // The two SKILL.md files are edited independently, so the existing prose-presence
  // tests each guard only one side and would both stay green if a field name or a
  // named evidence fact drifted on just one end. These tests scope assertions to the
  // *owning* section and cross-check that both ends name the same facts, so a rename
  // or drop that isn't mirrored across the seam fails.

  // Each fact the return contract carries, with the surface form each end uses:
  // ce-work documents backtick field tokens; lfg's gate names them in prose.
  const EVIDENCE_FACTS: Array<{ fact: string; ceWork: string; lfg: string }> = [
    { fact: "field name", ceWork: "verification_evidence", lfg: "verification_evidence" },
    { fact: "behavior-change signal", ceWork: "behavior_changed", lfg: "behavior_change: true" },
    { fact: "existing tests inspected", ceWork: "existing_tests_inspected", lfg: "existing tests inspected" },
    { fact: "tests added/changed", ceWork: "tests_added_or_changed", lfg: "tests added/changed" },
    { fact: "red/characterization evidence", ceWork: "red failure or characterization", lfg: "red failure or characterization" },
    { fact: "verification run", ceWork: "verification commands/results", lfg: "verification run" },
    { fact: "deliberate exception", ceWork: "exception reason", lfg: "deliberate test exception" },
  ]

  function sliceSection(content: string, startAnchor: string, endAnchor: string): string {
    const start = content.indexOf(startAnchor)
    expect(start, `start anchor not found: ${startAnchor}`).toBeGreaterThanOrEqual(0)
    const end = content.indexOf(endAnchor, start + startAnchor.length)
    expect(end, `end anchor not found: ${endAnchor}`).toBeGreaterThan(start)
    return content.slice(start, end)
  }

  test("ce-work return contract owns the verification_evidence field and gates completion on it", async () => {
    const content = await readRepoFile("skills/ce-work/SKILL.md")
    // Scope to the Return-to-Caller "Return:" contract, not the whole file — the
    // field must be documented in the return the caller actually reads.
    const returnBlock = sliceSection(content, "## Return-to-Caller Mode", "Engine selection (")

    for (const { fact, ceWork } of EVIDENCE_FACTS) {
      expect(returnBlock, `ce-work return contract must document ${fact} ("${ceWork}")`).toContain(ceWork)
    }

    // Completion is gated on evidence-or-exception, and the idempotency backfill path exists.
    expect(returnBlock).toContain(
      "Return `status: complete` only when behavior-bearing work has verification evidence"
    )
    expect(returnBlock).toContain("complete the evidence, and return without reimplementing")
  })

  test("lfg step-2 gate names every evidence fact ce-work documents", async () => {
    const lfg = await readRepoFile("skills/lfg/SKILL.md")
    // Scope to the step-2 gate block, between invoking ce-work and step 3.
    const gate = sliceSection(
      lfg,
      "2. Invoke the `ce-work` skill with `mode:return-to-caller",
      "3. Invoke the `ce-simplify-code`"
    )

    for (const { fact, lfg: phrase } of EVIDENCE_FACTS) {
      expect(gate, `lfg gate must require ${fact} ("${phrase}")`).toContain(phrase)
    }

    // The gate only demands evidence when behavior changed, and defers test-strategy to ce-work.
    expect(gate).toContain("When `behavior_change: true`, also require `verification_evidence`")
    expect(gate).toContain("Do NOT decide the test strategy inside LFG")
  })

  test("lfg retries ce-work exactly once for evidence, then blocks rather than ships", async () => {
    const lfg = await readRepoFile("skills/lfg/SKILL.md")
    const gate = sliceSection(
      lfg,
      "2. Invoke the `ce-work` skill with `mode:return-to-caller",
      "3. Invoke the `ce-simplify-code`"
    )

    // One-shot recovery on the same plan and engine binding, with the returned durable run id.
    expect(gate).toContain("invoke `ce-work` one more time in recovery mode")
    expect(gate).toContain("same `implementation_engine:<compact-json>` carrier")
    expect(gate).toContain("implementation_run:<safe-id>")
    expect(gate).toContain("Do not prompt the user and do not alter the plan path or engine carrier")
    expect(gate).toContain("When `actual_route` is `native` and `run_id` is `null`")
    expect(gate).toContain("repeat the original ce-work invocation once without an `implementation_run:` carrier")
    expect(gate).toContain("A non-native return without a safe run id remains blocked")
    // Second still-missing return stops blocked instead of continuing to ship.
    expect(gate).toContain("stop as blocked and report the missing fields")
    expect(gate).toContain("instead of continuing to simplify/review/ship")
  })
})

describe("cross-model execution receipt seam parity (ce-work <-> lfg)", () => {
  const ROUTE_RECEIPT_FIELDS = [
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
  ]

  function sliceSection(content: string, startAnchor: string, endAnchor: string): string {
    const start = content.indexOf(startAnchor)
    expect(start, `start anchor not found: ${startAnchor}`).toBeGreaterThanOrEqual(0)
    const end = content.indexOf(endAnchor, start + startAnchor.length)
    expect(end, `end anchor not found: ${endAnchor}`).toBeGreaterThan(start)
    return content.slice(start, end)
  }

  test("lfg requires every route receipt exposed by ce-work", async () => {
    const ceWork = await readRepoFile("skills/ce-work/SKILL.md")
    const lfg = await readRepoFile("skills/lfg/SKILL.md")
    const returned = sliceSection(ceWork, "## Return-to-Caller Mode", "Engine selection (")
    const gate = sliceSection(
      lfg,
      "2. Invoke the `ce-work` skill with `mode:return-to-caller",
      "3. Invoke the `ce-simplify-code`",
    )

    for (const field of ROUTE_RECEIPT_FIELDS) {
      expect(returned, `ce-work must return ${field}`).toContain(`\`${field}\``)
      expect(gate, `lfg must gate on ${field}`).toContain(`\`${field}\``)
    }
  })

  test("lfg keeps the binding out of plan and review inputs", async () => {
    const lfg = await readRepoFile("skills/lfg/SKILL.md")
    const carrier = sliceSection(
      lfg,
      "## Per-stage routing carriers",
      "1. Invoke the `ce-plan` skill",
    )
    expect(carrier).toContain("Remove every routing directive")
    expect(carrier).toContain("Never pass")
    expect(carrier).toContain("`ce-plan`")
    expect(carrier).toContain("`ce-code-review`")
    expect(carrier).toContain("feature content")
  })
})

describe("ce-debug regression test selection", () => {
  test("inspects and updates existing tests instead of always adding new tests", async () => {
    const content = await readRepoFile("skills/ce-debug/SKILL.md")

    expect(content).toContain("inspect existing tests before adding coverage")
    expect(content).toContain("update an existing test when it owns the contract")
    expect(content).toContain("strengthen an over-mocked test")
    expect(content).toContain("add a new minimal isolated test only when no existing test is the right home")
  })
})

describe("ce-plan review contract", () => {
  test("requires document review after confidence check", async () => {
    // Document review instructions extracted to references/plan-handoff.md
    const content = await readRepoFile("skills/ce-plan/references/plan-handoff.md")

    // Phase 5.3.8 runs document-review before final checks (5.3.9)
    expect(content).toContain("## 5.3.8 Document Review")
    expect(content).toContain("`ce-doc-review` skill")

    // Document review must come before final checks so auto-applied edits are validated
    const docReviewIdx = content.indexOf("5.3.8 Document Review")
    const finalChecksIdx = content.indexOf("5.3.9 Final Checks")
    expect(docReviewIdx).toBeLessThan(finalChecksIdx)
  })

  test("SKILL.md stub points to plan-handoff reference", async () => {
    const content = await readRepoFile("skills/ce-plan/SKILL.md")

    // Stub references the handoff file and marks document review as mandatory
    expect(content).toContain("`references/plan-handoff.md`")
    expect(content).toContain("Document review is mandatory")
  })

  test("uses non-interactive mode by default and in pipeline context", async () => {
    const content = await readRepoFile("skills/ce-plan/references/plan-handoff.md")
    const skillStub = await readRepoFile("skills/ce-plan/SKILL.md")

    // Default at Phase 5.3.8 is `mode:non-interactive` so users opt into deeper interactive review
    // explicitly from the post-generation menu rather than being forced through it.
    expect(content).toContain(
      "Invoke the `ce-doc-review` skill with arguments `mode:non-interactive <plan-path>`",
    )
    expect(content).toContain("ce-doc-review` with `mode:non-interactive`")
    expect(content).toContain(
      "Pipeline runs invoke `ce-doc-review` with `mode:non-interactive` and the plan path",
    )
    expect(skillStub).toContain(
      "The default mode for markdown is non-interactive (`mode:non-interactive`)",
    )
    expect(content).not.toContain("skip document-review and return control")

    // The interactive walkthrough is opt-in via the post-generation menu, not automatic
    expect(content).toContain("Decide on the review's open items")
  })

  test("handoff options expose deeper-review opt-in alongside ce-work", async () => {
    const content = await readRepoFile("skills/ce-plan/references/plan-handoff.md")

    // Both executors are offered; ce-work is always the recommended default (it is the
    // correctly-layered entry point that reaches goal/workflow engines itself), while goal
    // mode is the opt-in preference for driving the work through the harness's goal loop.
    expect(content).toContain("**Start `ce-work`** - Build and ship the plan in this session")
    expect(content).toContain("**Run it as a `/goal`**")
    expect(content).toMatch(/`ce-work` \(option 1\) always carries \*\(recommended\)\*/i)
    expect(content).toContain("Codex `create_goal` in the available tool list")

    // Deeper review is a first-class menu fixture so users can engage with surfaced findings
    // without relying on free-form prompting; routed through ce-doc-review without non-interactive mode.
    expect(content).toContain("**Decide on the review's open items**")
    expect(content).toContain("`ce-doc-review`")
    expect(content).toContain("without** `mode:non-interactive`")

    // Deeper-review menu fixture is hidden when no actionable findings remain so the menu
    // collapses back to a 4-option AskUserQuestion-friendly shape on Claude Code. FYI-only
    // state also hides the option since ce-doc-review's walkthrough is gated to actionable
    // findings (anchor 75/100, gated_auto/manual) and FYIs (anchor 50) bypass it.
    expect(content).toContain("Hide `Decide on the review's open items` (option 3) when no actionable findings remain")
    expect(content).toContain("proposed_fixes_count + decisions_count > 0")

    // Summary line above the menu surfaces autofix counts and remaining-bucket counts
    expect(content).toContain("Summary line above the menu")

    // No conditional ordering based on plan depth (review already ran)
    expect(content).not.toContain("**Options when ce-doc-review is recommended:**")
    expect(content).not.toContain("**Options for Standard or Lightweight plans:**")
  })
})

describe("ce-doc-review contract", () => {
  test("findings-schema autofix_class enum uses ce-code-review-aligned tier names", async () => {
    const schema = JSON.parse(
      await readRepoFile("skills/ce-doc-review/references/findings-schema.json")
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
      await readRepoFile("skills/ce-doc-review/references/findings-schema.json")
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
      "skills/ce-doc-review/references/subagent-template.md"
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
      "skills/ce-doc-review/references/subagent-template.md"
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
      "skills/ce-doc-review/references/synthesis-and-presentation.md"
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
    expect(synthesis).toContain("`independence_verified` is `true`")
    expect(synthesis).toContain("cannot use the twin fingerprint exception")
    expect(synthesis).toContain("Cursor default/Auto")

    // R29 and R30 round-2 rules
    expect(synthesis).toContain("R29 Rejected-Finding Suppression")
    expect(synthesis).toContain("R30 Fix-Landed Matching Predicate")
  })

  test("non-interactive envelope surfaces new tiers distinctly", async () => {
    const synthesis = await readRepoFile(
      "skills/ce-doc-review/references/synthesis-and-presentation.md"
    )

    // Bucket headers for the new tiers appear in the non-interactive envelope template.
    // User-facing vocabulary: fixes / Proposed fixes / Decisions / FYI observations
    // maps to the safe_auto / gated_auto / manual / FYI internal enum values.
    expect(synthesis).toContain("Applied N fixes")
    expect(synthesis).toContain("Proposed fixes")
    expect(synthesis).toContain("Decisions")
    expect(synthesis).toContain("FYI observations")
    expect(synthesis).toContain("Caller receipt:")
    expect(synthesis).toContain("reviewed_fingerprint: sha256:")
    expect(synthesis).toContain("result_fingerprint: sha256:")
    expect(synthesis).toContain("selected_reviewers:")
    expect(synthesis).toContain("completed_reviewers:")
    expect(synthesis).toContain("failed_reviewers:")
    expect(synthesis).toContain("document_changing_fixes:")
    expect(synthesis).toContain("terminal_status: complete")
    expect(synthesis).toContain("final materialized roster")
    expect(synthesis).toContain("absent from that list in `failed_reviewers`")

    // Terminal signal preserved for programmatic callers
    expect(synthesis).toContain("Review complete")
  })

  test("terminal question is three-option by default with label adaptation", async () => {
    const synthesis = await readRepoFile(
      "skills/ce-doc-review/references/synthesis-and-presentation.md"
    )

    // Three options when fixes are queued
    expect(synthesis).toContain("Apply decisions and proceed to <next stage>")
    expect(synthesis).toContain("Apply decisions and re-review")
    expect(synthesis).toContain("Exit without further action")

    // Two options in the zero-actionable case with the adapted label
    expect(synthesis).toContain("fixes_applied_count == 0")
    expect(synthesis).toContain("zero-actionable case")

    // Next-stage substitution rules documented, readiness-aware: a
    // requirements-only artifact routes to planning, implementation-ready to
    // execution (unified and legacy classifications both covered).
    expect(synthesis).toContain("requirements-only unified plan")
    expect(synthesis).toContain("implementation-ready unified plan")
    expect(synthesis).toContain("legacy standalone requirements doc")
    expect(synthesis).toContain("legacy implementation plan")
    expect(synthesis).toContain("ce-plan")
    expect(synthesis).toContain("ce-work")
  })

  test("SKILL.md has Interactive mode rules with AskUserQuestion pre-load", async () => {
    const content = await readRepoFile(
      "skills/ce-doc-review/SKILL.md"
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

  test("keeps security document review on the parent capability tier", async () => {
    const content = await readRepoFile("skills/ce-doc-review/SKILL.md")
    const modelTierSection = content.slice(content.indexOf("Model tiering lives here"))
    const securityTierLine = modelTierSection
      .split("\n")
      .find((line) => line.includes("security-lens-reviewer"))

    expect(securityTierLine).toContain("inherit the parent model")
    expect(securityTierLine).not.toContain("mid-tier")
  })

  test("walkthrough and bulk-preview reference files exist with required mechanics", async () => {
    const walkthrough = await readRepoFile(
      "skills/ce-doc-review/references/walkthrough.md"
    )
    const bulkPreview = await readRepoFile(
      "skills/ce-doc-review/references/bulk-preview.md"
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

    // The preview and question are two ordered user-facing events. The
    // portable contract names the capability before non-exhaustive adapters.
    const previewEvent = bulkPreview.indexOf("Preview event")
    const questionCapability = bulkPreview.indexOf(
      "agent-callable blocking-question capability"
    )
    const adapters = bulkPreview.indexOf("Non-exhaustive adapters")
    expect(previewEvent).toBeGreaterThan(-1)
    expect(questionCapability).toBeGreaterThan(previewEvent)
    expect(adapters).toBeGreaterThan(questionCapability)
    expect(bulkPreview).toContain("user-visible assistant text")
    expect(bulkPreview).toMatch(/(?:thinking|reasoning).*does not count/)
    expect(bulkPreview).toContain("do not invoke the blocking-question capability")

    // No Acknowledge bucket in bulk preview either
    expect(bulkPreview).not.toContain("Acknowledging (N):")
  })

  test("open-questions-defer reference implements append mechanic with failure path", async () => {
    const defer = await readRepoFile(
      "skills/ce-doc-review/references/open-questions-defer.md"
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
      "skills/ce-compound/references/schema.yaml"
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
      "skills/ce-compound/references/schema.yaml"
    )
    const refresh = await readRepoFile(
      "skills/ce-compound-refresh/references/schema.yaml"
    )

    // Duplicate schemas must be identical (kept in sync intentionally per AGENTS.md)
    expect(refresh).toEqual(canonical)
  })

  test("yaml-schema.md documents category mappings for the four new values", async () => {
    const mapping = await readRepoFile(
      "skills/ce-compound/references/yaml-schema.md"
    )

    expect(mapping).toContain("architecture_pattern` -> `<root>/solutions/architecture-patterns/")
    expect(mapping).toContain("design_pattern` -> `<root>/solutions/design-patterns/")
    expect(mapping).toContain("tooling_decision` -> `<root>/solutions/tooling-decisions/")
    expect(mapping).toContain("convention` -> `<root>/solutions/conventions/")
  })
})

describe("ce-compound Phase 1 artifact contract", () => {
  // Regression guard for issue #956: Phase 1 subagents that returned long-form
  // prose only as their inline Agent response failed silently when the harness
  // collapsed the return to an executive summary. The fix mirrors ce-code-review's
  // proven /tmp run-artifact pattern: subagents write full output to disk and the
  // orchestrator Reads it back with the inline return as a fallback.
  test("generates a run id and run dir before dispatching Phase 1 subagents", async () => {
    const content = await readRepoFile("skills/ce-compound/SKILL.md")

    // A run identifier scopes the per-subagent artifact files
    expect(content).toContain("RUN_ID")
    // Run dir under the validated owner-private scratch namespace
    expect(content).toContain('SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)"')
    expect(content).toContain('RUN_DIR="$SCRATCH_ROOT/ce-compound/$RUN_ID"')
    expect(content).toContain('(umask 077; mkdir -p "$RUN_DIR")')
  })

  test("Phase 1 subagents write full output to the run-artifact path", async () => {
    const content = await readRepoFile("skills/ce-compound/SKILL.md")

    const phase1 = content.slice(
      content.indexOf("### Phase 1: Research"),
      content.indexOf("### Phase 2: Assembly & Write"),
    )

    // Subagents are instructed to write their full structured output to the run dir
    expect(phase1).toContain("{run_dir}")
    // ...and return a compact confirmation containing the artifact path
    expect(phase1.toLowerCase()).toContain("artifact path")
    // Inline return is required whenever the write did not succeed (not only when
    // {run_id} is missing) so Phase 2's fallback always has content to read.
    expect(phase1.toLowerCase()).toContain("write did not succeed")
    expect(phase1.toLowerCase()).toContain("the write itself failed")
  })

  test("Phase 2 assembly reads artifacts with inline-return fallback", async () => {
    const content = await readRepoFile("skills/ce-compound/SKILL.md")

    const phase2 = content.slice(
      content.indexOf("### Phase 2: Assembly & Write"),
      content.indexOf("### Phase 2.4: Vocabulary Capture"),
    )

    // Orchestrator reads the per-subagent artifact files
    expect(phase2).toContain("{run_dir}")
    // Inline return is the documented fallback when the artifact is absent
    expect(phase2.toLowerCase()).toContain("fall back")
  })

  test("no longer imposes an absolute no-write rule on Phase 1 subagents", async () => {
    const content = await readRepoFile("skills/ce-compound/SKILL.md")

    // The brittle absolute prohibition is gone — only product-file writes are reserved
    // to the orchestrator; scratch artifacts under /tmp are now expected.
    expect(content).not.toContain(
      "They must NOT use Write, Edit, or create any files.",
    )
    expect(content).not.toContain(
      "Subagents return text data; orchestrator writes one final file",
    )
  })
})

describe("concept-teaching seam parity (ce-commit-push-pr <-> lfg)", () => {
  // lfg echoes the `New concepts:` trailer ce-commit-push-pr prints after the PR URL.
  // The two SKILL.md files are edited independently, so these assertions cross-check
  // that both ends name the same trailer format and that the callsite hardcodes the
  // non-interactive mode (a drift on either end fails here, not in production runs).
  test("lfg hardcodes mode:pipeline at the callsite and echoes the trailer", async () => {
    const skill = await readRepoFile("skills/ce-commit-push-pr/SKILL.md")
    const lfg = await readRepoFile("skills/lfg/SKILL.md")

    // Both ends name the same trailer format
    expect(skill).toContain("New concepts:")
    expect(lfg).toContain("New concepts:")

    // The callsite passes the mode explicitly rather than relying on defaults
    expect(lfg).toContain("Invoke the `ce-commit-push-pr` skill with `mode:pipeline branding:on`.")

    // The pre-DONE report names the concept and renders each user-runnable
    // handoff for the active host rather than hardcoding one harness's syntax.
    expect(lfg).toContain("New concept introduced:")
    expect(lfg).toContain("run <rendered ce-explain invocation> to go deeper")
    expect(lfg).toContain("run <rendered ce-babysit-pr invocation> to watch it through review to merge")
    for (const target of ["ce-explain <name>", "ce-babysit-pr <pr-url>"]) {
      expect(lfg).toContain(`$${target}`)
      expect(lfg).toContain(`/${target}`)
    }
    expect(lfg).toMatch(/default to `\/ce-explain <name>`[\s\S]{0,360}Codex[\s\S]{0,220}output one form only/i)

    // The callee documents the mode the caller passes
    expect(skill).toContain("mode:pipeline")
  })
})

describe("explicit Compound Engineering branding provenance", () => {
  test("CE-owned shipping callers pass branding:on", async () => {
    const shipping = await readRepoFile("skills/ce-work/references/shipping-workflow.md")
    const lfg = await readRepoFile("skills/lfg/SKILL.md")
    const debug = await readRepoFile("skills/ce-debug/SKILL.md")

    expect(shipping).toContain("Load the `ce-commit-push-pr` skill with `branding:on`")
    expect(lfg).toContain("ce-commit-push-pr` skill with `mode:pipeline branding:on`")
    expect(debug).toContain("Invoke the `ce-commit-push-pr` skill with `branding:on`.")
    expect(debug).toContain("reviewed fix (invoke the `ce-commit-push-pr` skill with `branding:on`)")
    expect(debug).not.toContain("`/ce-commit-push-pr branding:on`")
  })
})

describe("learnings-researcher local prompt domain-agnostic contract", () => {
  test("local prompt frames as domain-agnostic not bug-focused", async () => {
    const agent = await readRepoFile(
      "skills/ce-plan/references/agents/learnings-researcher.md"
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

type ReceiptHelperResult = {
  status: number
  stdout: string
  stderr: string
}

const RECEIPT_HELPER = path.join(
  process.cwd(),
  "skills/ce-code-review/scripts/review-receipt.mjs",
)
const SHA40_A = "a".repeat(40)
const SHA40_B = "b".repeat(40)

function receiptFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const receiptDefaults = {
    base_sha: SHA40_A,
    head_sha: SHA40_B,
    branch: "feature/receipt",
    selected_reviewers: ["correctness-reviewer"],
    required_reviewers: ["correctness-reviewer"],
    completed_reviewers: ["correctness-reviewer"],
    failed_reviewers: [],
    terminal_status: "complete",
  }
  const receipt = {
    ...receiptDefaults,
    ...((overrides.review_receipt as Record<string, unknown> | undefined) ?? {}),
  }
  const { review_receipt: _receiptOverride, reviewers, ...topLevelOverrides } = overrides
  const selected = receipt.selected_reviewers as string[]

  return {
    status: "complete",
    verdict: "Ready to merge",
    scope: {
      base: "pr:123",
      branch: "feature/receipt",
      head_sha: SHA40_B,
      pr_url: "https://github.com/example/repo/pull/123",
      files_changed: 2,
    },
    intent: "Harden review receipt evidence.",
    intent_confidence: "explicit",
    reviewers: reviewers ?? selected.map((identity) => identity === "correctness-reviewer" ? "correctness" : identity),
    findings: [],
    actionable_findings: [],
    triage_groups: [],
    pre_existing_findings: [],
    requirements_completeness: null,
    learnings: [],
    agent_native_gaps: [],
    deployment_notes: [],
    residual_risks: [],
    testing_gaps: [],
    coverage: {},
    artifact_path: "/tmp/review-run",
    run_id: "receipt-fixture",
    ...topLevelOverrides,
    review_receipt: receipt,
  }
}

function canonicalReceipt(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalReceipt)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalReceipt((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}

function runReceiptHelper(payload: unknown): ReceiptHelperResult {
  const proc = Bun.spawnSync([process.execPath, RECEIPT_HELPER], {
    stdin: new TextEncoder().encode(JSON.stringify(payload)),
    stdout: "pipe",
    stderr: "pipe",
  })
  return {
    status: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  }
}

function receiptFinding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "#": 1,
    title: "Actionable defect",
    severity: "P1",
    file: "src/review.ts",
    line: 12,
    confidence: 100,
    autofix_class: "gated_auto",
    owner: "downstream-resolver",
    requires_verification: true,
    pre_existing: false,
    suggested_fix: "Correct the defect.",
    first_evidence: "src/review.ts:12 -- broken()",
    why_it_matters: "The defect affects runtime behavior.",
    evidence: ["src/review.ts:12 -- broken()"],
    reviewers: ["correctness"],
    independent_reviewers: ["correctness"],
    ...overrides,
  }
}

function runReceiptHelperArgs(args: string[]): ReceiptHelperResult {
  const proc = Bun.spawnSync([process.execPath, RECEIPT_HELPER, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })
  return {
    status: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  }
}

function gitCommand(cwd: string, ...args: string[]): string {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  const stderr = proc.stderr.toString()
  expect(proc.exitCode, stderr).toBe(0)
  return proc.stdout.toString().trim()
}

async function commitFile(repo: string, file: string, contents: string, message: string): Promise<string> {
  await writeFile(path.join(repo, file), contents)
  gitCommand(repo, "add", file)
  gitCommand(repo, "commit", "-m", message)
  return gitCommand(repo, "rev-parse", "HEAD")
}

describe("ce-code-review receipt helper", () => {
  test("emits one canonical JSON line for complete coverage", () => {
    const payload = receiptFixture()
    const result = runReceiptHelper(payload)

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.endsWith("\n")).toBe(true)
    expect(result.stdout.trim().split("\n")).toHaveLength(1)
    expect(JSON.parse(result.stdout)).toEqual(payload)
    expect(result.stdout).toBe(`${JSON.stringify(canonicalReceipt(payload))}\n`)
  })

  test("atomically writes the exact emitted canonical bytes with argv input and output", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "review-receipt-io-"))
    const input = path.join(root, "input.json")
    const output = path.join(root, "review.json")
    const payload = receiptFixture()

    try {
      await writeFile(input, JSON.stringify(payload))
      const result = runReceiptHelperArgs(["--input", input, "--output", output])

      expect(result.status, result.stderr).toBe(0)
      const outputBytes = await readFile(output)
      expect(outputBytes.equals(Buffer.from(result.stdout))).toBe(true)
      expect(result.stdout).toBe(`${JSON.stringify(canonicalReceipt(payload))}\n`)
      expect((await stat(output)).mode & 0o777).toBe(0o600)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("rejects symlink input paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "review-receipt-input-link-"))
    const source = path.join(root, "source.json")
    const input = path.join(root, "input.json")
    const output = path.join(root, "review.json")

    try {
      await writeFile(source, JSON.stringify(receiptFixture()))
      await symlink(source, input)
      const result = runReceiptHelperArgs(["--input", input, "--output", output])

      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/input[\s\S]*symlink/i)
      expect(await lstat(output).catch(() => null)).toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("rejects symlink output paths without changing their targets", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "review-receipt-output-link-"))
    const input = path.join(root, "input.json")
    const target = path.join(root, "target.json")
    const output = path.join(root, "review.json")

    try {
      await writeFile(input, JSON.stringify(receiptFixture()))
      await writeFile(target, "unchanged\n")
      await symlink(target, output)
      const result = runReceiptHelperArgs(["--input", input, "--output", output])

      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/output[\s\S]*symlink/i)
      expect(await readFile(target, "utf8")).toBe("unchanged\n")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("keeps complete status when only an optional peer failed", () => {
    const payload = receiptFixture({
      review_receipt: {
        base_sha: SHA40_A,
        head_sha: SHA40_B,
        branch: "feature/receipt",
        selected_reviewers: ["correctness-reviewer", "adversarial-openai"],
        required_reviewers: ["correctness-reviewer"],
        completed_reviewers: ["correctness-reviewer"],
        failed_reviewers: [
          { reviewer: "adversarial-openai", reason: "peer timed out", required: false },
        ],
        terminal_status: "complete",
      },
    })
    const result = runReceiptHelper(payload)

    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(payload)
  })

  test("rejects a selected optional reviewer without a terminal outcome", () => {
    const result = runReceiptHelper(receiptFixture({
      review_receipt: {
        base_sha: SHA40_A,
        head_sha: SHA40_B,
        branch: "feature/receipt",
        selected_reviewers: ["correctness-reviewer", "adversarial-openai"],
        required_reviewers: ["correctness-reviewer"],
        completed_reviewers: ["correctness-reviewer"],
        failed_reviewers: [],
        terminal_status: "complete",
      },
    }))

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("selected reviewer adversarial-openai has no terminal outcome")
  })

  test("rejects a reviewer recorded as both completed and failed", () => {
    const result = runReceiptHelper(receiptFixture({
      review_receipt: {
        base_sha: SHA40_A,
        head_sha: SHA40_B,
        branch: "feature/receipt",
        selected_reviewers: ["correctness-reviewer"],
        required_reviewers: ["correctness-reviewer"],
        completed_reviewers: ["correctness-reviewer"],
        failed_reviewers: [
          { reviewer: "correctness-reviewer", reason: "late malformed result", required: true },
        ],
        terminal_status: "complete",
      },
    }))

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("cannot be both completed and failed")
  })
  test("rejects scope head and branch identities that disagree with the receipt", () => {
    const headMismatch = runReceiptHelper(receiptFixture({ scope: {
      base: "pr:123", branch: "feature/receipt", head_sha: SHA40_A,
      pr_url: "https://github.com/example/repo/pull/123", files_changed: 2,
    } }))
    expect(headMismatch.status).not.toBe(0)
    expect(headMismatch.stderr).toContain("scope.head_sha must agree")

    const branchMismatch = runReceiptHelper(receiptFixture({ scope: {
      base: "pr:123", branch: "feature/other", head_sha: SHA40_B,
      pr_url: "https://github.com/example/repo/pull/123", files_changed: 2,
    } }))
    expect(branchMismatch.status).not.toBe(0)
    expect(branchMismatch.stderr).toContain("scope.branch must agree")
  })

  test("rejects failed reviewer requiredness that disagrees with required_reviewers", () => {
    const result = runReceiptHelper(receiptFixture({
      review_receipt: {
        base_sha: SHA40_A,
        head_sha: SHA40_B,
        branch: "feature/receipt",
        selected_reviewers: ["correctness-reviewer", "testing-reviewer"],
        required_reviewers: ["correctness-reviewer", "testing-reviewer"],
        completed_reviewers: ["correctness-reviewer"],
        failed_reviewers: [{ reviewer: "testing-reviewer", reason: "malformed return", required: false }],
        terminal_status: "complete",
      },
      reviewers: ["correctness", "testing"],
    }))
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("required flag disagrees with required_reviewers")
  })


  test("rejects an unselected completed reviewer", () => {
    const result = runReceiptHelper(receiptFixture({
      review_receipt: {
        base_sha: SHA40_A,
        head_sha: SHA40_B,
        branch: "feature/receipt",
        selected_reviewers: ["correctness-reviewer"],
        required_reviewers: ["correctness-reviewer"],
        completed_reviewers: ["correctness-reviewer", "testing-reviewer"],
        failed_reviewers: [],
        terminal_status: "complete",
      },
    }))

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("completed reviewer testing-reviewer is not selected")
  })

  test("rejects an unselected failed reviewer", () => {
    const result = runReceiptHelper(receiptFixture({
      review_receipt: {
        base_sha: SHA40_A,
        head_sha: SHA40_B,
        branch: "feature/receipt",
        selected_reviewers: ["correctness-reviewer"],
        required_reviewers: ["correctness-reviewer"],
        completed_reviewers: ["correctness-reviewer"],
        failed_reviewers: [
          { reviewer: "testing-reviewer", reason: "unexpected result", required: false },
        ],
        terminal_status: "complete",
      },
    }))

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("failed reviewer testing-reviewer is not selected")
  })

  test("rejects a missing required reviewer completion", () => {
    const result = runReceiptHelper(receiptFixture({
      review_receipt: {
        base_sha: SHA40_A,
        head_sha: SHA40_B,
        branch: "feature/receipt",
        selected_reviewers: ["correctness-reviewer", "testing-reviewer"],
        required_reviewers: ["correctness-reviewer", "testing-reviewer"],
        completed_reviewers: ["correctness-reviewer"],
        failed_reviewers: [],
        terminal_status: "complete",
      },
    }))

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("required reviewer")
  })

  test("rejects complete status when a required reviewer failed", () => {
    const result = runReceiptHelper(receiptFixture({
      review_receipt: {
        base_sha: SHA40_A,
        head_sha: SHA40_B,
        branch: "feature/receipt",
        selected_reviewers: ["correctness-reviewer"],
        required_reviewers: ["correctness-reviewer"],
        completed_reviewers: [],
        failed_reviewers: [
          { reviewer: "correctness-reviewer", reason: "malformed output", required: true },
        ],
        terminal_status: "complete",
      },
    }))

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("failed required reviewer")
  })

  test("rejects complete status when no reviewer produced a usable return", () => {
    const result = runReceiptHelper(receiptFixture({
      review_receipt: {
        base_sha: SHA40_A,
        head_sha: SHA40_B,
        branch: "feature/receipt",
        selected_reviewers: ["adversarial-openai"],
        required_reviewers: [],
        completed_reviewers: [],
        failed_reviewers: [
          { reviewer: "adversarial-openai", reason: "peer unavailable", required: false },
        ],
        terminal_status: "complete",
      },
    }))

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("correctness-reviewer")
  })

  test("rejects degraded status without a required coverage gap", () => {
    const result = runReceiptHelper(receiptFixture({
      status: "degraded",
      review_receipt: {
        base_sha: SHA40_A,
        head_sha: SHA40_B,
        branch: "feature/receipt",
        selected_reviewers: ["correctness-reviewer", "adversarial-openai"],
        required_reviewers: ["correctness-reviewer"],
        completed_reviewers: ["correctness-reviewer"],
        failed_reviewers: [
          { reviewer: "adversarial-openai", reason: "peer unavailable", required: false },
        ],
        terminal_status: "degraded",
      },
    }))

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("degraded receipt")
  })

  test("accepts degraded status with a usable return and required coverage gap", () => {
    const payload = receiptFixture({
      status: "degraded",
      review_receipt: {
        base_sha: SHA40_A,
        head_sha: SHA40_B,
        branch: "feature/receipt",
        selected_reviewers: ["correctness-reviewer", "testing-reviewer"],
        required_reviewers: ["correctness-reviewer", "testing-reviewer"],
        completed_reviewers: ["correctness-reviewer"],
        failed_reviewers: [
          { reviewer: "testing-reviewer", reason: "malformed output", required: true },
        ],
        terminal_status: "degraded",
      },
    })
    const result = runReceiptHelper(payload)

    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(payload)
  })

  test("rejects degraded status when no reviewer produced a usable return", () => {
    const result = runReceiptHelper(receiptFixture({
      status: "degraded",
      review_receipt: {
        base_sha: SHA40_A,
        head_sha: SHA40_B,
        branch: "feature/receipt",
        selected_reviewers: ["correctness-reviewer", "testing-reviewer"],
        required_reviewers: ["correctness-reviewer", "testing-reviewer"],
        completed_reviewers: [],
        failed_reviewers: [
          { reviewer: "correctness-reviewer", reason: "timed out", required: true },
          { reviewer: "testing-reviewer", reason: "malformed output", required: true },
        ],
        terminal_status: "degraded",
      },
    }))

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("no usable completed reviewer return")
  })

  test("accepts a full failed payload when every dispatched reviewer failed", () => {
    const payload = receiptFixture({
      status: "failed",
      verdict: "Not ready",
      review_receipt: {
        base_sha: SHA40_A,
        head_sha: SHA40_B,
        branch: "feature/receipt",
        selected_reviewers: ["correctness-reviewer", "adversarial-openai"],
        required_reviewers: ["correctness-reviewer"],
        completed_reviewers: [],
        failed_reviewers: [
          { reviewer: "correctness-reviewer", reason: "timed out", required: true },
          { reviewer: "adversarial-openai", reason: "peer unavailable", required: false },
        ],
        terminal_status: "failed",
      },
    })
    const result = runReceiptHelper(payload)

    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(payload)
  })

  test("rejects failed status when a usable reviewer return exists", () => {
    const result = runReceiptHelper(receiptFixture({
      status: "failed",
      verdict: "Not ready",
      review_receipt: {
        base_sha: SHA40_A,
        head_sha: SHA40_B,
        branch: "feature/receipt",
        selected_reviewers: ["correctness-reviewer", "testing-reviewer"],
        required_reviewers: ["correctness-reviewer", "testing-reviewer"],
        completed_reviewers: ["correctness-reviewer"],
        failed_reviewers: [
          { reviewer: "testing-reviewer", reason: "malformed output", required: true },
        ],
        terminal_status: "failed",
      },
    }))

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("failed status requires no usable completed reviewer returns")
  })


  test("rejects top-level and receipt status mismatch", () => {
    const result = runReceiptHelper(receiptFixture({
      status: "degraded",
    }))

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("status")
  })

  test("rejects non-concrete receipt SHAs", () => {
    const result = runReceiptHelper(receiptFixture({
      review_receipt: {
        base_sha: "pr:123",
        head_sha: SHA40_B,
        branch: "feature/receipt",
        selected_reviewers: ["correctness-reviewer"],
        required_reviewers: ["correctness-reviewer"],
        completed_reviewers: ["correctness-reviewer"],
        failed_reviewers: [],
        terminal_status: "complete",
      },
    }))

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("base_sha")
  })

  test("accepts remote scope identity with a 64-character concrete SHA", () => {
    const sha64 = "c".repeat(64)
    const payload = receiptFixture({
      scope: {
        base: "pr:321",
        branch: "fork-owner:feature/remote",
        head_sha: sha64,
        pr_url: "https://github.com/example/repo/pull/321",
        files_changed: 4,
      },
      review_receipt: {
        base_sha: "d".repeat(64),
        head_sha: sha64,
        branch: "fork-owner:feature/remote",
        selected_reviewers: ["correctness-reviewer"],
        required_reviewers: ["correctness-reviewer"],
        completed_reviewers: ["correctness-reviewer"],
        failed_reviewers: [],
        terminal_status: "complete",
      },
    })
    const result = runReceiptHelper(payload)

    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(payload)
  })
  test("rejects truncated canonical envelopes and noncanonical verdicts", () => {
    const missingFields = [
      "verdict", "scope", "intent", "intent_confidence", "reviewers", "findings",
      "actionable_findings", "triage_groups", "pre_existing_findings",
      "requirements_completeness", "learnings", "agent_native_gaps", "deployment_notes",
      "residual_risks", "testing_gaps", "coverage", "artifact_path", "run_id", "review_receipt",
    ]

    for (const field of missingFields) {
      const payload = receiptFixture()
      delete payload[field]
      expect(runReceiptHelper(payload).status, field).not.toBe(0)
    }
    for (const field of ["base", "branch", "head_sha", "pr_url", "files_changed"]) {
      const payload = receiptFixture()
      delete (payload.scope as Record<string, unknown>)[field]
      expect(runReceiptHelper(payload).status, `scope.${field}`).not.toBe(0)
    }
    expect(runReceiptHelper(receiptFixture({ verdict: "Looks good" })).status).not.toBe(0)
  })

  test("requires nonempty canonical core coverage and explicit top-level identity materialization", () => {
    const emptyRoster = receiptFixture({
      status: "failed",
      verdict: "Not ready",
      reviewers: [],
      review_receipt: {
        base_sha: SHA40_A, head_sha: SHA40_B, branch: "feature/receipt",
        selected_reviewers: [], required_reviewers: [], completed_reviewers: [],
        failed_reviewers: [], terminal_status: "failed",
      },
    })
    expect(runReceiptHelper(emptyRoster).status).not.toBe(0)

    const coreless = receiptFixture({
      reviewers: ["testing"],
      review_receipt: {
        base_sha: SHA40_A, head_sha: SHA40_B, branch: "feature/receipt",
        selected_reviewers: ["testing-reviewer"], required_reviewers: ["testing-reviewer"],
        completed_reviewers: ["testing-reviewer"], failed_reviewers: [], terminal_status: "complete",
      },
    })
    expect(runReceiptHelper(coreless).status).not.toBe(0)
    expect(runReceiptHelper(receiptFixture({ reviewers: ["correctness"] })).status).toBe(0)
    expect(runReceiptHelper(receiptFixture({ reviewers: ["security"] })).status).not.toBe(0)
    expect(runReceiptHelper(receiptFixture({ reviewers: ["correctness-v2"] })).status).not.toBe(0)
  })

  test("rejects suppressed findings and confidence-ineligible actionable findings", () => {
    for (const confidence of [0, 25]) {
      expect(runReceiptHelper(receiptFixture({
        findings: [receiptFinding({ confidence })],
      })).status, `full finding confidence ${confidence}`).not.toBe(0)
    }

    const moderate = receiptFinding({ confidence: 50 })
    expect(runReceiptHelper(receiptFixture({
      verdict: "Ready with fixes", findings: [moderate], actionable_findings: [moderate],
    })).status).not.toBe(0)

    const urgentModerate = receiptFinding({ severity: "P0", confidence: 50 })
    expect(runReceiptHelper(receiptFixture({
      verdict: "Ready with fixes", findings: [urgentModerate], actionable_findings: [urgentModerate],
    })).status).toBe(0)
  })
  test("requires high-confidence first evidence to quote evidence[0]", () => {
    const mismatched = receiptFinding({ first_evidence: "src/review.ts:99 -- unrelated()" })
    expect(runReceiptHelper(receiptFixture({ findings: [mismatched] })).status).not.toBe(0)
    const urgentModerate = receiptFinding({ severity: "P0", confidence: 50, first_evidence: undefined })
    expect(runReceiptHelper(receiptFixture({ verdict: "Ready with fixes", findings: [urgentModerate], actionable_findings: [urgentModerate] })).status).toBe(0)
  })


  test("rejects malformed full findings, duplicate ids, and non-exact actionable projections", () => {
    const requiredFields = [
      "#", "title", "severity", "file", "line", "confidence", "autofix_class", "owner",
      "requires_verification", "pre_existing", "suggested_fix", "first_evidence",
      "why_it_matters", "evidence", "reviewers", "independent_reviewers",
    ]
    for (const field of requiredFields) {
      const malformed = receiptFinding()
      delete malformed[field]
      expect(runReceiptHelper(receiptFixture({ findings: [malformed] })).status, field).not.toBe(0)
    }

    const first = receiptFinding()
    const duplicate = receiptFinding({ title: "Duplicate id" })
    expect(runReceiptHelper(receiptFixture({ findings: [first, duplicate], actionable_findings: [first, duplicate] })).status).not.toBe(0)

    const altered = receiptFinding({ suggested_fix: "Different fix." })
    expect(runReceiptHelper(receiptFixture({ verdict: "Ready with fixes", findings: [first], actionable_findings: [altered] })).status).not.toBe(0)

    expect(runReceiptHelper(receiptFixture({ verdict: "Ready with fixes", findings: [first], actionable_findings: [] })).status).not.toBe(0)
  })
})

describe("ce-code-review pr-remote merge-base evidence", () => {
  test("immutable PR endpoint fetches produce the fork merge base, not the advanced base tip", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-pr-remote-base-"))
    const origin = path.join(root, "origin.git")
    const seed = path.join(root, "seed")
    const review = path.join(root, "review")

    try {
      gitCommand(root, "init", "--bare", origin)
      gitCommand(root, "init", "-b", "main", seed)
      gitCommand(seed, "config", "user.email", "review-contract@example.com")
      gitCommand(seed, "config", "user.name", "Review Contract")

      const forkMergeBase = await commitFile(seed, "shared.txt", "shared\n", "shared base")
      gitCommand(seed, "switch", "-c", "feature")
      const headRefOid = await commitFile(seed, "feature.txt", "feature\n", "feature change")
      gitCommand(seed, "switch", "main")
      const baseRefOid = await commitFile(seed, "base.txt", "advanced\n", "advance base branch")
      gitCommand(seed, "remote", "add", "origin", origin)
      gitCommand(seed, "push", "origin", "main", "feature")

      gitCommand(root, "init", review)
      gitCommand(review, "remote", "add", "origin", origin)
      const privateBaseRef = "refs/review/pr-17-base-oid"
      const privateHeadRef = "refs/review/pr-17-head-oid"
      gitCommand(
        review,
        "fetch",
        "--no-tags",
        "origin",
        `+${baseRefOid}:${privateBaseRef}`,
        `+${headRefOid}:${privateHeadRef}`,
      )

      expect(gitCommand(review, "rev-parse", `${privateBaseRef}^{commit}`)).toBe(baseRefOid)
      expect(gitCommand(review, "rev-parse", `${privateHeadRef}^{commit}`)).toBe(headRefOid)
      const reviewedMergeBase = gitCommand(review, "merge-base", privateBaseRef, privateHeadRef)
      expect(reviewedMergeBase).toBe(forkMergeBase)
      expect(reviewedMergeBase).not.toBe(baseRefOid)
      const receiptResult = runReceiptHelper(receiptFixture({
        scope: {
          base: "pr:17",
          branch: "feature",
          head_sha: headRefOid,
          pr_url: "https://github.com/example/repo/pull/17",
          files_changed: 1,
        },
        review_receipt: {
          base_sha: reviewedMergeBase,
          head_sha: headRefOid,
          branch: "feature",
          selected_reviewers: ["correctness-reviewer"],
          required_reviewers: ["correctness-reviewer"],
          completed_reviewers: ["correctness-reviewer"],
          failed_reviewers: [],
          terminal_status: "complete",
        },
      }))
      expect(receiptResult.status, receiptResult.stderr).toBe(0)
      expect(JSON.parse(receiptResult.stdout).review_receipt.base_sha).toBe(forkMergeBase)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
  test("cross-model initial and retry dispatch preserve compatible overrides", async () => {
    const contract = await readRepoFile("skills/ce-code-review/references/cross-model-review.md")
    expect((contract.match(/CROSS_MODEL_MODEL_OVERRIDE_TARGET=/g) ?? []).length).toBeGreaterThanOrEqual(5)
    expect((contract.match(/CROSS_MODEL_MODEL_OVERRIDE=/g) ?? []).length).toBeGreaterThanOrEqual(5)
    const initialFence = contract.split('start --skill ce-code-review --run-id "<run-id>" --label adversarial')[0].split("```bash").at(-1) ?? ""
    const retryFence = contract.split('start --skill ce-code-review --run-id "<run-id>" --label adversarial-retry')[0].split("```bash").at(-1) ?? ""
    for (const fence of [initialFence, retryFence]) {
      expect(fence).toContain("CROSS_MODEL_MODEL_OVERRIDE_TARGET")
      expect(fence).toContain("CROSS_MODEL_MODEL_OVERRIDE")
    }
  })
  test("cross-model no-job recovery is one bounded identical start", async () => {
    const contract = await readRepoFile("skills/ce-code-review/references/cross-model-review.md")
    expect(contract).toContain("No-job same-route recovery")
    expect(contract).toMatch(/rerun that exact `start` fence at most once/i)
    expect(contract).toMatch(/same run ID, target, fixed route, model override pair, scope file, base ref, and hard-cap environment/i)
    expect(contract).toMatch(/second start.*no job ID.*local adversarial fallback/i)
  })

  test("cross-model coverage reports sampled scope truthfully", async () => {
    const contract = await readRepoFile("skills/ce-code-review/references/cross-model-review.md")
    expect(contract).toMatch(/coverage_mode.*scope_digest.*sampled division IDs/is)
    expect(contract).toMatch(/coverage_mode=oversized.*sampled corroboration/is)
    expect(contract).toMatch(/empty findings array.*sampled divisions.*not a whole-change clean bill/is)
  })
})

describe("ce-code-review productive timeout contract", () => {
  test("bounds oversized corroboration and narrows productive timeout retries", async () => {
    const skill = await readRepoFile("skills/ce-code-review/SKILL.md")
    const reference = await readRepoFile("skills/ce-code-review/references/cross-model-review.md")
    const dispatch = await readRepoFile("skills/ce-code-review/references/dispatch-reviewers.md")
    const persona = await readRepoFile("skills/ce-code-review/references/personas/adversarial-reviewer.md")
    const docs = await readRepoFile("docs/skills/ce-code-review.md")
    const combined = `${skill}\n${reference}\n${dispatch}\n${persona}\n${docs}`

    expect(reference).toMatch(/oversized[\s\S]{0,900}at most two[\s\S]{0,500}risk divisions/i)
    expect(reference).toMatch(/one failure question[\s\S]{0,250}one to three[\s\S]{0,250}path prefixes/i)
    expect(reference).toMatch(/productive_scope_timeout[\s\S]{0,1200}same[\s\S]{0,120}route[\s\S]{0,250}hard cap/i)
    expect(reference).toMatch(/retry[\s\S]{0,800}materially narrower/i)
    expect(combined).toMatch(/(?:unchanged scope|unchanged-scope)[\s\S]{0,400}(?:must not|forbidden|fail closed|never retry)/i)
    expect(combined).toMatch(/(?:larger hard cap|increase the hard cap|raises the cap)[\s\S]{0,400}(?:must not|forbidden|fail closed|never)/i)
    expect(combined).toMatch(/progress[\s\S]{0,400}non.finding evidence/i)
    expect(combined).toMatch(/terminal[\s\S]{0,400}schema.shaped[\s\S]{0,400}(?:only|sole)/i)
    expect(docs).toMatch(/risk.sampled corroboration/i)
  })
})

describe("ce-code-review agent receipt contract", () => {
  test("exposes reviewed state and canonical required reviewer coverage", async () => {
    const skill = await readRepoFile("skills/ce-code-review/SKILL.md")
    const finish = await readRepoFile("skills/ce-code-review/references/finish-review.md")
    const template = await readRepoFile("skills/ce-code-review/references/review-output-template.md")
    expect(skill).toContain("baseRefOid")
    expect(skill).toMatch(/--json[^\n]*baseRefOid[^\n]*headRefOid/)
    expect(skill).toContain('"$NODE" "$SKILL_DIR/scripts/pr-scope.mjs"')
    expect(skill).toMatch(/pr-remote[^\n]*merge base[^\n]*immutable PR base\/head OIDs[^\n]*before reviewer dispatch/i)
    expect(skill).toMatch(/pr-remote[\s\S]{0,2600}fail[^\n]*before reviewer dispatch/i)
    expect(finish).toMatch(/pr-remote[^\n]*computed merge base[^\n]*Stage 1/i)
    expect(finish).not.toMatch(/use immutable PR metadata `baseRefOid`/i)
    const receiptFence = [...finish.matchAll(/```bash\n([\s\S]*?)\n```/g)]
      .map((match) => match[1])
      .find((block) => block.includes("review-receipt.mjs"))
    expect(receiptFence).toBeDefined()
    expect(receiptFence).toContain('SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";')
    expect(receiptFence).toContain('for c in node nodejs')
    expect(receiptFence).toContain('"$NODE" "$SKILL_DIR/scripts/review-receipt.mjs"')
    expect(receiptFence).toContain('--input "$RUN_DIR/final-review-input.json"')
    expect(receiptFence).toContain('--output "$RUN_DIR/review.json"')
    expect(receiptFence).not.toMatch(/(?:^|\s)cat(?:\s|$)/)

    for (const field of [
      "review_receipt",
      "base_sha",
      "head_sha",
      "branch",
      "selected_reviewers",
      "required_reviewers",
      "completed_reviewers",
      "failed_reviewers",
      "terminal_status",
    ]) {
      expect(skill).toContain(field)
      expect(finish).toContain(field)
    }

    for (const contract of [skill, finish]) {
      expect(contract).toMatch(/selected_reviewers[\s\S]{0,500}canonical final roster/i)
      expect(contract).toMatch(/optional cross-model peer[\s\S]{0,240}(?:remains optional|is excluded)/i)
    }
    for (const contract of [skill, finish]) {
      expect(contract).toContain(
        "Top-level `status` and `review_receipt.terminal_status` must agree",
      )
      expect(contract).toMatch(
        /base_sha[^\n]*concrete[^\n]*(?:never|not)[^\n]*(?:pr:N|logical)[^\n]*unresolved/i,
      )
      expect(contract).toMatch(/branch[^\n]*head_sha[^\n]*(?:reviewed scope|scope identity)[^\n]*before dispatch/i)
      expect(contract).toMatch(
        /standalone[^\n]*base:[^\n]*local-aligned[^\n]*(?:checkout branch|checkout)[^\n]*HEAD/i,
      )
      expect(contract).toMatch(
        /pr-remote[^\n]*branch-remote[^\n]*(?:reviewed head branch\/ref identity|reviewed head)[^\n]*concrete reviewed head SHA[^\n]*(?:not|unrelated checkout)/i,
      )
      expect(contract).toContain(
        "`complete` means every required reviewer completed and no required reviewer failed",
      )
      expect(contract).toContain(
        "A recorded optional failure (`required: false`) does not degrade `complete`",
      )
      expect(contract).toContain(
        "Every selected reviewer must appear in exactly one of `completed_reviewers` or `failed_reviewers`",
      )
      expect(contract).toContain("no terminal outcome may name an unselected reviewer")
      expect(contract).toContain(
        "Use `degraded` only when at least one reviewer produced a usable completed return but a required reviewer failed",
      )
      expect(contract).toContain(
        "Use `failed` when dispatch began but no reviewer produced a usable completed return",
      )
    }
    expect(`${skill}\n${finish}`).toMatch(
      /required_reviewers[\s\S]*(?:downstream )?callers? must not (?:reconstruct|infer) requiredness/i,
    )
    expect(finish).toContain("payload on disk must byte-match the emitted JSON object")
    expect(finish).toContain("valid returns actually folded into synthesis")
    expect(finish).toMatch(/failed, timed out, or returned malformed output/i)
    expect(finish).toMatch(/Once any reviewer dispatch begins[\s\S]*complete, degraded, and failed/i)
    expect(template).toContain("review_receipt")
    expect(template).toContain("absent only when the invocation fails or skips before reviewer dispatch begins")
  })
})


describe("ce-code-review PR scope helper", () => {
  test("fetches immutable endpoints and emits the reviewed merge base without changing checkout state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-pr-scope-helper-"))
    const origin = path.join(root, "origin.git")
    const seed = path.join(root, "seed")
    const review = path.join(root, "review")
    const helper = path.join(process.cwd(), "skills/ce-code-review/scripts/pr-scope.mjs")

    try {
      gitCommand(root, "init", "--bare", origin)
      gitCommand(root, "init", "-b", "main", seed)
      gitCommand(seed, "config", "user.email", "pr-scope@example.com")
      gitCommand(seed, "config", "user.name", "PR Scope Contract")

      const forkMergeBase = await commitFile(seed, "shared.txt", "shared\n", "shared base")
      gitCommand(seed, "switch", "-c", "feature")
      const headRefOid = await commitFile(seed, "feature.txt", "feature\n", "feature change")
      gitCommand(seed, "switch", "main")
      const baseRefOid = await commitFile(seed, "base.txt", "advanced\n", "advance base")
      gitCommand(seed, "remote", "add", "origin", origin)
      gitCommand(seed, "push", "origin", "main", "feature")

      gitCommand(root, "init", review)
      gitCommand(review, "remote", "add", "origin", origin)
      const checkoutBefore = gitCommand(review, "symbolic-ref", "HEAD")
      const result = Bun.spawnSync(
        [process.execPath, helper, review, "origin", "17", baseRefOid, headRefOid],
        { stdout: "pipe", stderr: "pipe" },
      )

      expect(result.exitCode, result.stderr.toString()).toBe(0)
      expect(result.stdout.toString().trim().split("\n")).toHaveLength(1)
      const payload = JSON.parse(result.stdout.toString())
      expect(payload).toMatchObject({
        status: "ok",
        base_sha: forkMergeBase,
        head_sha: headRefOid,
      })
      expect(payload.base_oid_ref).toMatch(/^refs\/review\/pr-17-[0-9a-f]{24}-base-oid$/)
      expect(payload.head_oid_ref).toMatch(/^refs\/review\/pr-17-[0-9a-f]{24}-head-oid$/)
      expect(payload.base_oid_ref.replace(/-base-oid$/, "")).toBe(payload.head_oid_ref.replace(/-head-oid$/, ""))
      expect(forkMergeBase).not.toBe(baseRefOid)
      expect(gitCommand(review, "symbolic-ref", "HEAD")).toBe(checkoutBefore)
      expect(gitCommand(review, "status", "--porcelain")).toBe("")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
  test("pins concurrent reviews of one PR number to distinct endpoint refs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-pr-scope-concurrent-"))
    const origin = path.join(root, "origin.git")
    const seed = path.join(root, "seed")
    const review = path.join(root, "review")
    const helper = path.join(process.cwd(), "skills/ce-code-review/scripts/pr-scope.mjs")
    try {
      gitCommand(root, "init", "--bare", origin)
      gitCommand(root, "init", "-b", "main", seed)
      gitCommand(seed, "config", "user.email", "pr-scope@example.com")
      gitCommand(seed, "config", "user.name", "PR Scope Contract")
      const base = await commitFile(seed, "base.txt", "base\n", "base")
      gitCommand(seed, "switch", "-c", "feature")
      const headOne = await commitFile(seed, "feature.txt", "one\n", "head one")
      const headTwo = await commitFile(seed, "feature.txt", "two\n", "head two")
      gitCommand(seed, "remote", "add", "origin", origin)
      gitCommand(seed, "push", "origin", "main", "feature")
      gitCommand(root, "init", review)
      gitCommand(review, "remote", "add", "origin", origin)
      const first = Bun.spawnSync([process.execPath, helper, review, "origin", "17", base, headOne], { stdout: "pipe", stderr: "pipe" })
      const second = Bun.spawnSync([process.execPath, helper, review, "origin", "17", base, headTwo], { stdout: "pipe", stderr: "pipe" })
      expect(first.exitCode, first.stderr.toString()).toBe(0)
      expect(second.exitCode, second.stderr.toString()).toBe(0)
      const firstPayload = JSON.parse(first.stdout.toString())
      const secondPayload = JSON.parse(second.stdout.toString())
      expect(firstPayload.head_oid_ref).not.toBe(secondPayload.head_oid_ref)
      expect(gitCommand(review, "rev-parse", `${firstPayload.head_oid_ref}^{commit}`)).toBe(headOne)
      expect(gitCommand(review, "rev-parse", `${secondPayload.head_oid_ref}^{commit}`)).toBe(headTwo)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })


  test("rejects unsafe endpoint identity before invoking git", async () => {
    const helper = path.join(process.cwd(), "skills/ce-code-review/scripts/pr-scope.mjs")
    const result = Bun.spawnSync(
      [process.execPath, helper, "/missing/repo", "origin", "../escape", "a".repeat(40), "b".repeat(40)],
      { stdout: "pipe", stderr: "pipe" },
    )

    expect(result.exitCode).not.toBe(0)
    expect(result.stdout.toString()).toBe("")
    expect(result.stderr.toString().trim().split("\n")).toHaveLength(1)
    expect(result.stderr.toString()).toMatch(/namespace/i)
    expect(result.stderr.toString()).not.toContain("missing/repo")
  })

  test("rejects non-concrete endpoint OIDs before invoking git", () => {
    const helper = path.join(process.cwd(), "skills/ce-code-review/scripts/pr-scope.mjs")

    for (const [baseOid, headOid, field] of [
      ["main", "b".repeat(40), "base OID"],
      ["a".repeat(40), "HEAD", "head OID"],
    ] as const) {
      const result = Bun.spawnSync(
        [process.execPath, helper, "/missing/repo", "origin", "17", baseOid, headOid],
        { stdout: "pipe", stderr: "pipe" },
      )

      expect(result.exitCode).not.toBe(0)
      expect(result.stdout.toString()).toBe("")
      expect(result.stderr.toString().trim().split("\n")).toHaveLength(1)
      expect(result.stderr.toString()).toContain(field)
      expect(result.stderr.toString()).not.toContain("missing/repo")
    }
  })

  test("documents one flatten-safe argv invocation and consumes its JSON contract", async () => {
    const skill = await readRepoFile("skills/ce-code-review/SKILL.md")
    const stage = skill.slice(
      skill.indexOf("### Stage 1: Determine scope"),
      skill.indexOf("### Stage 1b: Compute scope signals"),
    )
    const helperBlocks = [...stage.matchAll(/```bash\n([\s\S]*?pr-scope\.mjs[\s\S]*?)\n```/g)]

    expect(helperBlocks).toHaveLength(1)
    const command = helperBlocks[0][1]
    expect(command.trim().split("\n")).toHaveLength(3)
    expect(command).toContain('SKILL_DIR="<absolute path of the directory containing the ce-code-review SKILL.md you read>";')
    expect(command).toContain('NODE="$(for c in node nodejs;')
    expect(command).toContain('"$NODE" "$SKILL_DIR/scripts/pr-scope.mjs"')
    expect(command).toContain("[ -n \"$NODE\" ]")

    const syntax = Bun.spawnSync(["bash", "-n"], {
      stdin: new TextEncoder().encode(command.replace(/\n/g, " ")),
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(syntax.exitCode, syntax.stderr.toString()).toBe(0)
    expect(stage).toMatch(/load[^\n]*JSON[^\n]*base_oid_ref[^\n]*head_oid_ref[^\n]*base_sha[^\n]*head_sha/i)
    expect(stage).toMatch(/PR_BASE_REF[^\n]*base_sha/)
    expect(stage).toMatch(/PR_HEAD_REF[^\n]*head_oid_ref/)
    expect(stage).toMatch(/gh pr diff[^\n]*canonical/i)
    expect(stage).toMatch(/fail[^\n]*before reviewer dispatch/i)
  })
})