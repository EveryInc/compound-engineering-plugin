---
title: "Watch-loop skills need a blocked-external terminal state for fork-PR CI approval gates"
category: skill-design
date: 2026-07-11
module: skills/ce-babysit-pr
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - "Building or reviewing a watch-loop skill that polls PR/CI status until merge-ready"
  - "A PR is a fork->upstream submission from a non-maintainer where CI requires a maintainer's approval to run"
  - "A status signal (e.g., all_checks_ok) is derived only from statusCheckRollup or check-runs"
  - "Classifying a stalled watch-loop into needs-human vs in-progress vs a new blocked-external state"
  - "Designing pipeline-mode termination behavior for an externally-gated, unbounded-timeline block"
tags:
  - ce-babysit-pr
  - watch-loop
  - github-actions
  - fork-pr
  - ci-gating
  - blocked-external
  - pipeline-mode
  - false-green
related_components:
  - development_workflow
  - tooling
---

## Context

`ce-babysit-pr` watches an open GitHub PR toward merge, driven by a deterministic snapshot engine (`skills/ce-babysit-pr/scripts/pr-snapshot`) that fetches both event streams — CI checks and review threads — on every tick and emits an actionable set the skill's prose acts on.

On `stablyai/orca#8238` (fork `tmchow/orca` -> upstream `stablyai/orca`), the loop reported `all_checks_ok: true` while the PR's real CI had never started. The single check the rollup could see (a lightweight `Track` job) had passed; the substantive workflows were sitting behind GitHub's fork-PR security gate, waiting for a base-repo maintainer to click "Approve and run workflows." Nothing in `gh pr view --json statusCheckRollup` reflected that — a workflow run that is `action_required`/`waiting` has not yet produced a check-run at all, so it is structurally absent from the rollup, not present-and-pending. The only surviving signal was `mergeStateStatus: UNSTABLE`, plus a manual `gh api repos/{owner}/{repo}/actions/runs?head_sha=...` query that showed the gated run.

This is a partial-truth API problem: `statusCheckRollup` answers "what do check-runs say," not "has CI actually run." A snapshot engine that treats the rollup as the complete picture will report green on a PR whose real CI is dormant. It is also the common open-source case: a contributor who is not a maintainer of the upstream repo cannot approve their own fork-PR workflow run — the block is on a third party, and the wait is unbounded (hours to days), so a naive loop either reports a false green or spins forever.

## Guidance

**Query a second, independent source for the fact the primary API can't see, and fold it into the "ok" computation rather than layering it on top.** `fetch_awaiting_approval(owner, name, head)` in `pr-snapshot` hits `repos/{owner}/{name}/actions/runs?head_sha=<head>` and counts runs with `status in (action_required, waiting)` or `conclusion == action_required` — best-effort, returning `0` on any API/permission failure rather than failing the tick. `diff()` folds that count into `all_checks_ok`:

```python
awaiting_approval = cur.get("awaiting_approval", 0)
all_checks_ok = checks_terminal and not has_failing and bool(cur["checks"]) and awaiting_approval == 0
blocked_external = awaiting_approval > 0 and not has_failing and not actionable_threads
```

`all_checks_ok` cannot go true while a workflow is gated, and `checks_awaiting_approval` / `blocked_external` are emitted as first-class fields alongside the actionable set — not inferred later from prose.

**Model the discovered state as its own terminal condition, not a variant of an existing one.** "Blocked on a third party neither the loop nor the user controls, for an unbounded time" is neither `needs-human` (the user *could* act — resolve a thread, fix code) nor transient `in-progress` (bounded, will resolve on its own soon). `ce-babysit-pr`'s Step 3 gives it a dedicated stop condition, "Blocked on external CI approval":

- Interactive: recommend stopping by default, report the wait as open-ended (hours to days, and review is often *also* gated on CI so there may be nothing to watch), give the exact resume command (`/ce-babysit-pr <url>`), and offer exactly **one** bounded alternative — poll at ~30-minute cadence, hard-capped at 24h, resuming full babysitting the moment CI clears.
- Pipeline/unattended: don't ask, don't spin — return a `blocked-external` residual with the run URL and terminate.
- **Never auto-approve the run.** That click is the maintainer's security gate; the skill treats it as out of scope for automation entirely.

**Gate on push-capability, not fork-status.** A PR from your own fork is still fully drivable — you can push fixes to the head. The distinction that matters is whether *this loop* can push to the PR's head ref, not whether the head repo happens to be a fork; read state from the base repo, push fixes to the head/fork.

## Why This Matters

