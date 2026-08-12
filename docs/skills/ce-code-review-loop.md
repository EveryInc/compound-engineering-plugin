# `ce-code-review-loop`

> Converge a clean local branch through canonical full code reviews, verified defect-family fixes, and an unchanged final review gate.

`ce-code-review-loop` is a bounded orchestration skill around [`ce-code-review`](./ce-code-review.md). It does not replace the one-shot reviewer or implement a second review engine. It repeatedly calls the canonical full review, revalidates its findings against the current branch, applies only authorized mechanical fixes, verifies each defect family, and commits that family locally before reviewing the new HEAD.

## When to use it

Use the loop when:

- a clean local feature branch needs review, remediation, and evidence-backed convergence before merge;
- one review is likely to expose several related defects across callers, sibling paths, tests, or delivery gates;
- fixes need to remain separated into reviewable, verified local commits;
- the final result must be a fresh full review of the exact unchanged HEAD.

Use plain [`ce-code-review`](./ce-code-review.md) for a normal one-shot report, a PR or branch-ref review without checkout, a quick/light review, or a single explicitly authorized local-apply pass. The basic one-shot invocation remains:

```text
/ce-code-review
```

The loop is intentionally narrower: it operates only on the current clean local branch and may create local remediation commits.

## Invocation

```text
/ce-code-review-loop
/ce-code-review-loop max-work-units:6
/ce-code-review-loop base:origin/main
/ce-code-review-loop plan:docs/plans/organization-accounts.md
/ce-code-review-loop max-work-units:6 base:origin/main plan:docs/plans/organization-accounts.md
```

| Argument | Effect |
|----------|--------|
| `max-work-units:N` | Circuit breaker for total review waves and remediation cycles. Default: `8`; accepted range: `2` through `10`. |
| `base:<ref>` | Resolves one concrete base SHA before the first review and uses that same base for every wave. |
| `plan:<path>` | Supplies the implementation plan used by canonical review for requirements verification. |

A global review wave consumes one work unit. A defect-family remediation cycle also consumes one, including a discarded cycle. The budget limits work; it never proves convergence.

## Protocol

1. **Preflight the checkout.** Require a current local branch with no staged, unstaged, or untracked changes. Reject detached HEAD, PR numbers, PR URLs, and branch targets. Resolve and freeze the base SHA and starting HEAD.
2. **Run canonical review.** Invoke `ce-code-review mode:agent depth:full grouping:auto base:<resolved-base-sha>` through the host's callable skill mechanism, adding `plan:<path>` when supplied. An inline review, generic reviewer, or local imitation is not a substitute.
3. **Validate the review envelope.** Require the reviewed base, HEAD, branch, reviewer selection and coverage, terminal status, actionable findings, triage groups, residual risks, and testing gaps. Missing, malformed, stale, or mismatched evidence stops the cycle.
4. **Revalidate findings.** Match each finding's stable number, file, line, evidence, and impact against the current HEAD. Drop stale findings rather than fixing an issue that no longer exists.
5. **Separate authority from judgment.** Mechanical, evidence-backed findings may enter remediation. Product, design, compatibility, migration, rollout, or other decision-bearing findings become explicit blockers; the loop never guesses through them.
6. **Remediate by defect family.** Treat related findings and their callers, sibling surfaces, tests, fixtures, and delivery gates as one bounded family. Record the checkpoint HEAD, touched paths, and verification plan; apply the family; inspect the complete cycle diff; run targeted verification sized to its blast radius.
7. **Commit verified families locally.** Each successful family becomes one local `fix(review): ...` commit. If verification fails or concurrent changes appear, restore only the loop's changes for that cycle, preserve prior verified commits, and stop as `Non-converged`.
8. **Review every new HEAD.** Any remediation commit invalidates all earlier convergence evidence. Run a fresh canonical full review against the same frozen base.
9. **Pass the final gate.** On the unchanged final HEAD, require canonical status `complete`, full required-reviewer coverage, `Ready to merge`, an empty `actionable_findings` set, no decision-bearing blocker, clean final project verification, and a clean working tree. Residual advisories, residual risks, and testing gaps remain visible even when non-blocking.

## Authority and safety

The loop may edit the current clean local branch and create verified local remediation commits. It does not:

- push;
- check out or switch branches;
- create or move to a worktree;
- rebase, amend, or squash commits;
- review or mutate a PR/branch target supplied as an argument;
- hide a decision-bearing finding by choosing a product or rollout direction;
- claim convergence from passing tests, a declining finding count, or budget exhaustion alone.

This boundary keeps remote publication and history-shaping decisions with the user or the shipping workflow.

## Convergence and non-convergence

Convergence is about the final reviewed state, not round count. Progressive failure migration — one repaired layer exposing a deeper sibling or caller defect — is ordinary progress. Oscillation is different: the same issue reappears, fixes alternate between incompatible states, sibling paths repeatedly contradict each other, or the trajectory stops improving.

The loop reports `Non-converged` when it encounters a decision blocker, malformed or incomplete canonical review, required-reviewer coverage gap, failed verification, concurrent checkout change, oscillation, or exhausted work-unit budget. The report preserves verified local commits and identifies the next bounded cycle rather than presenting partial evidence as success.

## Ownership boundary

`ce-code-review` owns:

- diff analysis and intent reconstruction;
- depth and persona selection;
- reviewer dispatch and required-reviewer coverage;
- finding validation, merge, deduplication, severity, and triage groups;
- the structured `mode:agent` review envelope;
- the `Ready to merge` review judgment.

`ce-code-review-loop` owns:

- clean-local-branch preflight and frozen base identity;
- work-unit accounting and run state;
- review-envelope integrity checks and finding revalidation;
- defect-family grouping for remediation;
- local mutation authority, targeted verification, and per-family commits;
- decision blockers, oscillation detection, stopping rules, and the fresh final gate.

Keeping this line explicit prevents the loop from drifting into a second reviewer and lets improvements to `ce-code-review` flow through automatically.

## See also

- [`ce-code-review`](./ce-code-review.md) — canonical one-shot review engine and the loop's required callee
- [`ce-work`](./ce-work.md) — implementation workflow that runs one review/fix handoff before shipping
- [`ce-doc-review-loop`](./ce-doc-review-loop.md) — analogous bounded convergence for multi-contract documents
- [`ce-commit-push-pr`](./ce-commit-push-pr.md) — owns push and pull-request publication after local convergence
