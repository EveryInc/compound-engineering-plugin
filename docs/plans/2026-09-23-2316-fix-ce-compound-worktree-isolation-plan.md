---
title: "fix(ce-compound): isolate learning writes in a clean worktree"
date: 2026-09-23
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
---

# Isolate ce-compound learning writes

## Summary

Give `ce-compound` a deterministic Git preflight before either Full or Lightweight mode can write a learning, vocabulary, pack, or instruction file. A safe current worktree can continue; otherwise the preflight prepares or resumes one task-bound worktree and returns its path. The agent performs documentation writes there and keeps the solving checkout as read-only context when needed.

## Problem Frame

An agent can invoke `ce-compound` from a default branch, primary or shared checkout, or a tree containing someone else's edits. Its current write steps trust that checkout, so a learning can contaminate unrelated work or overwrite user changes. RM-1520 asks for a clean, isolated workspace before editing, with resumable identity and fail-closed diagnostics.

## Requirements

- **R1.** Before any tracked or artifact write, classify the current repository, worktree, branch, and complete Git status (including untracked files). A primary or shared checkout, default or protected branch, and unrelated dirty tree is never a write destination.
- **R2.** Reuse a current or previously prepared worktree only when it is registered in the same repository, on the expected task branch, and its ownership identity matches the ticket or task. It must be clean or contain only recorded, task-owned partial outputs. Reject occupied, missing, unrelated dirty, or mismatched candidates with an actionable reason.
- **R3.** If the current checkout is unsafe, create a dedicated branch and worktree from its committed HEAD, leaving its index, files, and branch untouched. Never stash, move, discard, or auto-include user changes. When a solved fix exists only in uncommitted source files and the isolated tree cannot substantiate it, stop with commit-first recovery guidance.
- **R4.** Stable repository and ticket/task identity makes a repeated invocation resume the same worktree after interruption without duplicate branches or docs. Retain the worktree after completion; cleanup remains explicit.
- **R5.** Both Full and Lightweight modes, including non-interactive runs and optional write paths, use the same preflight result and fail closed when safe isolation cannot be established. Preserve the source checkout path and branch for read-only session-history discovery. An external Compound Pack write needs its own validated isolated destination or is rejected.
- **R6.** Regression tests cover primary checkout, protected/default branch, dirty tree preservation, compatible reuse, incompatible/occupied/dirty worktree rejection, and interrupted setup/resume.

## Scope Boundaries

- No automatic worktree removal, stash, reset, or cherry-pick.
- No change to general branch, PR, or landing rules.
- No automatic migration of existing learnings or other CE skills.

## Key Technical Decisions

- **KTD1 — Executable preflight.** Package a focused cross-platform script under `skills/ce-compound/scripts/`; prose alone cannot prove branch and worktree ownership. The script returns a machine-readable result and nonzero failure with recovery guidance. Governs R1-R6.
- **KTD2 — Identity and ownership.** Derive a stable key from the canonical Git repository plus explicit ticket when supplied, otherwise the original source branch and committed HEAD. Record the intent in repository Git metadata before creating a worktree. An invocation already inside an owned worktree reads and validates that record *before* deriving any fallback key, so later commits and branch changes cannot create a second identity. Reuse an unmarked caller worktree only with verifiable task ownership; ambiguity selects a new worktree. Governs R2, R4.
- **KTD3 — Atomic preparation and partial-write journal.** Name the branch and worktree from the key. Treat Git's branch checkout lock as occupancy authority; inspect any existing branch/path before creation and never force registration or cleanup. Record intended output paths and their pre-write state before each documentation edit. On resume, allow only those recorded paths to differ, then revalidate their contents and complete the interrupted step; unrelated edits block. A crash after worktree creation but before the first write remains recoverable from the intent record. Governs R2-R4.
- **KTD4 — One write boundary, two read contexts.** Run the preflight before artifact-root creation and before Full research or Lightweight writing. Documentation writes and code grounding use the returned worktree. Full session-history discovery may read the original checkout path and branch captured at preflight. If an uncommitted source fix is required for the learning, stop and explain how to commit it first; do not silently document an older committed tree. Resolve optional pack destinations before writing and reject any outside the isolated worktree until they have their own safe isolation. A failed preflight ends with a mode-appropriate failure report. Governs R1, R3, R5.

