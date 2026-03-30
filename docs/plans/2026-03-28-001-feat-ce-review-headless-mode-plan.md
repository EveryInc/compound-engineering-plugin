---
title: "feat(ce-review): Add headless mode for programmatic callers"
type: feat
status: completed
date: 2026-03-28
origin: docs/brainstorms/2026-03-28-ce-review-headless-mode-requirements.md
---

# feat(ce-review): Add headless mode for programmatic callers

## Overview

Add `mode:headless` to ce:review so other skills can invoke it programmatically and receive structured findings without interactive prompts. Follows the pattern established by document-review's headless mode (PR #425).

## Problem Frame

ce:review has three modes (interactive, autofix, report-only), but none is designed for skill-to-skill invocation where the caller wants structured findings returned as parseable output. Autofix applies fixes and writes todos; report-only is read-only and outputs a human-readable report. Neither returns structured output for a calling workflow to consume and route. (see origin: `docs/brainstorms/2026-03-28-ce-review-headless-mode-requirements.md`)

## Requirements Trace

- R1. Add `mode:headless` argument, parsed alongside existing mode flags
- R2. In headless mode, apply `safe_auto` fixes silently (matching autofix behavior)
- R3. Return all non-auto findings as structured text output, preserving severity, autofix_class, owner, requires_verification, confidence, evidence[], pre_existing
- R4. No `AskUserQuestion` or other interactive prompts in headless mode
- R5. End with a clear completion signal so callers can detect when the review is done
- R6. Follow document-review's structural output *pattern* (completion header, metadata block, autofix-class-grouped findings, trailing sections) while using ce:review's own section headings and per-finding fields

## Scope Boundaries

- Not changing existing three modes (interactive, autofix, report-only)
- Not adding new reviewer personas or changing the review pipeline (Stages 3-5)
- Not building a specific caller workflow — just enabling the capability
- Not adding headless invocations to existing orchestrators (lfg, slfg) in this change

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-review/SKILL.md` — the skill to modify (mode detection at line 32, argument parsing at line 19, post-review flow at line 440)
- `plugins/compound-engineering/skills/ce-review/references/review-output-template.md` — existing output template with pipe-delimited tables and severity-grouped sections
- `plugins/compound-engineering/skills/ce-review/references/findings-schema.json` — ce:review's findings schema with `safe_auto|gated_auto|manual|advisory` autofix_class and `review-fixer|downstream-resolver|human|release` owner
- `plugins/compound-engineering/skills/document-review/SKILL.md` — headless mode pattern to follow (Phase 0 parsing, Phase 4 headless output, Phase 5 immediate return)
- `tests/review-skill-contract.test.ts` — contract test to extend

### Institutional Learnings

- `docs/solutions/skill-design/beta-promotion-orchestration-contract.md` — contract tests must be extended atomically with new mode flags
- `docs/solutions/skill-design/compound-refresh-skill-improvements.md` — explicit opt-in only for autonomous modes (no auto-detection from tool availability); conservative treatment of borderline cases
- `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md` — walk all mode x state combinations when adding a new mode branch
- `docs/solutions/agent-friendly-cli-principles.md` — structured parseable output with stable field contracts for programmatic callers

## Key Technical Decisions

- **Headless is a fourth explicit mode, not an overlay**: Each mode is self-contained with its own complete behavior specification. This avoids whack-a-mole regressions from overlay interactions (per state-machine learning). Headless has its own rules section parallel to autofix and report-only.

- **No shared checkout switching, but NOT safe for concurrent use**: Headless follows report-only's checkout guard — if a PR/branch target is passed, headless must run in an isolated worktree or stop. However, unlike report-only, headless mutates files (applies safe_auto fixes). Callers must not run headless concurrently with other mutating operations on the same checkout. The headless rules section should explicitly state this.

- **Single-pass, no re-review rounds**: Headless applies `safe_auto` fixes in one pass and returns. No bounded fixer loop. Rationale: autofix uses max_rounds:2 because it operates autonomously within a larger workflow; headless returns structured output to a caller that can re-invoke if needed. The caller owns the iteration decision, keeping headless simple and predictable. Applied fixes that introduce new issues will be caught on a subsequent invocation if the caller chooses to re-review.

- **Write run artifacts, skip todos**: Run artifacts (`.context/compound-engineering/ce-review/<run-id>/`) provide an audit trail of what headless did. Todo files are skipped because the caller receives structured findings and routes downstream work itself.

- **Reject conflicting mode flags**: `mode:headless` is incompatible with `mode:autofix` and `mode:report-only`. If multiple mode tokens appear, emit an error and stop. This follows the "fail fast with actionable errors" principle.

- **Require diff scope with structured error**: Like document-review requiring a document path in headless mode, ce:review headless requires that a diff scope is determinable (branch, PR, or `base:` ref). If scope cannot be determined, emit a structured error: `Review failed (headless mode). Reason: <no diff scope detected | merge-base unresolved | conflicting mode flags>`. No agents are dispatched. The same structured error format applies to conflicting mode flags.

## Open Questions

### Resolved During Planning

- **Fourth mode vs overlay?** Fourth mode. Self-contained behavior avoids overlay ambiguity. (Grounded in state-machine learning and the fact that all three existing modes have independent rules sections.)
- **Artifacts and todos?** Write artifacts (audit trail), skip todos (caller routes findings). Headless owns mutation but not downstream handoff.
- **Checkout behavior?** No shared checkout switching. Same guard as report-only, since headless callers need stable checkouts.
- **Re-review rounds?** Single-pass. Callers can re-invoke if needed.

### Deferred to Implementation

- **Conflicting flags and missing scope error messages**: Decision made (reject with structured error), but exact wording and error envelope format deferred to implementation
- Whether the run artifact format needs any headless-specific metadata (e.g., marking the run as headless)

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Mode x Behavior Decision Matrix

| Behavior | Interactive | Autofix | Report-only | **Headless** |
|----------|------------|---------|-------------|--------------|
| User questions | Yes | No | No | **No** |
| Checkout switching | Yes | Yes | No (worktree or stop) | **No (worktree or stop)** |
| Intent ambiguity | Ask user | Infer conservatively | Infer conservatively | **Infer conservatively** |
| Apply safe_auto fixes | After policy question | Automatically | Never | **safe_auto only, single pass** |
| Apply gated_auto/manual fixes | After user approval | Never | Never | **Never (returned in output)** |
| Re-review rounds | max_rounds: 2 | max_rounds: 2 | N/A | **Single pass (no re-review)** |
| Write run artifact | Yes | Yes | No | **Yes** |
| Create todo files | No (user decides) | Yes (downstream-resolver) | No | **No (caller routes)** |
| Structured text output | No (interactive report) | No (interactive report) | No (interactive report) | **Yes (headless envelope)** |
| Commit/push/PR | Offered | Never | Never | **Never** |
| Completion signal | N/A | Stops after artifacts | Stops after report | **"Review complete"** |
| Safe for concurrent use | No | No | Yes (read-only) | **No (mutates files)** |

### Headless Output Envelope

Follows document-review's structural pattern adapted for ce:review's schema:

```
Code review complete (headless mode).

