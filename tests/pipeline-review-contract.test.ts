import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

function sliceSection(content: string, startAnchor: string, endAnchor: string): string {
  const start = content.indexOf(startAnchor)
  expect(start, `start anchor not found: ${startAnchor}`).toBeGreaterThanOrEqual(0)
  const end = content.indexOf(endAnchor, start + startAnchor.length)
  expect(end, `end anchor not found: ${endAnchor}`).toBeGreaterThan(start)
  return content.slice(start, end)
}

async function readCeWorkImplementationContract(): Promise<string> {
  const skill = await readRepoFile("skills/ce-work/SKILL.md")
  const implementationLoop = await readRepoFile("skills/ce-work/references/implementation-loop.md").catch(() => "")
  const returnToCaller = await readRepoFile("skills/ce-work/references/return-to-caller.md").catch(() => "")
  return `${skill}\n${implementationLoop}\n${returnToCaller}`
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

    // Quality checklist requires receipt or exact skip phrase (completion gate)
    expect(shipping).toContain("Code review completion gate")
    expect(shipping).toContain("Ship-handoff gate")
  })

  // Issue #1351: prose-only review mandate was silently skipped. The always-loaded
  // body owns the completion predicate; the required shipping owner owns receipt and
  // fallback mechanics, including the exact phrases and mechanical exclusions.
  test("standalone shipping has an always-loaded code-review completion gate", async () => {
    const content = await readRepoFile("skills/ce-work/SKILL.md")
    const shipping = await readRepoFile("skills/ce-work/references/shipping-workflow.md")

    // Always-loaded body owns the gate (not only the lazy reference)
    expect(content).toContain("Code-review completion gate")
    expect(content).toContain("not done")
    expect(content).toContain("must not call a commit or shipping skill")
    expect(content).toContain("actual completed `ce-code-review` receipt")
    expect(content).toContain("exact authorized skip states")
    expect(content).toContain("Never substitute")
    expect(content).toContain("mental self-review")
    expect(content).toContain("does not apply in Return-to-Caller Mode")

    // Reference mirrors gate + ship-handoff bind + mechanical exclusions
    expect(shipping).toContain("Completion gate (standalone shipping)")
    expect(shipping).toContain("Ship-handoff gate")
    expect(shipping).toContain('do not push "and review later."')
    expect(shipping).toContain("applying external or prior review findings")
    expect(shipping).toContain("status: complete")
    expect(shipping).toContain("Code review: skipped (mechanical diff)")
    expect(shipping).toContain("Code review: skipped (ce-code-review unavailable)")
    expect(shipping).toContain("Code review: harness-native fallback")
    expect(shipping).toContain("multi-file mechanical-only")
    expect(shipping).toContain("Never substitute")
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
    // Phase 5.1's review checklist moved into the reference ce-plan's body names
    // as a required read before the plan is written (#1412 restructure).
    const content = await readRepoFile("skills/ce-plan/references/final-review.md")

    // Phase 5.1 review checklist addresses blank test scenarios
    expect(content).toContain("blank or missing test scenarios")
    expect(content).toContain("Test expectation: none")

    // Template comment mentions the annotation convention
    expect(content).toContain("Test expectation: none -- [reason]")
  })

  test("keeps execution direction natural-language instead of enum-based", async () => {
    // The core principle and the per-unit Execution note field moved into the
    // references ce-plan's body names as required reads (#1412 restructure);
    // the rule is pinned across both so it cannot be dropped in either.
    const content =
      (await readRepoFile("skills/ce-plan/references/intake.md")) +
      (await readRepoFile("skills/ce-plan/references/research.md")) +
      (await readRepoFile("skills/ce-plan/references/structure.md"))

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

  test("ce-work return contract owns the verification_evidence field and gates completion on it", async () => {
    const returnBlock = await readRepoFile("skills/ce-work/references/return-to-caller.md")

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
    // The gate's field-level contract lives in the reference lfg's step 2 names as a
    // required read before accepting a return; the body keeps the stop classes.
    const gate = await readRepoFile("skills/lfg/references/work-return.md")

    for (const { fact, lfg: phrase } of EVIDENCE_FACTS) {
      expect(gate, `lfg gate must require ${fact} ("${phrase}")`).toContain(phrase)
    }

    // The field is always present; behavior-changing work makes its contents non-empty and specific.
    expect(gate).toContain("When `behavior_change: true`, `verification_evidence` must name")
    expect(gate).toContain("Do NOT decide the test strategy inside LFG")
  })

  test("lfg retries ce-work exactly once for evidence, then blocks rather than ships", async () => {
    const gate = await readRepoFile("skills/lfg/references/work-return.md")

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

describe("missing-owner blocked seam parity (ce-plan/ce-work -> lfg)", () => {
  test("every ce-plan owner blocker is structured and artifact presence suppresses retry", async () => {
    const [cePlan, planBrief, lfg] = await Promise.all([
      readRepoFile("skills/ce-plan/SKILL.md"),
      readRepoFile("skills/lfg/references/plan-brief.md"),
      readRepoFile("skills/lfg/SKILL.md"),
    ])
    const cePlanEnvelope = sliceSection(
      cePlan,
      "In pipeline mode, every required-owner failure returns",
      "### Phase 0: Output, Resume, and Scope",
    )
    const lfgEnvelope = sliceSection(
      planBrief,
      "An explicit `status: blocked` return is terminal",
      "Read the plan metadata before continuing",
    )
    for (const field of ["`status: blocked`", "`phase`", "`blocker`", "`recovery_path`"]) {
      expect(cePlanEnvelope).toContain(field)
      expect(lfgEnvelope).toContain(field)
    }
    expect(cePlanEnvelope).toContain("include `artifact_path`")
    expect(lfgEnvelope).toContain("`artifact_path`")
    // 2026-08-21 eval (P9): a host that reads every phase owner at kernel load never re-reads the terminal owner,
    // so the late-owner blocked path was unreachable on Claude; the kernel must say an early read does not count.
    expect(cePlan).toContain("a read made before that phase does not satisfy it")
    expect(cePlan).toContain("a terminal owner is read again at its step even when already in context")
    expect(lfg).toContain("Blocked status outranks an existing artifact")
    expect(lfg).toContain("Only absence of both a blocker and a plan file")
    // 2026-08-21 eval: a stale plan already under <root>/plans/ satisfied the gate once; the gate keys on the reported path.
    expect(lfg).toContain("a plan file `ce-plan` reported writing this run")
    expect(planBrief).toContain("the path `ce-plan` reported writing this run")
  })

  test("lfg decides a require-route fallback from the return, consistent with ce-work's producer contract", async () => {
    // 2026-08-21 eval: ce-work (cross-model-execution.md) discloses and continues natively under `require`; the consumer
    // used to say ce-work "must not fall back", which no return could satisfy. The stop is now keyed on the return fields.
    const [workReturn, crossModel] = await Promise.all([
      readRepoFile("skills/lfg/references/work-return.md"),
      readRepoFile("skills/ce-work/references/cross-model-execution.md"),
    ])
    expect(crossModel).toContain("continue on the current harness and session model")
    expect(workReturn).toContain("`implementation_engine_binding.mode` is `require` and whose `actual_route` differs from `requested_route` stops the pipeline as blocked")
    expect(workReturn).not.toContain("must not prompt, fall back, or start native work")
  })

  test("the reduced ce-work blocker matches the authoritative field inventory", async () => {
    const [ceWork, workReturn] = await Promise.all([
      readRepoFile("skills/ce-work/SKILL.md"),
      readRepoFile("skills/lfg/references/work-return.md"),
    ])
    const ceWorkSection = sliceSection(
      ceWork,
      "If that required read fails after planning or implementation created state",
      "Do not erase partial state",
    )
    const lfgSection = sliceSection(
      workReturn,
      "## Missing-owner blocked return",
      "## What each route outcome means",
    )
    const required = ["status: blocked", "plan_path", "run_id", "changed_state", "blockers", "recovery_path"]
    for (const field of required) {
      expect(ceWorkSection).toContain(field)
      expect(lfgSection).toContain(field)
    }
    expect(lfgSection).toContain("valid terminal blocker")
    expect(lfgSection).toContain("complete-return field inventory below does not apply")
  })
})

describe("cross-model execution receipt seam parity (ce-work <-> lfg)", () => {
  const COMPLETE_RETURN_FIELDS = [
    "status",
    "plan_path",
    "changed_files",
    "u_ids_attempted",
    "u_ids_completed",
    "verification_results",
    "verification_evidence",
    "implementation_engine_binding",
    "requested_route",
    "actual_route",
    "requested_model",
    "actual_model",
    "fallback_reason",
    "run_id",
    "source_kind",
    "source_digest",
    "unit_receipts",
    "plan_checkpoint",
    "blockers",
    "recovery_path",
    "settled_decision_conflicts",
    "behavior_change",
    "standalone_shipping_skipped",
  ]

  test("one full inventory pins every ce-work producer field and lfg consumer gate", async () => {
    const returned = await readRepoFile("skills/ce-work/references/return-to-caller.md")
    const workReturn = await readRepoFile("skills/lfg/references/work-return.md")
    const gate = sliceSection(
      workReturn,
      "## What `status: complete` must carry",
      "## Verification evidence",
    )

    for (const field of COMPLETE_RETURN_FIELDS) {
      const fieldToken = new RegExp("`" + field + "(?:`|:)")
      expect(returned, `ce-work must return ${field}`).toMatch(fieldToken)
      expect(gate, `lfg must require ${field} on every complete return`).toMatch(fieldToken)
    }
  })

  test("lfg fails closed for unknown or malformed work returns", async () => {
    const lfg = await readRepoFile("skills/lfg/SKILL.md")
    const gate = sliceSection(
      lfg,
      "2. **Read `references/work-return.md` first**",
      "3. **Read `references/review-followup.md` now**",
    )

    expect(gate).toContain("Only a valid `status: complete` may advance")
    expect(gate).toContain("every other status")
    expect(gate).toContain("malformed return")
    expect(gate).toContain("stops the pipeline")
  })

  test("lfg keeps the binding out of plan and review inputs", async () => {
    // Carrier grammar and sanitization live in the reference lfg's routing section
    // names as a required read before step 1.
    const carrier = await readRepoFile("skills/lfg/references/stage-routing.md")
    expect(carrier).toContain("Remove every routing directive")
    expect(carrier).toContain("Never pass")
    expect(carrier).toContain("`ce-plan`")
    expect(carrier).toContain("`ce-code-review`")
    expect(carrier).toContain("feature content")
  })
})

describe("ce-debug regression test selection", () => {
  // Added by #1054 to stop agents defaulting to a brand-new test file. The four homes are
  // the mechanic of Phase 3's test-first step, and `references/fix.md` is a required read
  // before any file is edited, so they are pinned across the corpus rather than verbatim
  // in the always-loaded body. What must decide from the window without a read is the
  // condition -- start from the tests that exist -- plus the confirmed-defect precondition
  // that keeps the divergent case out; those two stay pinned in the body.
  test("inspects and updates existing tests instead of always adding new tests", async () => {
    const body = await readRepoFile("skills/ce-debug/SKILL.md")
    const fix = await readRepoFile("skills/ce-debug/references/fix.md")
    const corpus = [body, fix].join("\n")

    expect(body).toMatch(/start from the tests that exist rather than from a new file/i)
    expect(body).toMatch(/confirmed defect/i)
    expect(corpus).toContain("inspect existing tests before adding coverage")
    expect(corpus).toContain("update an existing test when it owns the contract")
    expect(corpus).toContain("strengthen an over-mocked test")
    expect(corpus).toContain("add a new minimal isolated test only when no existing test is the right home")
  })

  // Observed drift: agents fired the Phase 2 fix-choice question on "root cause
  // confirmed" alone, so the user chose Fix / Diagnosis-only from a modal stem with
  // none of the causal chain on screen. Prose order alone did not hold it; the gate
  // must stay stated as a blocking precondition next to the question.
  test("gates the fix-choice question on the findings block being presented first", async () => {
    const content = await readRepoFile("skills/ce-debug/SKILL.md")

    expect(content).toContain("Same-turn presentation before the gate")
    expect(content).toMatch(
      /do not open the fix-choice question until that findings block has been written in full/i,
    )
    // The gate must be anchored at the question site, not stated only in an early section.
    const gateIdx = content.indexOf("Same-turn presentation before the gate")
    const askIdx = content.indexOf("Then ask (per **Blocking questions**)")
    expect(gateIdx).toBeGreaterThan(-1)
    expect(askIdx).toBeGreaterThan(gateIdx)
  })

  // Regression guard for the failure class in
  // docs/solutions/skill-design/post-menu-routing-belongs-inline.md (issue #714):
  // Phase 4's per-case actions are always reached once a fix lands, so they must live
  // in the always-loaded SKILL.md body. A reference-only copy lets an agent that skipped
  // the load stop at the summary, or ship without `branding:on`.
  test("keeps Phase 4 per-case handoff routing inline, not reference-only", async () => {
    const content = await readRepoFile("skills/ce-debug/SKILL.md")
    const routing = content.slice(content.indexOf("#### Routing"))

    expect(content).toContain("#### Routing")
    // Every case names its action, and the action is a skill invocation, not advice
    // to the user to type a command.
    expect(routing).toContain("via the platform's skill-invocation primitive")
    expect(routing).toContain("`ce-commit-push-pr` skill with `branding:on`")
    expect(routing).toMatch(/invoke the `ce-commit` skill/i)
    expect(routing).toContain("Stop here")
    expect(routing).toContain("`ce-compound`")

    // Opening a PR is the default, not a question. The old three-option permission
    // menu returning here is the regression this pins.
    expect(routing).toMatch(/do not ask whether to open a pr/i)
    expect(routing).not.toMatch(/commit the fix \(`ce-commit`\)/i)

    // ...but "no question" is not "always push". `ce-commit-push-pr` pushes the whole
    // branch and PRs every commit on it, so a branch carrying the user's unrelated work
    // must commit locally instead. Pin the goal and the refusal, not case labels: three
    // separate holes shipped here because routes were written as a flat case list and
    // each new state matched one case while skipping another's handling.
    expect(routing).toMatch(/anything the user did not offer up/i)
    expect(routing).toMatch(/push nothing/i)
    // The two questions must stay independent — collapsing them back into one flat list
    // is what let "no remote" match a route that skipped commit scoping entirely.
    expect(routing).toMatch(/the fix-owned files and nothing else/i)
    expect(routing).toMatch(/holds on every route, remote or not/i)
    // ...and question 1 must stay a constraint. When it also told the agent to invoke
    // `ce-commit`, the shipping path committed twice (once there, once inside
    // `ce-commit-push-pr`) and a non-repo tried to commit before reaching its stop.
    expect(routing).toMatch(/never an action of its own/i)
    expect(routing).toMatch(/exactly one of these runs/i)
    // The ship gate turns on whether the branch's other commits are already under
    // review, not on whether they were pushed. Gating on "commits since base" refuses
    // the route to a branch with an open PR (the fix never reaches it); gating on
    // "unpushed" lets backup-pushed WIP be swept into a first PR spanning it.
    expect(routing).toMatch(/updates that PR rather than opening a second one/i)
    // Pin the knowledge the agent cannot derive, NOT the git commands that answer it.
    // Six revisions of this gate each prescribed a range or ref, and five were wrong for
    // some git configuration (no upstream, local ahead of remote, no tracking config).
    // The intent was never what reviewers found wrong, so the commands are gone and
    // these pins guard the facts that make the check non-obvious.
    expect(routing).toMatch(/whole branch/i)
    expect(routing).toMatch(/not already \*\*offered\*\*/i)
    expect(routing).toMatch(/compare against the remote rather than a local ref/i)
    expect(routing).toMatch(/PR-capable/i)
    // Failing to establish it must fall to the local route, never to shipping anyway.
    expect(routing).toMatch(/take the local route instead/i)
    // Declining the entangled commit must terminate, not fall through to question 2 and
    // commit the very file the user chose to leave alone.
    expect(routing).toMatch(/only the first answer continues/i)
    // The entangled state is the one place a blocking question survives — no safe
    // default exists once a fix-owned file already held the user's edits.
    expect(routing).toMatch(/Ask \(per \*\*Blocking questions\*\*\)/)

    // The reference load must still be demanded, and must not be improvisable from the
    // inline routing: it has to name what only it carries and what skipping it costs.
    const stub = content.slice(
      content.indexOf("If Phase 3 ran, read"),
      content.indexOf("#### Routing"),
    )
    expect(stub).toContain("`references/post-fix-handoff.md`")
    expect(stub).toMatch(/none of that appears in this body/i)
    expect(stub).toMatch(/skipping the read/i)
  })

  // The reported failure was a skill proposing a Linear ticket for a bug the user had
  // already handed it as a Sentry issue. The rule that prevents it spans Phase 0, Phase
  // 1.4, and the handoff reference, so pin the load-bearing clause in each.
  test("links an existing issue of record instead of creating a second one", async () => {
    const content = await readRepoFile("skills/ce-debug/SKILL.md")
    const handoff = await readRepoFile("skills/ce-debug/references/post-fix-handoff.md")

    // Phase 0 records whatever the user supplied, tracker or error monitor alike.
    expect(content).toMatch(/issue of record/i)
    expect(content).toMatch(/Sentry/)
    // The no-reference input (stack trace, failing test) has no record and needs none —
    // without this, "never open a second record" still permits opening a first.
    expect(content).toMatch(/no issue of record/i)
    // Phase 1.4 reads prior work; it cannot become the bug's home.
    expect(content).toMatch(/never establishes a new home for the bug/i)
    // Linking an existing ticket stays allowed; only creating one is forbidden.
    expect(handoff).toMatch(/never open a new record/i)
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
      "They invoke `ce-doc-review` with `mode:non-interactive` and the plan path",
    )
    expect(skillStub).toMatch(/the default is non-interactive \(`mode:non-interactive`\)/i)
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
    // Pins the rule, not the mechanism that carried it: an unverified peer stays
    // attributed evidence and cannot promote. The twin *fingerprint* exception it
    // used to name was deleted with 3.3's string matching.
    expect(synthesis).toContain("cannot trigger anchor promotion")
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

  // Split by load-time: the question-tool rules and the dispatch backpressure
  // contract must fire from the always-loaded window, while the payload table
  // (decision primer included) lives in the reference the body mandates before
  // dispatch.
  test("SKILL.md has Interactive mode rules with AskUserQuestion pre-load", async () => {
    const content = await readRepoFile(
      "skills/ce-doc-review/SKILL.md"
    )

    // Interactive mode rules section at top: the body must route into the mode
    // reference before anything else and must keep the never-narrate rule; the
    // per-harness tool names and the fallback trigger live in that reference,
    // which is read before any question can fire.
    expect(content).toContain("## Interactive mode rules")
    expect(content).toContain("`references/modes.md`")
    expect(content).toMatch(/fires the tool or falls back loudly/)
    expect(content).toContain("bounded parallelism")
    // The body keeps the condition that a capacity rejection is backpressure;
    // the queueing mechanics live in the dispatch reference read at that step.
    expect(content).toMatch(/backpressure, not reviewer failure/)

    // References loaded lazily via backtick paths for walk-through and bulk-preview
    expect(content).toContain("`references/walkthrough.md`")
    expect(content).toContain("`references/bulk-preview.md`")
  })

  test("the dispatch reference carries the payload table and decision primer", async () => {
    const dispatch = await readRepoFile("skills/ce-doc-review/references/dispatch.md")
    const modes = await readRepoFile("skills/ce-doc-review/references/modes.md")
    const skill = await readRepoFile("skills/ce-doc-review/SKILL.md")

    expect(skill).toContain("`references/dispatch.md`")
    expect(dispatch).toContain("{decision_primer}")
    expect(dispatch).toContain("<prior-decisions>")
    // The harness tool names and the fallback trigger moved with the mode rules.
    expect(modes).toContain("AskUserQuestion")
    expect(modes).toContain("ToolSearch")
    expect(modes).toContain("numbered-list fallback")
    expect(dispatch).toContain("active-subagent limit")
    expect(dispatch).toContain("spawn errors as backpressure, not reviewer failure")
    expect(dispatch).toContain("queue the remainder")
  })

  // Reproduced on Codex (gpt-5.6-sol), 4/4 runs: a plan whose only storage-related
  // content was an internal schema migration activated security-lens, justified as
  // "changes data-store entries ... with deployment-ordering risks". The bare
  // "data handling" trigger matches every plan. security-lens is one of the
  // conditional judgment trio, so a false positive also fires the cross-model peer
  // pass — the over-activation costs real peer spend, not just an extra reviewer.
  test("security-lens is bounded to sensitive data, not any data handling", async () => {
    // Activation now lives in the reference the body mandates before selection.
    const content = await readRepoFile("skills/ce-doc-review/references/persona-selection.md")
    const line = content
      .split("\n")
      .find((l) => l.startsWith("**security-lens**"))
    expect(line, "ce-doc-review must define a security-lens activation line").toBeDefined()

    expect(line).toMatch(/sensitive/i)
    // The negative case is what keeps storage churn from tripping the lens.
    expect(line).toMatch(/schema migration/i)
    expect(line).toMatch(/deployment-ordering risk is a feasibility concern/i)
    // A bare "data handling," enumeration is the unbounded form this replaced.
    expect(line).not.toMatch(/(^|[;,] )data handling,/i)
  })

  test("keeps security document review on the parent capability tier", async () => {
    const content = await readRepoFile("skills/ce-doc-review/references/dispatch.md")
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
    expect(defer).toContain("From YYYY-MM-DD review")
    expect(defer).toContain("regardless of heading syntax")

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

describe("ce-compound vocabulary is corpus-first, not Rails-specific (issue #1264)", () => {
  const RAILS_VALUES = [
    "rails_model",
    "rails_controller",
    "rails_view",
    "frontend_stimulus",
    "hotwire_turbo",
    "email_processing",
    "brief_system",
    "missing_association",
    "missing_include",
    "thread_violation",
    "rails_version",
  ]

  test("schema.yaml no longer defines origin-repo Rails vocabulary", async () => {
    const schema = await readRepoFile("skills/ce-compound/references/schema.yaml")
    for (const value of RAILS_VALUES) {
      // list items and field keys are definitions; the backward-compat comment may still name them
      expect(schema).not.toMatch(new RegExp(`^\\s+- ${value}$`, "m"))
      expect(schema).not.toMatch(new RegExp(`^\\s+${value}:`, "m"))
    }
  })

  test("yaml-schema.md no longer defines origin-repo Rails vocabulary", async () => {
    const mapping = await readRepoFile("skills/ce-compound/references/yaml-schema.md")
    for (const value of RAILS_VALUES) {
      // definitions are field bullets and "One of ..." value lists; the backward-compat note may still name them
      expect(mapping).not.toContain("**" + value + "**")
      expect(mapping).not.toMatch(new RegExp("One of[^\\n]*`" + value + "`"))
    }
  })

  test("schema.yaml treats component and root_cause as open vocabulary with suggested defaults", async () => {
    const schema = await readRepoFile("skills/ce-compound/references/schema.yaml")
    // problem_type stays a closed enum because it drives track selection
    expect(schema).toMatch(/problem_type:\n\s+type: enum/)
    // component / root_cause are strings with suggestions, not closed enums
    expect(schema).toMatch(/component:\n\s+type: string\n\s+suggested_values:/)
    expect(schema).toMatch(/root_cause:\n\s+type: string\n\s+suggested_values:/)
    // the corpus-first rule is a validation rule, not a comment
    expect(schema).toMatch(/validation_rules:[\s\S]*existing docs/)
  })

  test("the classifier samples existing docs before falling back to schema defaults", async () => {
    // Both classification paths moved into the references the body names at
    // their step; the corpus-first rule is asserted where each one now lives.
    const research = await readRepoFile("skills/ce-compound/references/research.md")
    const contextAnalyzer = sliceSection(research, "#### 1. **Context Analyzer**", "#### 2. **Solution Extractor**")
    expect(contextAnalyzer).toMatch(/existing docs .*<root>\/solutions\//)
    expect(contextAnalyzer).toMatch(/directory/)
    // lightweight mode classifies inline and must carry the same rule
    const lightweight = await readRepoFile("skills/ce-compound/references/lightweight.md")
    expect(lightweight).toMatch(/existing docs/)
  })

  test("ce-compound-refresh replace flow keeps the old learning's component/root_cause", async () => {
    const flows = await readRepoFile("skills/ce-compound-refresh/references/per-action-flows.md")
    const replaceFlow = sliceSection(flows, "## Replace Flow", "3. **Validate parser-safety")
    expect(replaceFlow).toMatch(/corpus-first rule in `references\/yaml-schema\.md`/)
    expect(replaceFlow).toMatch(/counting the old learning as one of the corpus's docs/)
  })

  test("yaml-schema.md category mapping defers to an existing directory taxonomy", async () => {
    const mapping = await readRepoFile("skills/ce-compound/references/yaml-schema.md")
    const section = sliceSection(mapping, "## Category Mapping", "## Validation Rules")
    expect(section).toMatch(/existing director/)
  })
})

describe("ce-compound Phase 1 artifact contract", () => {
  // Regression guard for issue #956: Phase 1 subagents that returned long-form
  // prose only as their inline Agent response failed silently when the harness
  // collapsed the return to an executive summary. The fix mirrors ce-code-review's
  // proven /tmp run-artifact pattern: subagents write full output to disk and the
  // orchestrator Reads it back with the inline return as a fallback.
  // Phase 1 and Phase 2 moved into references/research.md and references/assembly.md;
  // the #956 artifact contract is asserted in the files that now own it.
  test("generates a run id and run dir before dispatching Phase 1 subagents", async () => {
    const content = await readRepoFile("skills/ce-compound/references/research.md")

    // A run identifier scopes the per-subagent artifact files
    expect(content).toContain("RUN_ID")
    // Run dir under the validated owner-private scratch namespace
    expect(content).toContain('SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)"')
    expect(content).toContain('RUN_DIR="$SCRATCH_ROOT/ce-compound/$RUN_ID"')
    expect(content).toContain('(umask 077; mkdir -p "$RUN_DIR")')
  })

  test("Phase 1 subagents write full output to the run-artifact path", async () => {
    const content = await readRepoFile("skills/ce-compound/references/research.md")

    const phase1 = content.slice(content.indexOf("### Phase 1: Research"))

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
    const content = await readRepoFile("skills/ce-compound/references/assembly.md")

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
    const content = (await readRepoFile("skills/ce-compound/SKILL.md")) +
      (await readRepoFile("skills/ce-compound/references/research.md"))

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
    const skill = await readRepoFile("skills/ce-commit-push-pr/references/apply-and-handoff.md")
    const lfg = await readRepoFile("skills/lfg/SKILL.md")

    // Both ends name the same trailer format (ce-commit-push-pr prints it from the
    // apply reference its Step 5 mandates).
    expect(skill).toContain("New concepts:")
    // The trailer is consumed in the shipping tail lfg's step 8 reads first.
    expect(await readRepoFile("skills/lfg/references/shipping-tail.md")).toContain("New concepts:")

    // The callsite passes the mode explicitly rather than relying on defaults
    expect(lfg).toContain("invoke the `ce-commit-push-pr` skill with `mode:pipeline branding:on`")

    // The pre-DONE report names the concept and renders each user-runnable handoff
    // for the active host rather than hardcoding one harness's syntax. That report
    // moved into the reference lfg's step 10 names as a required read before it
    // prints anything, so the rendering contract is asserted there.
    const closeOut = await readRepoFile("skills/lfg/references/shipping-tail.md")
    expect(closeOut).toContain("New concept introduced:")
    expect(closeOut).toContain("run <rendered ce-explain invocation> to go deeper")
    expect(closeOut).toContain("run <rendered ce-babysit-pr invocation> to watch it through review to merge")
    for (const target of ["ce-explain <name>", "ce-babysit-pr <pr-url>"]) {
      expect(closeOut).toContain(`$${target}`)
      expect(closeOut).toContain(`/${target}`)
    }
    expect(closeOut).toMatch(/default to `\/ce-explain <name>`[\s\S]{0,360}Codex[\s\S]{0,220}output one form only/i)

    // The callee documents the mode the caller passes
    expect(skill).toContain("mode:pipeline")
  })
})

describe("explicit Compound Engineering branding provenance", () => {
  test("CE-owned shipping callers pass branding:on", async () => {
    const shipping = await readRepoFile("skills/ce-work/references/shipping-workflow.md")
    const lfg = await readRepoFile("skills/lfg/SKILL.md")
    const debug = await readRepoFile("skills/ce-debug/SKILL.md")
    const debugHandoff = await readRepoFile("skills/ce-debug/references/post-fix-handoff.md")

    expect(shipping).toContain("Load the `ce-commit-push-pr` skill with `branding:on`")
    expect(lfg).toContain("ce-commit-push-pr` skill with `mode:pipeline branding:on`")
    // The shipping invocation must stay in the always-loaded body, not the reference —
    // see the Phase 4 routing test below.
    expect(debug).toContain("invoke the `ce-commit-push-pr` skill with `branding:on`.")
    expect(debug).not.toContain("`/ce-commit-push-pr branding:on`")
    expect(debugHandoff).not.toContain("`/ce-commit-push-pr branding:on`")
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
