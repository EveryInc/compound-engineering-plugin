---
title: "feat: Close the testing gap in ce:work, ce:plan, and testing-reviewer"
type: feat
status: active
date: 2026-03-29
origin: docs/brainstorms/2026-03-29-testing-addressed-gate-requirements.md
---

# feat: Close the testing gap in ce:work, ce:plan, and testing-reviewer

## Overview

Targeted edits to three skill/agent files to make "no tests" a deliberate decision rather than an accidental omission. Adds per-task testing deliberation in ce:work's execution loop, blank-test-scenarios handling in ce:plan's review, and a missing-test-pattern check in the testing-reviewer agent. Ships with contract tests following the existing repo pattern.

## Problem Frame

ce:work has thorough testing instructions but two narrow gaps let untested behavioral changes slip through silently: the quality gate says "All tests pass" (vacuously true with no tests), and ce:plan allows blank test scenarios without annotation. The testing-reviewer catches some gaps after the fact but doesn't flag the broad pattern of behavioral changes with zero test additions. (see origin: docs/brainstorms/2026-03-29-testing-addressed-gate-requirements.md)

## Requirements Trace

- R1. ce:plan units with no test scenarios should annotate why, not leave the field blank
- R2. Blank test scenarios on feature-bearing units treated as incomplete in Phase 5.1 review
- R3. Per-task testing deliberation in ce:work's execution loop before marking a task done
- R4. Quality checklist and Final Validation updated from "Tests pass" to "Testing addressed"
- R5. Apply R3 and R4 to ce:work-beta with explicit sync decision
- R6. testing-reviewer adds a check for behavioral changes with no corresponding test additions
- R7. New check complements existing checks (untested branches, weak assertions, brittle tests, missing edge cases)
- R8. Contract tests verifying each behavioral change ships as intended

## Scope Boundaries

- Prompt-level changes only -- no CI enforcement, no programmatic gates
- No new abstractions (no "testing assessment artifacts" or structured output schemas)
- No changes to testing-reviewer's output format (findings JSON stays the same)
- Deliberate test omission with justification is a valid outcome

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-plan/SKILL.md` — Phase 5.1 review checklist at lines 583-601, test scenario quality checks at lines 591-592. Two edit sites: instruction prose for Test scenarios at line 339 (section 3.5), and plan output template with HTML comment at line 499
- `plugins/compound-engineering/skills/ce-work/SKILL.md` — Phase 2 task loop at lines ~143-155, Final Validation at lines 287-295 ("All tests pass"), Quality Checklist at lines 427-443 ("Tests pass (run project's test command)")
- `plugins/compound-engineering/skills/ce-work-beta/SKILL.md` — Identical loop/checklist structure. Final Validation at lines 296-304, Quality Checklist at lines 500-516
- `plugins/compound-engineering/agents/review/ce-testing-reviewer.agent.md` — 4 existing checks in "What you're hunting for" (lines 15-20), confidence calibration (lines 22-29), output format (lines 37-48)
- `tests/pipeline-review-contract.test.ts` — Contract tests for ce:work, ce:work-beta, ce:brainstorm, ce:plan using `readRepoFile()` + `toContain`/`not.toContain` assertions
- `tests/review-skill-contract.test.ts` — Contract tests for ce:review agent using same pattern, includes frontmatter parsing and cross-file schema alignment

### Institutional Learnings

- Beta-to-stable sync must be explicit per AGENTS.md (lines 161-163). The existing `pipeline-review-contract.test.ts` already tests ce:work-beta mirrors ce:work's review contract — follow same pattern.
- Skill review checklist warns against contradictory rules across phases — the new "testing deliberation" must complement, not contradict, existing "Run tests after changes" instruction.
- Use negative assertions (`not.toContain`) to prevent regression — assert old "Tests pass" / "All tests pass" language is fully replaced.

## Key Technical Decisions

- **Testing deliberation goes after "Run tests after changes" in the loop**: This is the natural deliberation point — tests have just run (or not), and the agent should assess whether testing was adequately addressed before marking the task done. Placing it earlier (before test execution) would be premature; placing it at "Mark task as completed" would intermingle it with completion bookkeeping.
- **Annotation uses existing template field, not a new field**: `Test expectation: none -- [reason]` goes in the Test scenarios section rather than adding a new template field. This keeps the template stable and leverages the existing Phase 5.1 check surface.
- **New testing-reviewer check is a 5th bullet, not a replacement**: It's conceptually distinct from check #1 (untested branches within new code). Check #1 looks at branch coverage within tests that exist; the new check flags when no tests exist at all for behavioral changes.
- **Contract tests extend existing files**: New ce:work/ce:plan assertions go in `pipeline-review-contract.test.ts`. Testing-reviewer assertion goes in `review-skill-contract.test.ts`. This follows the established convention rather than creating a new file.

## Open Questions

### Resolved During Planning

- **Where does testing deliberation go in the loop?** After "Run tests after changes" (bullet 8) and before "Mark task as completed" (bullet 9). The agent has just run tests or skipped them — now it deliberates.
- **What annotation format for units with no tests?** `Test expectation: none -- [reason]` in the Test scenarios field. Follows existing template structure.
- **Where does the new check go in testing-reviewer?** 5th bullet in "What you're hunting for" after the existing 4 checks.
- **New test file or extend existing?** Extend existing — `pipeline-review-contract.test.ts` for skill changes, `review-skill-contract.test.ts` for the agent change.

### Deferred to Implementation

- Exact wording of the testing deliberation prompt in the execution loop — should be concise and action-oriented, final phrasing determined during implementation
- Whether the testing-reviewer's "What you don't flag" section needs a corresponding exclusion for non-behavioral changes (config, formatting, comments) — inspect during implementation

## Implementation Units

- [ ] **Unit 1: ce:plan — Blank test scenarios handling**

**Goal:** Make blank test scenarios on feature-bearing units flagged as incomplete during plan review, and establish the annotation convention for units that genuinely need no tests.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-plan/SKILL.md`