## Existing Patterns

- `skills/ce-worktree/SKILL.md` defines primary versus linked worktree detection, native worktree preference, and the one-branch-one-worktree rule.
- `skills/ce-compound/SKILL.md` owns mode detection and its write envelope; `references/lightweight.md` and `references/assembly.md` own the two writing paths.
- `tests/skills/ce-compound-headless-depth.test.ts` pins always-loaded mode behavior; `tests/skills/ce-compound-readonly-enhancement.test.ts` shows skill contract testing.
- `docs/solutions/best-practices/predictable-tmp-cache-ownership-check.md` describes ownership checks for predictable paths.

## Implementation Units

### U1. Add the isolation preflight

**Goal:** Establish one safe, resumable destination or return a precise blocker.

**Requirements:** R1-R4, R6.

**Dependencies:** None.

**Files:** `skills/ce-compound/scripts/prepare-worktree.py`, `tests/skills/ce-compound-worktree.test.ts`.

**Approach:** Inspect canonical Git paths, worktree registration, branch and status before mutation. Use stable task identity and an intent record outside the tracked tree. Create from committed HEAD when needed. Return source and destination paths separately. Validate the result again before returning it. Add an output-intent operation so interrupted documentation edits are recognizable without accepting unrelated dirt. Treat path collisions, branch occupancy, ambiguous identity, and Git failures as blockers with recovery instructions.

**Test scenarios:**

1. A clean primary checkout on the default branch returns a different clean worktree and leaves the primary tree and branch unchanged.
2. A clean linked worktree on a protected branch is isolated rather than edited.
3. A source checkout with staged, unstaged, and untracked user files remains byte-for-byte unchanged while preparation uses committed HEAD.
4. A repeated call with the same ticket and repository reuses the registered, clean, owned worktree and branch.
5. A worktree with the expected name but wrong owner, wrong branch, or unrelated dirty status is rejected without cleanup or edits.
6. An occupied branch or path collision returns a blocker; interruptions after preparation and after a recorded learning write resume the same branch and document without duplication.
7. A ticketless invocation from its owned worktree uses the persisted identity even after a commit.

**Verification:** Focused fixture tests exercise real temporary Git repositories and show no source file or index mutation.

### U2. Put the preflight at the skill's write boundary

**Goal:** Make Full and Lightweight runs use the validated destination for every subsequent operation.

**Requirements:** R1, R5.

**Dependencies:** U1.

**Files:** `skills/ce-compound/SKILL.md`, `skills/ce-compound/references/lightweight.md`, `skills/ce-compound/references/assembly.md`, `tests/skills/ce-compound-worktree.test.ts`.

**Approach:** Add an always-loaded preflight step immediately after mode/precondition selection and before artifact-root resolution. Explicitly bind all later research, subagent context, and writes to the returned path. Keep failure reporting compatible with each mode's terminal signal. Point mode references to the one result rather than repeating Git policy.

**Test scenarios:**

1. Static skill contract confirms preflight precedes artifact-root and mode write steps.
2. Full and Lightweight instructions both use the returned path and stop on preflight failure.
3. Non-interactive failure includes the existing `Documentation skipped` terminal signal.
4. A learning about an uncommitted source-only fix stops before writing, with commit-first recovery; unrelated source changes remain untouched.
5. Full session-history uses the original source checkout identity after isolation.
6. An external pack destination is rejected before any pack write unless independently isolated.

**Verification:** Skill contract tests and plugin validation pass.

## Verification Contract

- Run focused `ce-compound` worktree and existing mode tests, then `bun run test` because skill conventions and a bundled script change.
- Run `bun run release:validate`; inspect the branch diff and verify all added files are packaged with the skill.
- Confirm the source checkout's initial Git status and representative file hashes remain unchanged throughout fixture runs.

## Definition of Done

- All RM-1520 acceptance cases have executable coverage.
- The new preflight is required for every writing mode, with a clear resume path and no automatic cleanup.
- The implementation, tests, plan, and any necessary usage docs are committed on one issue branch and offered in a PR linked to RM-1520.
