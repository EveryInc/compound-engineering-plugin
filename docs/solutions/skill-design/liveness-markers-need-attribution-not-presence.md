---
title: "A liveness marker proves work started, never that it is still running"
category: skill-design
date: 2026-09-01
module: skills/ce-babysit-pr
problem_type: design_pattern
component: tooling
severity: medium
symptoms:
  - "ce-babysit-pr held green, mergeable PRs out of merge-ready for 15-30 minutes after every review had already finished"
  - "the only visible cause was a permanent eyes reaction from `cursor[bot]` on the PR body, beside a check run that was already SUCCESS"
applies_when:
  - "Designing or reviewing a watch loop that infers whether a third party's work is still in progress"
  - "The liveness signal is a marker a third party sets — a reaction, a label, a status flag, a lock file — with no guarantee they ever clear it"
  - "A stale-marker workaround (a timeout or bound) is being extended or re-tuned instead of re-examined"
  - "Deciding whether a completion judgment belongs in a deterministic detector or in the agent's reasoning at a decision point"
related_components:
  - development_workflow
  - tooling
tags:
  - ce-babysit-pr
  - pr-snapshot
  - liveness
  - review-signal
  - third-party-marker
  - attribution
  - watch-loop
---

## Context

`ce-babysit-pr` watches an open PR and declares it merge-ready once GitHub reports it mergeable, checks are green, and the PR has been quiet for a settle window — 300 seconds by default. One input to that decision is whether a review looks in progress, and the detector took an eyes reaction on the PR body as a live-review signal. While that signal was present it blocked the ordinary settle and imposed a longer floor: `REVIEW_INPROGRESS_MAX_WAIT = 900` seconds, extensible once to 1800 (`skills/ce-babysit-pr/scripts/pr-snapshot:96`, consumed by the `review_blocking` gate at `:2803`).

The design assumed a bot that adds the reaction removes it when its review is done. A code comment said so directly. Cursor's Security Agent never removes it.

Checked against live data in this repository: all 10 of the most recently merged PRs at the time — every merged PR in the span #1592 to #1605 — carry a permanent `cursor[bot]` eyes reaction beside a completed, successful `cursor`-app check run. On #1605, `cursor[bot]` reacted at 2026-08-31T21:22:46Z and the check `Cursor Security Agent: Security Reviewer` completed SUCCESS four minutes later at 21:26:28Z. The reaction is still there. Every one of those PRs paid the floor for a review that had already landed.

Tracked as issue #1606. The fix described here is not yet merged as of this writing.

## Guidance

**A marker a third party sets is evidence that work started, never that it is still running, because nothing obliges them to clear it.** Attribute liveness to that party's own observable work instead of inferring it from the marker's continued presence. Where attribution is ambiguous, the completion judgment belongs to the agent, not the deterministic detector — the detector's job is to stop claiming what it cannot support and hand over the evidence it does have.

The detector now attributes each current reactor to the check runs its own GitHub App produced on the current head. The linking mechanism is that a GitHub App's bot account logs in as `<app-slug>[bot]`, which matches `app.slug` on a check run. In `skills/ce-babysit-pr/scripts/pr-snapshot`:

- `_bot_app_slug` (`:515`) strips the `[bot]` suffix to get the app slug, or `None` for a human or missing login.
- `_eyes_reaction_reactors` (`:521`) returns each current reactor's identity *and* login; only the count was used before.
- `_check_runs_by_app` (`:556`) groups current-head check runs by producing app. An app is terminal only when every run it owns has finished, so a repo running two products under one app slug never reads as done while the slower one is going. It returns `None` rather than `{}` when a run's shape is unreadable, so an unreadable payload cannot be mistaken for "nothing running."
- `fetch_head_check_apps` (`:591`) reads that grouping from the REST `commits/{sha}/check-runs` endpoint — deliberately not from `gh pr view --json statusCheckRollup`, which carries no app identity.
- `_review_signal_attribution` (`:613`) reports, per reactor, whether its own app's work on this head is `terminal`, `running`, `none` (a human, or an app with no run of its own), or `unknown` (the probe could not answer).
- `_review_signal_work_terminal` (`:635`) is true only when every present reactor's own work is terminal.