Scope: <scope-line>
Intent: <intent-summary>
Reviewers: <reviewer-list with conditional justifications>
Verdict: <Ready to merge | Ready with fixes | Not ready>
Artifact: .context/compound-engineering/ce-review/<run-id>/

Applied N safe_auto fixes.

Gated-auto findings (concrete fix, changes behavior/contracts):

[P1][gated_auto -> downstream-resolver][needs-verification] File: <file:line> -- <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>
  Suggested fix: <suggested_fix or "none">
  Evidence: <evidence[0]>
  Evidence: <evidence[1]>

Manual findings (actionable, needs handoff):

[P1][manual -> downstream-resolver] File: <file:line> -- <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>
  Evidence: <evidence[0]>

Advisory findings (report-only):

[P2][advisory -> human] File: <file:line> -- <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>

Pre-existing issues:
- <file:line> -- <title> (<reviewer>)

Residual risks:
- <risk>

Testing gaps:
- <gap>
```

The `[needs-verification]` marker appears only on findings where `requires_verification: true`. The `Artifact:` line gives callers the path to the full run artifact for machine-readable access to the complete findings schema. The text envelope is the primary handoff; the artifact is for debugging and full-fidelity access.

Findings with `owner: release` appear in the Advisory section (they are operational/rollout items, not code fixes). Findings with `pre_existing: true` appear in the Pre-existing section regardless of autofix_class.

Omit any section with zero items. If all reviewers fail or time out, emit a degraded signal: `Code review degraded (headless mode). Reason: 0 of N reviewers returned results.` followed by "Review complete" so the caller can detect the failure and decide how to proceed.

Then output "Review complete" as the terminal signal.

## Implementation Units

- [ ] **Unit 1: Mode Infrastructure**

**Goal:** Add `mode:headless` to argument parsing, mode detection, and error handling for conflicting flags / missing scope.

**Requirements:** R1, R4

**Dependencies:** None

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-review/SKILL.md`

