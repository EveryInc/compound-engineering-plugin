---
title: ce-code-review-loop design
date: 2026-08-12
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
status: approved-design
---

# ce-code-review-loop

## Problem

`ce-code-review` deliberately separates review from mutation. Its default and `mode:agent` paths are report-only; `apply:local` is an explicit single-run convenience. There is no bounded workflow that repeatedly obtains canonical structured review evidence, applies only authorized fixes, verifies them, and re-reviews the resulting code until the branch is demonstrably ready to merge.

A naive outer loop is unsafe. It can parse human Markdown, mutate a dirty tree, apply product decisions as if they were mechanical fixes, accept incomplete reviewer coverage, or stop after the finding count declines rather than after a full review of the final HEAD.

## Outcome Spine

**Result:** the current local branch at a committed HEAD whose final canonical `ce-code-review mode:agent depth:full` wave returns `status: complete`, `verdict: Ready to merge`, and no actionable findings, with project verification passing and the checkout unchanged during the final review.

**Next consumer:** the user or a caller deciding whether to push or open a PR.

**Done:** either a convergence envelope with the final HEAD and residual advisory evidence, or a fully populated `Non-converged` envelope naming the exact blocker and next bounded cycle.

**Intent:** preserve `ce-code-review` as the sole review engine and keep product decisions outside automatic repair authority.

## Requirements

### R1. Current local checkout only

The loop operates only on the current local branch and working tree. It may accept `base:<ref>` and `plan:<path>`. A PR number, PR URL, or other branch target fails closed. The loop never checks out another branch, creates a worktree, rebases, pushes, opens a PR, or files a ticket.

### R2. Clean entry state

The checkout must have no staged, unstaged, or untracked changes at entry. The loop records the branch, resolved base SHA, and starting HEAD. A dirty entry returns `Non-converged` before the first review wave.

After entry, any unexpected branch change, HEAD change outside a loop-owned commit, or working-tree change outside the active remediation cycle is concurrent user work. Stop without overwriting or resetting it.

### R3. Canonical review only

Every global review wave invokes the callable `ce-code-review` skill with `mode:agent depth:full grouping:auto` and the frozen `base:<sha>`. The loop must not copy or reconstruct persona selection, cross-model routing, finding synthesis, confidence gates, validation, severity, or action routing.

If the canonical skill is unreachable or returns malformed output, stop as `Non-converged` and print one copyable user invocation using the active harness's user-facing command form.

### R4. Caller receipt

`ce-code-review` `mode:agent` adds a `review_receipt` object:

```json
{
  "base_sha": "<resolved base SHA>",
  "head_sha": "<reviewed HEAD SHA>",
  "branch": "<reviewed branch>",
  "selected_reviewers": ["<reviewer>"],
  "required_reviewers": ["<reviewer>"],
  "completed_reviewers": ["<reviewer>"],
  "failed_reviewers": [{"reviewer": "<reviewer>", "reason": "<reason>", "required": true}],
  "terminal_status": "complete | degraded | failed"
}
```

The receipt is emitted on every `mode:agent` completion path where review dispatch began. Existing top-level `status` remains authoritative for serialization success; the receipt supplies reviewed-state and coverage evidence for callers.

A wave is valid only when:

- the payload is one parseable JSON object;
- `status` and `review_receipt.terminal_status` are `complete`;
- receipt branch/base/head match the actual frozen review inputs;
- every reviewer in canonical `required_reviewers` appears in completed reviewers;
- no required reviewer is present in failed reviewers;
- the branch, HEAD, and clean working tree stayed unchanged during review.

`ce-code-review` owns the `required_reviewers` classification, including optional cross-model peer semantics. The loop consumes that list verbatim and never infers requiredness from reviewer names or providers.

### R5. Work-unit circuit breaker

`max-work-units:N` defaults to `8` and accepts integers `2` through `10`. One canonical global review wave and one defect-family remediation cycle each consume one unit, including a discarded or failed unit. The limit prevents runaway repair; it never authorizes declaring convergence with open evidence.

### R6. Actionable-finding integrity

The apply queue is exactly `actionable_findings`. Triage groups are organizational evidence, not mutation authority; the loop intersects each group's stable finding numbers with the actionable queue.

Before changing code, the loop revalidates each finding against current HEAD: the file and cited line exist, the quoted evidence still appears in context, and the finding's failure mode remains present. A stale finding is not applied and triggers a fresh canonical wave when needed.

