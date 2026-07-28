import { readFile } from "fs/promises"
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

  test("uses headless mode by default and in pipeline context", async () => {
    const content = await readRepoFile("skills/ce-plan/references/plan-handoff.md")

    // Default at Phase 5.3.8 is `mode:headless` so users opt into deeper interactive review
    // explicitly from the post-generation menu rather than being forced through it.
    expect(content).toContain("ce-doc-review` with `mode:headless`")
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
    // without relying on free-form prompting; routed through ce-doc-review without headless mode.
    expect(content).toContain("**Decide on the review's open items**")
    expect(content).toContain("`ce-doc-review`")
    expect(content).toContain("without** `mode:headless`")

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

  test("headless envelope surfaces new tiers distinctly", async () => {
    const synthesis = await readRepoFile(
      "skills/ce-doc-review/references/synthesis-and-presentation.md"
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