The 900-second hold releases on that flag, and nothing more is concluded. Whether the announced review actually *landed* — a comment, a review, or a check that carries its verdict — is the agent's judgment at the settle decision, stated as a branch in `skills/ce-babysit-pr/references/settle.md`. When a reactor's checks have finished but nothing reads as the review it announced, that review has not landed and the lifecycle stays incomplete.

Two failed designs are worth recording, because both are the obvious first move:

- **Special-casing the misbehaving bot by name** does not generalize. The next one needs its own carve-out and the list rots.
- **Letting the detector conclude "the review is complete"** puts a judgment call in the deterministic layer. Its failure mode is an app that ships a fast unrelated check alongside a slower review: the fast check finishes, the detector declares done, and the review is still coming.

### Count equality is not identity equality

The first implementation validated the attribution payload against the current reactor set by comparing counts. That let a duplicated terminal entry stand in for a reactor nobody described: identities `[A, B]` with attribution `[A-terminal, A-terminal]` passes a length check and releases the gate while `B` may still be working. Compare identity *sets* instead (`:2194`).

This was found by the cross-model adversarial reviewer; none of eight local reviewers caught it. When a derived payload has to account for a set of parties, matching on cardinality is the bug that hides in the shape of correct-looking code.

### Two facts from different endpoints do not move together for free

The first implementation assumed a reactor's work going running to terminal would reset the settle clock on its own, because the same check also appears in `statusCheckRollup`, which already feeds `_change_sig`. But attribution comes from a different endpoint than the rollup, and nothing makes the two update in lockstep. The flag is now persisted and included in `_change_sig` explicitly (`:2512`).

## Why This Matters

The prior answer to this exact class was a timeout. PR #1180 bounded a stalled review signal at 900 seconds, extensible to 1800, precisely because some reviewer might never publish a completion signal. That was the right *fallback* and the wrong *primary* answer: it bounded the damage without removing it, so every affected PR still paid 15 to 30 minutes.

A timeout is what you reach for when a third party's completion is unobservable. It is worth checking whether that is actually true before accepting it — here the completion was directly observable through a second endpoint the detector was not reading. When a workaround for a stale signal is being extended or re-tuned, that is the moment to ask whether the signal can be attributed instead.

## When to Apply

Any deterministic detector that treats an externally-set marker as proof of ongoing work. The marker being present is a fact about the past. Reach for the party's own observable output — their check run, their comment, their artifact — and where that output does not settle the question, hand the evidence to the agent rather than resolving it in the detector.

## Examples

Before, the whole signal was presence:

```python
review_signal_identities = fetch_eyes_reactors(...)
review_signal_count = len(review_signal_identities)
review_in_progress = review_signal_count > 0
```

After, presence is still reported, but liveness is attributed separately and the gate reads the attribution:

```python
review_signal_attribution = _review_signal_attribution(review_signal_reactors, check_apps)
review_signal_work_terminal = _review_signal_work_terminal(review_signal_attribution)

review_blocking = (a.get("review_in_progress")
                   and not a.get("review_signal_work_terminal")
                   and a.get("quiet_seconds", 0) < REVIEW_INPROGRESS_MAX_WAIT)
```

Deterministic regression tests are in `tests/ce-babysit-pr-snapshot.test.ts` — search `eyes`, `attribution`, and `work terminal` — covering the terminal, running, none, and unknown legs, the duplicated-identity case, malformed payloads, the real paginated response shape, and the settle-clock reset.

Three cross-host model-behavior eval cells live in `tests/skill-eval-cell/catalog.ts` under the ids `ce-babysit-pr/eyes-finished-work-clears-the-floor`, `ce-babysit-pr/eyes-finished-unrelated-work-still-waits`, and `ce-babysit-pr/eyes-with-running-work-still-waits`, with fixtures under `tests/skill-eval-cell/fixtures/babysit-eyes-work-*`.

The split is deliberate. Whether the attribution math is right — identity sets, terminal grouping, change-signature inclusion — has one correct answer and belongs in `bun test`. Whether the agent correctly judges "this review landed" against "this reactor's checks finished but nothing represents the review it announced" is a judgment call, so it is a model eval, not a CI gate.

## Related

- [Watch-loop skills need a bounded blocked-external handback for fork-PR CI approval gates](watch-loops-need-a-blocked-external-terminal-state.md) — the same engine and the same remedy shape (read a second independent source and fold it into the computation), applied to the opposite failure. There a *missing* signal produced a false green; here a *stale* signal produced a false delay. Both are the watch loop inheriting one API's blind spot.