Each actionable finding must carry a stable number, severity, file, line, `why_it_matters`, evidence, owner, route, and a concrete response (`suggested_fix` or an explicit decision context). Missing required detail is an integrity failure for that finding; do not guess the fix.

### R7. Authority classification

The loop classifies revalidated actionable findings into:

- **mechanical:** the defect and required behavior are established by code, tests, public contracts, active instructions, or an explicit implementation-ready plan; the fix can be verified without choosing new product semantics;
- **decision-bearing:** the response requires a product/design choice, public compatibility decision, migration or rollout policy, unavailable external authority, or behavior that cannot be proven from repository evidence.

The loop may fix only mechanical findings. Decision-bearing findings become non-waivable blockers. Independent mechanical defect families may be closed first, but the loop never guesses through a blocker or reports convergence while one remains.

### R8. Defect-family remediation cycle

Group mechanical findings by shared root cause and overlapping fix path, using `triage_groups` when present and semantic reconciliation when they are absent or incomplete.

For each family:

1. Verify branch, HEAD, and clean tree against the cycle checkpoint.
2. Record the checkpoint HEAD, stable finding numbers, intended paths, and verification plan in invocation-scoped run state.
3. Apply the smallest source fix, including necessary callers, tests, fixtures, types, and contract documentation.
4. Review the complete cycle diff for scope, unexpected files, duplicated policy, widened interfaces, and accidental behavior changes.
5. Run targeted verification chosen from the repository's existing commands. Broaden when the change touches shared or wide-reach code.
6. On failed verification, revert only loop-owned cycle edits. If concurrent user work is detected, do not reset; stop as `Non-converged` and preserve all bytes.
7. On success, create one local commit using `fix(review): <root cause>` or the repository's nearest valid convention. Record the resulting HEAD and verification evidence.

The loop never amends, squashes, rebases, or pushes remediation commits.

### R9. Fresh evidence after mutation

Any remediation commit invalidates all prior zero-finding, finding-count, verdict, and reviewer-coverage claims for convergence. The next unit must be a canonical full review of the new HEAD. Declining finding counts, lower severity, or successful tests are diagnostic progress, not convergence.

### R10. Non-convergence detection

Stop before the work-unit limit when repair is demonstrably oscillating:

- the same root defect reappears after its verified fix;
- fixes alternate between incompatible states;
- defects migrate across sibling sites under one still-unsatisfied invariant;
- a later finding contradicts a prior required fix and repository evidence cannot resolve the conflict;
- fix scope grows materially beyond the reviewed change's intended contract.

Progressive failure migration is not oscillation: fixing independent defect A and then discovering distinct defect B is ordinary progress. A multi-site recurrence with one root cause should be widened into one bounded family, not parked one site at a time.

Non-convergence returns the trajectory: finding identities, commits, recurrences, verification outcomes, and the unresolved invariant or decision.

### R11. Final convergence gate

Success requires one canonical review wave of the final unchanged HEAD with all of:

- `mode:agent depth:full` was used;
- payload and receipt are valid;
- `status: complete`;
- `verdict: Ready to merge`;
- `actionable_findings` is empty;
- required reviewer coverage is complete;
- no decision-bearing blockers remain;
- branch and HEAD equal the reviewed receipt;
- working tree is clean and unchanged after review;
- final project verification passes on that HEAD.

Primary human/release-owned findings, `residual_risks`, `testing_gaps`, and advisory outputs may remain. They are reported in the convergence envelope and do not grant mutation authority. A `Ready to merge` verdict is still required, so canonical review can keep a material advisory as blocking when appropriate.

### R12. Output contracts

Success:

```text
Code review loop converged
Branch: <branch>
Base: <sha>
Final HEAD: <sha>
Review waves: <N>
Remediation commits: <N>
Final ce-code-review: Ready to merge, no actionable findings
Verification: <checks and outcomes>
Residual advisories: <none or list>
```

Failure:

```text
Non-converged
Branch: <branch or unavailable>
Base: <sha or unavailable>
Starting HEAD: <sha or unavailable>
Last reviewed HEAD: <sha or not_reached>
Completed work units: <N global waves + remediation cycles>
Open actionable findings: <stable IDs and summaries>
Decision blockers: <list>
Reviewer coverage gaps: <list>
Verification failures: <list>
Concurrent change: <none or observed branch/HEAD/path change>
ce-code-review: <complete, degraded, failed, skill_unreachable, malformed, or not_run>
Next bounded cycle: <exact review invocation, defect family, or user decision>
```

