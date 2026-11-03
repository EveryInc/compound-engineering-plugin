---
title: "GitHub's merge status stays usable after the base moves, even when its test merge looks stale"
category: skill-design
date: 2026-11-02
module: skills/ce-babysit-pr
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - "Deciding whether a PR's CLEAN or MERGEABLE result can be trusted after its base branch moved"
  - "Adding a wait, clock, or conflict check to a skill that polls GitHub merge state"
  - "Filtering statusCheckRollup failures to decide which check runs still count"
tags:
  - ce-babysit-pr
  - watch-loop
  - merge-state
  - github-api
  - settle-window
related_components:
  - development_workflow
---

# GitHub's merge status stays usable after the base moves, even when its test merge looks stale

## Context

When `main` moves, GitHub can leave `potentialMergeCommit` parented on the old base for 20 minutes or more while `mergeStateStatus` stays `CLEAN`. `ce-babysit-pr` read that as "the merge result is unproven" and made agents wait. It first waited for a fixed time, then for a time keyed on head plus base tip. On a repo where `main` moves more often than the window, the wait never finished: a regular PR with nothing wrong was still not ready after 25 minutes (PR #1988).

## Guidance

**Don't wait for GitHub to refresh its test merge.** Treat a test merge that only lags the base as usable, and disclose it in the report.

These results came from probes on `tmchow/test-repo` on 2026-11-02. Each PR's test merge was on an old base or still being computed, and the probe pushed a real conflict to `main`:

| Unread time after the conflict | First read | Next read |
|---|---|---|
| About 5 seconds, while polling | `UNKNOWN` | `DIRTY` |
| 60 seconds | `UNKNOWN` | `DIRTY` |
| 120 seconds | `UNKNOWN` | `DIRTY` |
| 240 seconds | `UNKNOWN` | `DIRTY` |

No read showed a stale `CLEAN` after a conflict, and `UNKNOWN` already blocks readiness. So `potentialMergeCommit` lagging does not mean `mergeStateStatus` is stale. This is four samples on one small repo. GitHub also rechecks when the merge is attempted.

**Keep base movement out of every clock.** `mergeability-pending` and `UNKNOWN` appear briefly each time GitHub recomputes after a push to `main`, so counting them as activity restarts the quiet window just as counting the base tip does.

**Alternatives rejected:**

- **A fixed wait.** It adds time per head and nothing wakes the agent on a host that only wakes on PR events. A Codex run on T3 sat idle for about 11 minutes on this wait.
- **A file-overlap check before trusting a lagging test merge.** The probes gave it nothing to catch.
- **Filtering `statusCheckRollup` by run order.** The rollup lists every run of a check on a head, including replaced ones. A filter took five review rounds, each finding a real hole: same-named jobs, re-runs of older runs, jobs cancelled before starting. Following `CLEAN` for the same head replaced it.

**Known cost of following `CLEAN`:** GitHub still reported `CLEAN`, with rollup state `SUCCESS`, more than a minute after an older run was re-run and failed once a newer run had passed, while `gh pr checks` listed it as failed (`tmchow/test-repo` PR #39). The snapshot follows GitHub here.

## When to Apply

Revisit this if a stale `CLEAN` is ever observed after a real conflict, or on a repo with merge queues or required up-to-date branches, which these probes did not cover. A new sample is a better starting point than restoring a wait.

Related: `docs/solutions/skill-design/watch-loops-need-a-blocked-external-terminal-state.md`.