**Approach:**
- Two edit sites in ce:plan for the annotation convention:
  - The instruction prose (section 3.5, around line 339) that describes how to write Test scenarios — mention the `Test expectation: none -- [reason]` convention here so the planner agent learns it when reading instructions
  - The plan output template (around line 499) which contains the HTML comment `<!-- Include only categories that apply to this unit. Omit categories that don't. -->` — update this comment to also show the annotation convention for units with no test scenarios
- In Phase 5.1 review checklist (after line 592), add a new bullet: blank or missing test scenarios on a feature-bearing unit (as defined by ce:plan's existing Plan Quality Bar language) should be flagged as incomplete
- In the Phase 5.3.3 confidence-scoring checklist for Implementation Units (around line 717), add a parallel item so the confidence check also catches blank test scenarios

**Patterns to follow:**
- Existing Phase 5.1 test scenario quality checks at lines 591-592
- The unit template comment style at line 499
- ce:plan's existing "feature-bearing unit" terminology in the Plan Quality Bar

**Test scenarios:**
- Happy path: Plan with a feature-bearing unit that has `Test expectation: none -- config-only change` in test scenarios -> Phase 5.1 review accepts it
- Error path: Plan with a feature-bearing unit that has a completely blank/absent Test scenarios field -> Phase 5.1 review flags it as incomplete
- Happy path: Plan with a non-feature-bearing unit (scaffolding, config) that uses the annotation -> accepted without issue

**Verification:**
- Phase 5.1 checklist explicitly addresses blank test scenarios
- Plan template comment mentions the `Test expectation: none -- [reason]` convention
- Confidence scoring checklist includes blank test scenarios as a scoring trigger

---

- [ ] **Unit 2: ce:work and ce:work-beta — Testing deliberation and checklist update**

**Goal:** Add per-task testing deliberation to the execution loop and update both checklist surfaces from "Tests pass" to "Testing addressed."

**Requirements:** R3, R4, R5

**Dependencies:** None

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-work/SKILL.md`
- Modify: `plugins/compound-engineering/skills/ce-work-beta/SKILL.md`

**Approach:**
- In the Phase 2 task execution loop (lines ~143-155 in ce:work, ~144-156 in ce:work-beta), add a **new bullet** between "Run tests after changes" and "Mark task as completed". The new bullet should prompt the agent to assess: did this task change behavior? If yes, were tests written or updated? If no tests were added, what is the justification? Keep it concise — 2-3 questions in one bullet, matching the existing loop bullet style. Do not expand into a multi-paragraph section
- In the Quality Checklist (ce:work line ~433, ce:work-beta line ~506), replace `- [ ] Tests pass (run project's test command)` with `- [ ] Testing addressed -- tests pass AND new/changed behavior has corresponding test coverage (or an explicit justification for why tests are not needed)`
- In the Final Validation (ce:work line ~289, ce:work-beta line ~298), replace `- All tests pass` with `- Testing addressed -- tests pass and new/changed behavior has corresponding test coverage (or an explicit justification for why tests are not needed)`
- Ensure both files receive identical changes

**Sync decision:** Propagating to beta — shared testing deliberation guidance, not experimental delegate-mode behavior.

**Patterns to follow:**
- Existing execution loop bullet style at lines 138-155
- Existing Quality Checklist item style (checkbox with parenthetical guidance)
- The mandatory review pattern (which was also synced identically between stable and beta)

**Test scenarios:**
- Happy path: ce:work execution loop includes the testing deliberation step in the correct position (after "Run tests" and before "Mark task as completed")
- Happy path: Quality Checklist contains "Testing addressed" and does not contain "Tests pass (run project's test command)"
- Happy path: Final Validation contains "Testing addressed" and does not contain "All tests pass"
- Integration: ce:work-beta has identical testing deliberation and checklist wording as ce:work

**Verification:**
- Both files contain the testing deliberation step in the execution loop
- Both files' Quality Checklist and Final Validation use "Testing addressed" language
- Old "Tests pass" and "All tests pass" language is fully removed from both files

---

- [ ] **Unit 3: testing-reviewer — Behavioral changes with no test additions check**

**Goal:** Add a 5th check to the testing-reviewer agent that flags behavioral code changes in the diff with zero corresponding test additions or modifications.

**Requirements:** R6, R7

**Dependencies:** None

**Files:**
- Modify: `plugins/compound-engineering/agents/review/ce-testing-reviewer.agent.md`

**Approach:**
- Add a 5th bold-titled bullet in "What you're hunting for" (after the existing 4th check at line 20). The check should: describe the pattern (behavioral code changes — new logic branches, state mutations, API changes — with zero corresponding test file additions or modifications in the diff), explain what makes it distinct from check #1 (which looks at untested branches *within* code that has tests, while this flags when no tests exist at all), and note that non-behavioral changes (config, formatting, comments, type-only changes) are excluded
- Consider adding a corresponding item in "What you don't flag" for non-behavioral changes if it adds clarity

**Patterns to follow:**
- Existing check format: bold title followed by `--` and explanation
- Existing checks use specific, concrete language ("new `if/else`, `switch`, `try/catch`")
- Confidence calibration tiers (High 0.80+ when provable from diff alone)

**Test scenarios:**
- Happy path: testing-reviewer.md "What you're hunting for" section contains the behavioral-changes-with-no-tests check
- Happy path: Check is described as distinct from existing untested-branches check

**Verification:**
- testing-reviewer.md has 5 checks in "What you're hunting for" instead of 4
- The new check specifically addresses "behavioral changes with no corresponding test additions"

---

- [ ] **Unit 4: Contract tests for all changes**

**Goal:** Add contract tests that verify each skill/agent modification ships as intended, following the existing string-assertion pattern.

**Requirements:** R8

**Dependencies:** Units 1, 2, 3

**Files:**
- Modify: `tests/pipeline-review-contract.test.ts`
- Modify: `tests/review-skill-contract.test.ts`

**Approach:**
- In `pipeline-review-contract.test.ts`, extend the existing `ce:work review contract` describe block with new tests:
  - ce:work includes testing deliberation in execution loop
  - ce:work Quality Checklist contains "Testing addressed" and does not contain "Tests pass (run project's test command)"
  - ce:work Final Validation contains "Testing addressed" and does not contain "All tests pass"
  - ce:work-beta mirrors all testing deliberation and checklist changes
- In `pipeline-review-contract.test.ts`, extend or add a `ce:plan review contract` test:
  - ce:plan Phase 5.1 review addresses blank test scenarios on feature-bearing units
- In `review-skill-contract.test.ts`, add a new describe block for testing-reviewer:
  - testing-reviewer includes the behavioral-changes-with-no-test-additions check

Use negative assertions (`not.toContain`) for the old checklist language to prevent regression.

**Patterns to follow:**
- `readRepoFile()` helper + `expect(content).toContain(...)` / `expect(content).not.toContain(...)` in existing contract tests
- ce:work-beta mirror test pattern at pipeline-review-contract.test.ts lines 39-50
- `describe`/`test` block naming convention in both files

**Test scenarios:**
- Happy path: All new contract tests pass after Units 1-3 are complete
- Error path: Reverting any skill change causes the corresponding contract test to fail (verified by inspection of assertion specificity)

**Verification:**
- `bun test` passes with the new contract tests
- Each R3-R7 change surface has at least one contract test assertion

## System-Wide Impact

- **Interaction graph:** These are prompt-level skill edits. No callbacks, middleware, or runtime dependencies. The testing-reviewer is invoked by ce:review which is invoked by ce:work — the chain is: ce:work -> ce:review -> testing-reviewer. Changes to the reviewer's check list affect what ce:review surfaces but not how it surfaces it.
- **Error propagation:** Not applicable — no runtime error paths. If the testing deliberation prompt is poorly worded, the worst case is the agent ignores it (same as today).
- **API surface parity:** ce:work and ce:work-beta must remain in sync per AGENTS.md. Contract tests enforce this.
- **Unchanged invariants:** The testing-reviewer's output format (JSON with `findings`, `residual_risks`, `testing_gaps`) is unchanged. The plan template's structure is unchanged — only the comment and Phase 5.1 checklist are modified.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Testing deliberation prompt is too verbose and gets ignored by the agent | Keep it concise — 2-3 questions, not a paragraph. Match the existing loop bullet style. |
| Old "Tests pass" language persists in one location, creating contradiction | Negative contract test assertions (`not.toContain`) catch any leftover old language |
| ce:work-beta drifts from ce:work | Contract tests explicitly assert both files contain identical testing changes |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-29-testing-addressed-gate-requirements.md](docs/brainstorms/2026-03-29-testing-addressed-gate-requirements.md)
- Related learning: `docs/solutions/skill-design/beta-promotion-orchestration-contract.md`
- Related learning: `docs/solutions/skill-design/compound-refresh-skill-improvements.md` (avoid contradictory rules across phases)
- Related test: `tests/pipeline-review-contract.test.ts`
- Related test: `tests/review-skill-contract.test.ts`