**Approach:**
- Add `mode:headless` row to the Argument Parsing token table (alongside `mode:autofix` and `mode:report-only`)
- Add headless row to the Mode Detection table with behavior summary
- Add a "Headless mode rules" subsection parallel to "Autofix mode rules" and "Report-only mode rules"
- Update the `argument-hint` frontmatter to include `mode:headless`
- Add conflicting-flag guard: if multiple mode tokens appear in arguments, emit an error message listing the conflict and stop
- Add scope-required guard: if headless mode cannot determine diff scope without user interaction, emit an error with re-invocation syntax (matching document-review's nil-path pattern)

**Patterns to follow:**
- Existing mode detection table structure at SKILL.md line 34
- Existing mode rules subsections at SKILL.md lines 40-54
- document-review Phase 0 parsing and nil-path guard at document-review SKILL.md lines 12-37

**Test scenarios:**
- Happy path: `mode:headless` token is parsed and headless mode is activated
- Happy path: `mode:headless` with a branch name or PR number parses both correctly
- Error path: `mode:headless mode:autofix` is rejected with a clear error
- Error path: `mode:headless mode:report-only` is rejected with a clear error
- Edge case: `mode:headless` alone with no branch/PR and no determinable scope emits a scope-required error

**Verification:**
- SKILL.md contains `mode:headless` in argument-hint, token table, mode detection table, and a dedicated rules subsection
- Conflicting-flag and missing-scope guard text is present

---

- [ ] **Unit 2: Pipeline Behavior Adjustments**

**Goal:** Add headless-specific behavior for Stage 1 (checkout guard) and Stage 2 (intent ambiguity).

**Requirements:** R1, R4

**Dependencies:** Unit 1

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-review/SKILL.md`

**Approach:**
- In Stage 1 scope detection, add headless to the checkout guard alongside report-only: `mode:headless` and `mode:report-only` must not run `gh pr checkout` or `git checkout` on the shared checkout. They must run in an isolated worktree or stop. When headless stops due to the checkout guard, emit a structured error with re-invocation syntax (e.g., "Re-invoke with base:\<ref\> to review the current checkout, or run from an isolated worktree.").
- In Stage 1 untracked file handling, add headless behavior: if the UNTRACKED list is non-empty, proceed with tracked changes only and note excluded files in the Coverage section of the structured output. Never stop to ask the user — this matches the "infer conservatively" pattern.
- In Stage 2 intent discovery, add headless to the non-interactive path alongside autofix and report-only: infer intent conservatively, note uncertainty in Coverage/Verdict reasoning instead of blocking.
- All changes are small additions to existing conditional text — add headless to the existing mode lists where report-only and autofix are already distinguished.

**Patterns to follow:**
- Existing report-only checkout guard at SKILL.md line 53 ("mode:report-only cannot switch the shared checkout")
- Existing autofix/report-only intent handling at SKILL.md (~line 298)

**Test scenarios:**
- Happy path: headless mode with a PR target uses a worktree or stops instead of switching the shared checkout
- Happy path: headless mode infers intent conservatively when diff metadata is thin
- Happy path: headless mode with untracked files proceeds with tracked changes only and notes exclusions
- Error path: headless stops due to checkout guard and emits re-invocation syntax

**Verification:**
- SKILL.md mentions headless alongside report-only in checkout guard sections
- SKILL.md mentions headless alongside autofix/report-only in intent discovery sections
- SKILL.md specifies headless behavior for untracked files (proceed, don't prompt)

---

- [ ] **Unit 3: Headless Output Format and Post-Review Flow**

**Goal:** Define the headless structured text output and the headless post-review behavior (apply safe_auto, write artifacts, skip todos, output structured text, return completion signal).

**Requirements:** R2, R3, R4, R5, R6

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-review/SKILL.md`
- Modify: `plugins/compound-engineering/skills/ce-review/references/review-output-template.md`

**Approach:**

*Stage 6 output:*
- Add a headless-specific output section to SKILL.md that defines the structured text envelope format
- The envelope follows document-review's structural pattern: completion header, metadata (scope/intent/reviewers/verdict), applied fixes count, findings grouped by autofix_class with severity/route/file/line per finding, trailing sections (pre-existing, residual risks, testing gaps)
- Per-finding format: `[severity][autofix_class -> owner] File: <file:line> -- <title> (<reviewer>, confidence <N>)` with Why and Suggested fix lines
- Omit sections with zero items
- In headless mode, output this structured text instead of the interactive pipe-delimited table report

*Post-review flow (After Review section):*
- Add "Headless mode" to Step 2 (Choose policy by mode) parallel to autofix and report-only
- Headless rules: ask no questions; apply `safe_auto -> review-fixer` queue in a single pass (no re-review rounds); skip Step 3's bounded loop entirely
- Step 4 (Emit artifacts): headless writes run artifacts (like autofix) but does NOT create todo files (caller handles routing from structured output)
- Step 5: headless stops after structured text output and "Review complete" signal. No commit/push/PR.

*Review output template:*
- Add a "Headless mode format" section to `review-output-template.md` with the structured text template and formatting rules
- Update the Mode line documentation to include `headless`

**Patterns to follow:**
- document-review headless output format at document-review SKILL.md lines 219-248
- Existing autofix and report-only post-review steps at SKILL.md lines 471-483
- Existing review-output-template.md formatting rules

**Test scenarios:**
- Happy path: headless mode with safe_auto findings applies fixes and returns structured output listing remaining findings
- Happy path: headless mode with no actionable findings returns "Applied 0 safe_auto fixes" and the completion signal
- Happy path: headless mode with mixed findings (safe_auto + gated_auto + manual + advisory) applies safe_auto, returns all others in structured output grouped by autofix_class
- Edge case: headless mode with only advisory findings returns structured output with no fixes applied
- Edge case: headless mode with only pre-existing findings separates them into the pre-existing section
- Integration: headless output includes Verdict line so callers can make merge decisions
- Integration: run artifact is written under `.context/compound-engineering/ce-review/<run-id>/`
- Error path: clean review (zero findings) returns the completion signal with no findings sections

**Verification:**
- SKILL.md has a headless output format section with the structured text envelope
- review-output-template.md includes headless mode format
- Post-review flow has a headless branch in Steps 2, 4, and 5
- No AskUserQuestion or interactive prompts reachable in headless mode

---

- [ ] **Unit 4: Contract Test Extension**

**Goal:** Extend `tests/review-skill-contract.test.ts` to assert headless mode contract invariants.

**Requirements:** R1, R4, R5

**Dependencies:** Units 1-3

**Files:**
- Modify: `tests/review-skill-contract.test.ts`
- Test: `tests/review-skill-contract.test.ts`

**Approach:**
- Add assertions to the existing "documents explicit modes and orchestration boundaries" test for headless mode presence
- Add a new test case for headless-specific contract invariants: completion signal text, no-checkout-switching guard, artifact behavior, no-todo rule, structured output format presence, conflicting-flags guard
- Assert `mode:headless` appears in argument-hint and mode detection table
- Assert headless rules section exists with key behavioral commitments

**Patterns to follow:**
- Existing contract test structure at `tests/review-skill-contract.test.ts` — string containment assertions against SKILL.md content

**Test scenarios:**
- Happy path: contract test passes with all headless mode assertions
- Edge case: if any headless rule text is accidentally removed from SKILL.md, the contract test fails

**Verification:**
- `bun test tests/review-skill-contract.test.ts` passes
- Test covers: mode detection, checkout guard, artifact/todo behavior, completion signal, conflicting flags guard

## System-Wide Impact

- **Interaction graph:** No new callbacks or middleware. Headless mode is a new branch in existing mode-dispatch logic. Existing callers (lfg, slfg) are not changed — they continue using autofix and report-only.
- **Error propagation:** New error paths (conflicting flags, missing scope) emit text errors and stop. No cascading failure risk.
- **State lifecycle risks:** Headless writes run artifacts but not todos. A caller that expects todos from headless would get none — this is intentional and documented.
- **API surface parity:** Headless mode is a new API surface for skill-to-skill invocation. Future orchestrators may adopt it, but existing ones are unchanged.
- **Unchanged invariants:** Stages 3-5 (reviewer selection, sub-agent dispatch, merge/dedup pipeline) are completely unchanged. The findings schema is unchanged. The confidence threshold (0.60) is unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Headless checkout guard text diverges from report-only over time | Both share the same guard language — mention headless alongside report-only in the same sentences so they stay in sync |
| Caller assumes headless creates todos and depends on them | Headless rules section explicitly states no todos; contract test asserts it |
| Structured output format drifts from document-review's envelope | Format is documented in review-output-template.md and tested by contract; changes require deliberate updates |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-28-ce-review-headless-mode-requirements.md](docs/brainstorms/2026-03-28-ce-review-headless-mode-requirements.md)
- Related code: `plugins/compound-engineering/skills/ce-review/SKILL.md`, `plugins/compound-engineering/skills/document-review/SKILL.md`
- Related PRs: #425 (document-review headless mode)
- Learnings: `docs/solutions/skill-design/beta-promotion-orchestration-contract.md`, `docs/solutions/skill-design/compound-refresh-skill-improvements.md`, `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md`