## Architecture

### `ce-code-review`

Owns scope interpretation, reviewer selection, dispatch, cross-model review, finding mechanics, validator passes, severity, routing, verdict, and the structured review artifact. It remains report-only in `mode:agent`.

### `ce-code-review-loop`

Owns entry-state authority, immutable base selection, review receipt validation, actionable-finding revalidation, mechanical-vs-decision classification, defect-family grouping, local remediation, verification, local commits, trajectory, circuit breaker, and convergence.

### Invocation-scoped run state

Use `/tmp/compound-engineering-<effective-uid>/ce-code-review-loop/<run-id>/run-state.json` with a fresh run id, owner and symlink checks, and mode `0700` directories. Store only loop state and evidence. The repository and local commits remain the product state; no durable repo artifact is created by the loop.

Minimum fields:

- run id, branch, base SHA, starting/current/last-reviewed HEAD;
- work-unit counts;
- canonical review artifact paths and receipts;
- actionable finding ledger and stable identity history;
- decision blockers and coverage gaps;
- defect families, cycle checkpoints, touched paths, commits, and verification;
- recurrence/oscillation trajectory;
- final gate evidence.

## Failure and Recovery

- **Dirty entry:** no review, no mutation.
- **Canonical skill unavailable:** no imitation; return a copyable direct invocation.
- **Malformed payload or receipt mismatch:** discard the wave's findings.
- **Reviewer coverage gap:** do not converge; retry only when plausibly transient and budget remains.
- **Verification failure:** revert only the active loop-owned cycle when no concurrent work exists.
- **Concurrent user change:** preserve the tree exactly as found and stop; never use reset or checkout to erase it.
- **Commit failure:** leave verified changes in the tree, report the exact state, and stop; do not retry by weakening hooks or signing policy.
- **Budget exhaustion:** return open evidence and next bounded cycle, never success.

## Verification Strategy

### Behavioral RED/GREEN scenarios

Before adding the skill, run pressure scenarios against a generic agent without the new skill and record whether it:

1. loops over human Markdown or uses `apply:local` instead of the JSON handoff;
2. mutates a dirty tree;
3. applies a product decision automatically;
4. accepts failed reviewer coverage;
5. declares success after tests or a reduced finding count without a final full review;
6. continues after branch/HEAD drift;
7. pushes or opens a PR.

Inject the current skill content into the same scenarios after implementation. Each scenario must preserve the designed authority and final gate.

### Deterministic contract tests

Tests pin:

- registration, release count, context parity, and documentation inventory;
- accepted/rejected arguments and clean-tree gate;
- exact canonical invocation tokens;
- `review_receipt` schema and `ce-code-review` documentation parity;
- required-reviewer coverage and malformed/integrity failure behavior;
- `max-work-units` default/range and unit accounting;
- mechanical vs decision-bearing authority;
- per-family checkpoint, verification, commit, and rollback rules;
- no push/checkout/rebase/worktree behavior;
- final HEAD, clean tree, verdict, actionable queue, and project-verification gate;
- complete success and `Non-converged` envelopes.

### Integration smoke scenario

Use a throwaway git repository with two commits and a clean feature branch. Feed a controlled `mode:agent` review fixture that first returns one mechanical finding and then a clean `Ready to merge` review. Verify one `fix(review):` commit is created, the final tree is clean, the initial base is unchanged, and convergence is emitted. Separate fixtures cover a decision blocker, malformed receipt, verification failure, and concurrent file change.

## Documentation and Release Surfaces

Adding the skill requires:

- `skills/ce-code-review-loop/` with `SKILL.md`, late-loaded protocol reference, and context script;
- root `README.md` inventory row;
- `docs/skills/ce-code-review-loop.md` and catalog row in `docs/skills/README.md`;
- skill-count update in `tests/release-metadata.test.ts`;
- context and convention enrollment;
- `ce-code-review` JSON contract documentation and tests.

Release-owned versions and changelog entries remain automation-owned.

## Explicit Non-goals

- Automatic PR checkout, temporary worktrees, remote branch mutation, push, PR creation, or thread resolution.
- Reimplementing or partially imitating `ce-code-review`.
- Applying human/release-owned or decision-bearing findings.
- Treating advisory count, round count, or passing tests alone as convergence.
- Rewriting existing remediation commits, squashing history, or producing a polished one-commit branch.
- Requiring advisory, residual-risk, or testing-gap arrays to be empty when canonical verdict is `Ready to merge`.
