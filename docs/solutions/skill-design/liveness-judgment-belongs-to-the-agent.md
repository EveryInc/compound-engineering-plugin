---
title: "A liveness marker proves work started; judging whether it finished belongs to the agent"
category: skill-design
date: 2026-09-01
module: skills/ce-babysit-pr
problem_type: design_pattern
component: tooling
severity: medium
symptoms:
  - "ce-babysit-pr held green, mergeable PRs out of merge-ready for 15-30 minutes after every review had already finished"
  - "a detector modelling review liveness produced three consecutive review findings, all about its own state interactions"
applies_when:
  - "A watch loop reads a signal a third party sets — a reaction, a label, a status flag — to decide whether that party is still working"
  - "Deciding whether a deterministic detector or the agent should conclude that external work finished"
  - "A stale-signal workaround (a timeout or bound) is being extended or re-tuned instead of re-examined"
  - "Weighing whether to model a domain as engine state or leave it to agent judgment"
related_components:
  - development_workflow
  - tooling
---

## Context

`ce-babysit-pr` watches a pull request and calls it merge-ready once it is mergeable, green, and quiet. It treated an eyes reaction on the PR body as proof a review was underway, which skipped the ordinary settle window and imposed a much longer stale-review floor.

The assumption, stated in a code comment, was that a bot which adds the reaction removes it when done. Cursor's Security Agent never removes it. All 10 of the most recently merged PRs in this repository carried a permanent `cursor[bot]` reaction beside a completed, successful check run, so every one of them waited for a review that had already landed (issue #1606).

## Guidance

**A marker a third party sets is evidence that work started, never that it is still running, because nothing obliges them to clear it.** The mismatch is structural: the reaction is issue-scoped, created once for the whole PR, while the work it refers to is commit-scoped. No amount of timestamp reasoning recovers which head it meant, because it carries no commit binding at all.

So do not ask whether the marker is stale. Ask what that same party actually produced on the current head — a check run it owns, a review, a comment. That question is decidable by lookup, because the forge already partitions those by commit.

**Then let the agent answer it.** The first fix built the correlation into the engine: match a bot login to its app slug, group current-head check runs by app, emit a per-reactor work state, and release the readiness hold when none was still running. The correlation itself was sound and drew no review findings. The machinery *around* it produced three consecutive findings in one review cycle, every one about an interaction between the settle window, the work state, and the agent's re-arm — including a P1 where the engine shortened a window the agent had just widened, re-firing on evidence the agent had already rejected and looping the wake forever.

That is the tell from `model-the-domain`: a second boolean that must stay in sync with the first. The resolution was not a better state machine. It was removing the state, because the engine cannot hold the judgment the state was trying to encode — whether a finished check actually represents the review that was announced is a semantic question, and a detector that answers it will be wrong in exactly the cases that matter.

**Check the population before building the mechanism.** Measured across two organizations with different automation: the bots that use the eyes convention finish in 4 to 6 minutes, against a 5-minute settle window, so the machinery bought about a minute. The genuinely slow reviewer — median 7.8 minutes, p90 21.6 minutes across 157 reviews — does not use the convention at all. The mechanism was calibrated for a population that does not exist: slow reviewers that announce themselves. The ones that announce are fast, and the one that is slow stays silent.

## Why This Matters

A timeout is what you reach for when a third party's completion is unobservable. It is worth checking whether that is actually true — here it was observable through an endpoint the detector was not reading. But it is equally worth checking whether the thing you are about to model is load-bearing at all. Both fixes closed the reported bug; only one of them left less code than it found.

The durable split: the engine reports what is observable and cheap to establish, and the agent decides what those observations mean. An engine that concludes "the review finished" has taken on a judgment it cannot defend, and every case it gets wrong becomes another branch.

## When to Apply

Any deterministic component about to encode "has this external party finished." Report the evidence — what exists, what is still running, what concluded and how — and let the reasoning layer draw the conclusion. Reach for engine state only when the answer is mechanical and the component can defend it in every case it will meet.

## Examples

Before, the whole signal was presence, and the readiness gate consumed it directly:

```python
review_signal_identities = fetch_eyes_reactors(...)
review_in_progress = len(review_signal_identities) > 0
...
review_blocking = a.get("review_in_progress") and a.get("quiet_seconds", 0) < REVIEW_INPROGRESS_MAX_WAIT
```

After, the engine reports quiet and nothing more, and `skills/ce-babysit-pr/references/settle.md` hands the agent the goal:

> A reviewer that announces itself has told you it **started**. Nothing obliges it to retract that when it finishes, so a standing announcement is not evidence that work continues. Look instead for what that same reviewer produced on this head, and ask whether it accounts for the review it announced. Something carrying that reviewer's verdict having reached a terminal conclusion means it stopped: say which, and never read a timeout or a skip as approval. Output that does not account for the announced review leaves the review outstanding: an unrelated check from the same app finishing while its review has not appeared is not the review finishing.

Ownership of the check is not the test — an app can finish an unrelated check while the review it announced has not started. The first draft of this condition said any terminal check from the announcing app proved the reviewer stopped, and review caught it before it shipped.

The engine kept the parts it can defend: that the PR went quiet, and for how long.

## Related

- [Watch-loop skills need a bounded blocked-external handback for fork-PR CI approval gates](watch-loops-need-a-blocked-external-terminal-state.md) — the same engine reading a single external signal as the whole picture, in the opposite direction: there a *missing* signal produced a false green, here a *stale* one produced a false delay.
