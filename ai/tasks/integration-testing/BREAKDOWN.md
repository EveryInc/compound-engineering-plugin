---
id: integration-testing.BREAKDOWN
module: integration-testing
priority: 999999
status: pending
version: 1
origin: spec-workflow
dependsOn: [frontmatter-audit, reproduce-bug-fix, input-validation, hooks, ci-validation, interactive-patterns, state-management]
tags: [smart-ralph, compound-engineering]
---
# Integration Testing

## Context

The lfg and slfg chains are the plugin's primary autonomous orchestration workflows. Every other module in this initiative -- frontmatter flags, AskUserQuestion gates, hooks, state management -- has the potential to break these chains. This module defines manual regression tests that must pass before release. These tests are the final gate: if the chains break, nothing else matters.

## Tasks

1. **Set up test repository** -- Prepare a dedicated test repository with:
   - A simple web app (HTML + JS) to give Claude something to build
   - At least one existing plan file in `docs/plans/`
   - At least one open PR on GitHub
   - `.gitignore` with `.*.local.md` pattern
   - Plugin installed and working
   - Take a pre-change context budget baseline measurement

2. **Run lfg full chain test (Test 4.1)** -- In the test repo, execute `/lfg "add a simple hello world page"` and let it run through all 8 steps:
   - Expected: Chain completes all steps: plan -> deepen -> work -> review -> resolve -> test-browser -> feature-video -> DONE
   - Verify: No AskUserQuestion prompts block the chain
   - Verify: `disable-model-invocation: true` does not block workflow command invocations (they use explicit `/slash-command` syntax)
   - Duration: 20-60 minutes
   - **Gate: Chain completes without stalling**

3. **Run slfg full chain test (Test 4.2)** -- In the test repo, execute `/slfg "add a contact form"` and let it run through all phases:
   - Expected: All phases complete. Parallel agents (review + test-browser) launch correctly. No blocking prompts.
   - Verify: Sequential commands don't stall on AskUserQuestion. Parallel phase launches correctly.
   - Duration: 20-60 minutes
   - **Gate: Chain completes without stalling**

4. **Observe hook behavior during chains (Test 4.3)** -- During lfg execution (step 2), monitor hook behavior:
   - If Claude runs `rm -rf dist/` or `git push`: hooks should fire "ask" prompts
   - If confirmed: chain continues normally
   - Verify: Hooks don't hard-block routine operations
   - Verify: Hook "ask" prompts are visible/reachable in the chain context
   - Note: This test is opportunistic -- it depends on what commands Claude decides to run

5. **Measure context budget (Test 4.4)** -- Compare pre-change and post-change context consumption:
   - Run a standardized prompt sequence before and after changes
   - Use Claude Code diagnostics to measure context usage
   - **Hard gate**: Context consumption must NOT increase vs baseline (regression)
   - **Soft target**: Context consumption < 150% (down from ~316%). Do not block release if target is not met, but report the measurement.

6. **Run AskUserQuestion bypass tests (Tests 6.1-6.5)** -- Verify autonomous mode bypass:
   - 6.1: `/workflows:plan "detailed feature description"` -> proceeds immediately, no prompts
   - 6.2: `/workflows:work docs/plans/test-plan.md` -> proceeds immediately, no plan picker
   - 6.3: `/workflows:review 123` -> proceeds immediately, no target selector
   - 6.4: `/workflows:compound "Fixed the auth bug"` -> auto-classifies, no confirmation
   - 6.5: lfg chain context -> all sub-commands bypass prompts (except acknowledged single-confirmation for `/workflows:work`)

7. **Document test results** -- Record pass/fail for each test, with:
   - Screenshots or logs of any failures
   - Context budget measurements (before/after)
   - Hook firing observations
   - Any unexpected behavior or edge cases discovered
   - Sign-off on all 12 acceptance criteria from QA spec

## Acceptance Criteria

- AC-5 (from QA): `/lfg` chain completes end-to-end without stalling. **Release gate.**
- AC-6 (from QA): `/slfg` chain completes end-to-end without stalling. **Release gate.**
- AC-7 (from QA): Context budget does not increase vs. baseline. **Release gate (no-regression).**
- AC-9 (from QA): AskUserQuestion bypasses correctly when arguments provided.
- AC-10 (from QA): `bun test` passes on both macOS and ubuntu-latest (verify CI is green).
- All 12 acceptance criteria from QA spec are verified and documented.
- Testing approach: Manual now, automate later (per QA Q2) when Claude Code headless mode stabilizes.

## Files to Create/Modify

### No Files Created or Modified

This module is a testing-only module. It creates no code artifacts. Test results should be documented in a test log or PR description.

### Test Environment Requirements

| Requirement | Details |
|-------------|---------|
| Test repository | Simple web app with docs/plans/, open PR, .gitignore |
| Plugin installation | compound-engineering plugin installed and working |
| Pre-change baseline | Context budget measurement before any changes applied |
| Time allocation | 3-4.5 hours for full test execution (per QA estimate) |
| API budget | lfg/slfg chains consume significant API tokens (20-60 min each) |
