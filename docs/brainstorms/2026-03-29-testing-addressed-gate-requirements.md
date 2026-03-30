---
date: 2026-03-29
topic: testing-addressed-gate
---

# Close the Testing Gap in ce:work and ce:plan

## Problem Frame

ce:work has extensive testing instructions -- test discovery, test-first execution posture, system-wide test checks, and a test scenario completeness checklist. But two narrow gaps let untested behavioral changes slip through silently:

1. **ce:work's quality gate says "All tests pass"** -- which is vacuously true when no tests exist. A passing empty test suite is indistinguishable from a passing comprehensive one. "No tests" can be a deliberate decision or an accidental omission, and the skill doesn't distinguish between the two.

2. **ce:plan allows blank test scenarios without annotation** -- when a plan unit has no test scenarios, it's ambiguous whether the planner assessed testing and determined none were needed, or simply didn't think about it. ce:plan already requires test scenarios for feature-bearing units (Plan Quality Bar, Phase 5.1 review), but non-feature-bearing units legitimately omit them, and the template doesn't require saying so.

The testing-reviewer in ce:review catches some of these after the fact by examining diffs for untested branches and missing edge case coverage. But it doesn't specifically flag the broader pattern: behavioral changes with no corresponding test additions at all.

The existing testing instructions are thorough but generic. The gap isn't volume of instructions -- it's specificity at the right moments. This targets focused changes at three layers: planning (ce:plan annotation), execution (ce:work per-task deliberation), and review (testing-reviewer detection).

## Requirements

**ce:plan -- Handle the Blank Case**

- R1. When a plan unit has no test scenarios, the planner should annotate why (e.g., "Test expectation: none -- config-only, no behavioral change") rather than leaving the field blank
- R2. A blank or missing test scenarios field on a feature-bearing unit should be treated as incomplete during ce:plan's Phase 5.1 review, not silently accepted

---

**ce:work -- Per-Task Testing Deliberation**

- R3. Before marking a task done, ce:work's execution loop should include an explicit testing deliberation: did this task change behavior? If yes, were tests written or updated? If no tests were added, why not? This is a prompt for deliberation at the point of action, not a formal artifact
- R4. The Phase 3 quality checklist item "Tests pass (run project's test command)" and the Final Validation item "All tests pass" should both be updated to "Testing addressed -- tests pass AND new/changed behavior has corresponding test coverage (or an explicit justification for why tests are not needed)"
- R5. Apply R3 and R4 to ce:work-beta (AGENTS.md requires explicit sync decisions for beta counterparts)

---

**testing-reviewer -- Flag the Missing-Test Pattern**

- R6. The testing-reviewer agent should add a new check: when the diff contains behavioral code changes (new logic branches, state mutations, API changes) with zero corresponding test additions or modifications, flag it as a finding
- R7. This check complements the existing checks (untested branches, weak assertions, brittle tests, missing edge cases) -- it catches the case those miss: no tests at all for new behavior

**Contract Tests -- Practice What We Preach**

- R8. Add contract tests verifying each behavioral change ships as intended. Following the existing pattern in `pipeline-review-contract.test.ts` and `review-skill-contract.test.ts` (string assertions against skill/agent file content):
  - ce:work includes per-task testing deliberation in the execution loop (R3)
  - ce:work checklist says "Testing addressed", not "Tests pass" or "All tests pass" (R4)
  - ce:work-beta mirrors the testing deliberation and checklist changes (R5)
  - ce:plan Phase 5.1 review treats blank test scenarios on feature-bearing units as incomplete (R2)
  - testing-reviewer agent includes the behavioral-changes-with-no-test-additions check (R6)

## Success Criteria

- A diff with behavioral changes and no test changes gets flagged by the testing-reviewer (R6) -- the detective layer catches it on real artifacts
- ce:plan units without test scenarios either have an explicit annotation or get flagged during plan review (R1-R2) -- the preventive layer operates at planning time
- ce:work's execution loop prompts testing deliberation per task, and the checklist makes the agent explicitly consider whether testing was addressed, not just whether the suite is green (R3-R4)
- "No tests needed" with justification remains a valid outcome -- the goal is deliberate decisions, not forced ceremony

## Scope Boundaries

- Not adding CI-level enforcement or programmatic gates -- these are prompt-level changes
- Not adding new abstractions like "testing assessment artifacts" or structured output schemas
- Not mandating coverage thresholds or specific testing frameworks
- Not changing the testing-reviewer's output format -- adding one check within its existing review protocol

## Key Decisions

- **Layered approach -- deliberation + detection**: ce:work's per-task deliberation (R3) prompts the agent to think about testing at the point of action. The testing-reviewer (R6) operates on the actual diff as a backstop. Instruction specificity at the right moment matters -- "did you address testing for this task?" is a much more targeted prompt than "tests pass."
- **Targeted edits over a new system**: Rather than introducing a "testing assessment gate" abstraction, make focused changes to ce:plan, ce:work, and testing-reviewer that close the identified gaps.
- **Deliberate omission is a first-class outcome**: "No tests needed" with justification is valid. The goal is making "no tests" a deliberate decision, not an accidental one.

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Technical] What's the lightest-weight annotation for plan units that genuinely need no tests -- a field, a comment, or a convention?
- [Affects R6][Needs research] Review the testing-reviewer's current check implementation to determine where the new "behavioral changes with no test changes" check fits in its analysis protocol
- [Affects R3][Technical] Where in ce:work's execution loop (Phase 2 task loop) does the testing deliberation prompt fit -- after "Run tests after changes" or as part of "Mark task as completed"?
- [Affects R4-R5][Resolved] ce:work's Phase 3 checklist is plaintext markdown in SKILL.md (line ~433 and ~289). ce:work-beta has the same pattern. The change is editing bullet points, no dynamic infrastructure.

## Next Steps

-> `/ce:plan` for structured implementation planning