A watch loop over an external system's API inherits that API's blind spots. If the loop's "done"/"ok" signal is built directly from one endpoint's fields without checking whether that endpoint has a known gap, the loop will confidently report green on a red (or in this case, not-yet-run) reality — the worst failure mode for an autonomous monitor, because the false-positive is silent and looks identical to genuine success.

The fix generalizes past this one API: **don't let a single endpoint's completeness assumption become your loop's completeness assumption.** Cross-check with a second source when you know (or suspect) the primary source omits a state, and make the omission visible in the engine's boolean, not just left to a human noticing `mergeStateStatus` disagrees with the rollup.

The second half — modeling `blocked-external` as its own condition — matters because collapsing it into `needs-human` would tell the user "something needs your attention" when nothing does (they can't approve someone else's maintainer gate), and collapsing it into ordinary in-progress waiting would make the loop spin indefinitely (or the user assume it will resolve on the loop's normal cadence) on a wait that can run for days. A watch loop's stop-condition taxonomy needs a distinct bucket for "blocked on someone outside this conversation, unbounded," with its own handback shape (bounded-poll offer + resume command, no auto-resolution).

## When to Apply

- Building or reviewing any polling/watch-loop engine (CI watchers, deploy monitors, review-status trackers) that derives an "ok"/"done" signal from a single external API's fields.
- The external system has a known async-approval or moderation gate (fork-PR CI approval, app review, manual QA sign-off) where the gated item may not appear in the primary status feed until *after* approval.
- Designing stop conditions for an autonomous loop: check whether "blocked on a third party, unbounded timeline, no one in this loop can act" is already collapsing into an existing bucket (`needs-human`, `in-progress`) rather than getting its own condition and handback UX.
- Any handback path that could plausibly auto-approve, auto-retry, or auto-bypass a security/approval gate on the user's behalf — treat approval gates as categorically out of scope for automation, not just "risky."

## Examples

**Before:** `pr-snapshot` computed `all_checks_ok` solely from `statusCheckRollup`:

```python
all_checks_ok = checks_terminal and not has_failing and bool(cur["checks"])
```

On the gated fork PR, the rollup contained only the one ungated `Track` check (`COMPLETED`/`SUCCESS`), so `checks_terminal=True`, `has_failing=False`, `all_checks_ok=True` — reported ready while the substantive CI had never started. Nothing in the snapshot distinguished this from an actually-green PR, and `ce-babysit-pr` had no stop condition for it, so a "blocked on maintainer approval" PR would either be reported as merge-ready or fall through to the generic `needs-human` bucket with no bounded-wait guidance and no explicit refusal to auto-approve.

**After:** `fetch_awaiting_approval` queries the Actions runs API independently and `diff()` wires it into both the ok-signal and a dedicated flag:

```python
awaiting_approval = cur.get("awaiting_approval", 0)
all_checks_ok = checks_terminal and not has_failing and bool(cur["checks"]) and awaiting_approval == 0
blocked_external = awaiting_approval > 0 and not has_failing and not actionable_threads
```

`SKILL.md` Step 3 adds "Blocked on external CI approval" as its own stop condition with the interactive default-to-stop + bounded 30-min/24h-cap alternative + resume-command handback, and an explicit never-auto-approve rule. Verified live on `stablyai/orca#8238`: the snapshot returned `blocked_external: true` and `checks_awaiting_approval: 1`, `all_checks_ok: false`; the skill recommended stopping, offered the bounded watch, printed the resume command, and did not attempt to approve the run. The regression test `tests/ce-babysit-pr-snapshot.test.ts` ("a fork-PR workflow awaiting maintainer approval blocks 'all_checks_ok' and flags blocked_external") locks this in via `--fetch-file` with `awaiting_approval: 1`, asserting `checks_awaiting_approval === 1`, `has_failing_checks === false`, `all_checks_ok === false`, and `blocked_external === true`.

## Related

- [Git workflow skills need explicit state machines for branch, push, and PR state](./git-workflow-skills-need-explicit-state-machines.md) — the same meta-pattern in a sibling git/gh skill family: an implicitly-assumed state (there, PR/branch existence and cleanliness) silently produces a wrong boolean instead of surfacing as an explicit state. This learning is that pattern applied to "a check-run existing at all," in a watch loop.
- `docs/plans/pipeline-mode-contract-and-lfg-babysit-consolidation.md` — the originating design contract that defines *pipeline mode*, the *durable residual* (never blocking, never silently applying), and *terminate on a bound / return structured status*. The `blocked-external` handback here is a direct instantiation of those rules for the fork/CI-approval case.
