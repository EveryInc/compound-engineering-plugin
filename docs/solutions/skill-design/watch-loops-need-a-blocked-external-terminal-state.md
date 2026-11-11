---
title: "Watch-loop skills need a bounded blocked-external handback for fork-PR CI approval gates"
category: skill-design
date: 2026-07-11
module: skills/ce-babysit-pr
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - "Building or reviewing a watch-loop skill that polls PR/CI status until merge-ready"
  - "A status signal (e.g., all_checks_ok) is derived only from statusCheckRollup or check-runs"
  - "Classifying a stalled watch-loop into needs-human vs in-progress vs a new blocked-external state"
tags:
  - ce-babysit-pr
  - watch-loop
  - github-actions
  - fork-pr
  - ci-gating
  - blocked-external
  - false-green
related_components:
  - development_workflow
  - tooling
---

# Watch-loop skills need a bounded blocked-external handback for fork-PR CI approval gates

## The API gap

On a fork -> upstream PR from a non-maintainer (`stablyai/orca#8238`), `gh pr view --json statusCheckRollup` reported the one ungated lightweight job as passed while the substantive workflows sat behind GitHub's fork-PR security gate waiting for a maintainer to click "Approve and run workflows." **A workflow run that is `action_required`/`waiting` has not produced a check-run at all, so it is structurally absent from the rollup -- not present-and-pending.** The only surviving signals were `mergeStateStatus: UNSTABLE` and `gh api repos/{owner}/{repo}/actions/runs?head_sha=<head>`, which lists the gated run.

`statusCheckRollup` answers "what do check-runs say," not "has CI actually run." An `all_checks_ok` computed from it alone goes true on a PR whose real CI is dormant -- the worst failure for an autonomous monitor, because the false green looks identical to success. `pr-snapshot` therefore queries the Actions runs API independently (`fetch_awaiting_approval`, best-effort; an API or permission failure returns `None`, so the tick keeps the last proven gate state instead of reading an unknown result as a proven clear) and folds the count into `all_checks_ok` itself, emitting `checks_awaiting_approval` / `blocked_external` as first-class fields rather than leaving prose to infer them. The general rule: do not let a single endpoint's completeness assumption become the loop's completeness assumption; cross-check with a second source where the primary is known to omit a state, and make the omission visible in the engine's boolean.

## Why it is its own state

"Blocked on a third party neither the loop nor the user controls, for an unbounded time" is not ordinary `in-progress`: that bucket expects resolution soon, and this wait runs hours to days, so the loop spins indefinitely. Why it is also not `needs-human` (no one in the loop can act; a comment in `pr-snapshot` says so) and not an immediate stop (review can still move while CI is gated) is stated where the state is handled: `skills/ce-babysit-pr/references/settle.md` owns the bounded review drain, the `blocked-external-drained` handback, the pipeline-mode residual, and the never-auto-approve rule. Gating on push capability rather than fork status is in `skills/ce-babysit-pr/references/setup.md` and `skills/ce-commit-push-pr/references/apply-and-handoff.md`.

## When to Apply

- Any polling engine (CI watchers, deploy monitors, review trackers) that derives an "ok"/"done" signal from one external API's fields, where the system has an async approval or moderation gate whose gated item does not appear in the primary status feed until *after* approval.
- Designing stop conditions for an autonomous loop: check whether "blocked on a third party, unbounded, no one in this loop can act" is collapsing into `needs-human` or `in-progress` rather than getting its own condition and handback.
- Any handback path that could plausibly auto-approve, auto-retry, or auto-bypass an approval gate on the user's behalf.

## Related

- [Git workflow skills need explicit state machines](./git-workflow-skills-need-explicit-state-machines.md) -- the same meta-pattern: an implicitly assumed state silently produces a wrong boolean instead of surfacing as an explicit state; here the assumed state is "a check-run exists at all."
- `docs/plans/pipeline-mode-contract-and-lfg-babysit-consolidation.md` -- the pipeline-mode contract (durable residual, terminate on a bound) this handback instantiates.
