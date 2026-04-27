---
title: "Stale local base contamination in multi-session branch creation"
category: workflow
date: 2026-04-27
created: 2026-04-27
severity: medium
component: ce-commit-push-pr
problem_type: workflow_issue
tags:
  - branching
  - multi-agent
  - multi-session
  - pre-push
  - stacked-prs
  - contamination
---

# Stale local base contamination in multi-session branch creation

## Problem

When multiple agent sessions (Claude Code, Cursor, Codex, plus any humans) share one local clone, local `<default-branch>` can drift relative to its remote counterpart. Two specific drifts cause downstream pain:

1. **Local default behind remote.** Another session pushed and merged work; this session's local `main` doesn't know yet.
2. **Local default ahead of remote with unpushed work.** Another session committed locally to `main`, or merged a feature branch into local `main`, before pushing — and never pushed those commits to `origin/main`.

When a session creates a feature branch from local `main` while drift type 2 holds, the new branch silently inherits the unpushed work. The eventual PR opens looking clean to the originating session but appears contaminated on GitHub. Resolving it requires force-push surgery during PR review.

This came in as [issue #707](https://github.com/EveryInc/compound-engineering-plugin/issues/707).

## Why post-facto detection is the wrong tool

The intuitive fix is to detect the contamination before pushing or before opening a PR. Two detection approaches were considered and rejected:

### Approach A: surface foreign commit authors

Read `git log <base>..HEAD --pretty=format:'%h %ae %s'` and warn when any commit's author email differs from `git config user.email`.

Catches the cross-author case (cherry-picks, teammate-authored work) but misses the dominant scenario: multi-agent setups where every session uses the same `user.email`. The check fires on intentional cherry-picks and stays silent on the actual contamination pattern.

### Approach B: cross-branch reachability

For each commit in `<base>..HEAD`, check whether it is reachable from any other `origin/*` ref. If yes, treat as suspect.

Authorship-agnostic, so it catches same-user contamination. But the signal it measures — "this commit is on another remote branch" — is the **defining characteristic** of stacked-PR workflows, where parent commits in the stack are intentionally shared with sibling branches. Tools like Graphite and git-spice rely on this. With GitHub-native stacked PRs moving toward general availability and likely broad adoption, the false-positive rate moves from "narrow population" to "majority of pushes for sophisticated users." The check would invert from useful signal to default noise.

You can patch around it (parse stack metadata from PR base refs) but the patches multiply with every adjacent workflow (first push before PR exists, multi-level stacks, fork-based stacks). Each patch is a heuristic that will be wrong somewhere.

## Solution

Prevent at branch creation rather than detect at push or PR time.

`ce-commit-push-pr` Step 4 — the branch-creation path used when the user invokes the skill while on the default branch with working-tree changes — was changed from:

```bash
git checkout -b <branch-name>
```

to:

```bash
git fetch --no-tags origin <base>
git checkout -b <branch-name> origin/<base>
```

with a graceful fallback to the local-base form when the fetch fails (offline, restricted network, expired auth). The fallback is documented to the user so they know base freshness was not verified.

This makes the skill's branch-creation path safe by construction:

- Drift type 1 (local behind remote): the new branch starts at fresh remote `<base>`, not stale local `<base>`.
- Drift type 2 (local ahead of remote with unpushed work): unpushed local commits stay on local `<base>` (recoverable via reflog or branch ref); the new feature branch starts clean.

The principle generalizes cleanly to stacked PRs: when a user wants to stack on top of an open PR, the same `git fetch && git checkout -b <name> origin/<parent>` pattern works — `<parent>` is just a different ref. Nothing about prevention depends on detecting "is this commit suspicious."

## What this does not cover

- **Branches created outside the skill.** Users who run `git checkout -b` manually, or whose IDE creates branches without fetching, can still produce contaminated branches. The skill's path becomes safe; the user's general workflow is not. A pre-push hook (which the original reporter installed) covers this case — opt-in hooks remain a reasonable user-side mitigation.
- **Already-contaminated branches.** Once a branch carries foreign commits, this change does nothing for it. Recovery is still manual: identify the foreign commits, drop them via interactive rebase or `git reset` to a clean base, force-push.
- **Step 1 branch-creation paths with different semantics.** When the user is on the default branch with unpushed commits and asks to create a feature branch to "rescue" those commits, the desired behavior is to carry the local commits onto the new branch — opposite of the Step 4 case. Step 1's behavior is unchanged.

## User-side mitigations

For workflows where branch creation happens outside the skill, recommend:

- `git switch -c <name> origin/<base>` instead of `git checkout -b <name> <base>`
- A `git config --global alias.nb '!f() { git fetch origin "${2:-main}" && git switch -c "$1" "origin/${2:-main}"; }; f'` style alias
- An opt-in pre-push hook that compares HEAD's parent chain against `origin/<base>` for unexpected commits — useful for individual users, but not shipped from this plugin because the cost of getting stacked-PR semantics right in a hook outweighs the benefit at the plugin level

## Why we did not ship a detection check at all

The reporter framed their issue as "a pattern, not a request for a merge." Taking that at its word and acting on the structural signal — a real failure mode worth a permanent fix — produced this outcome:

- One small preventive change in the skill that is safe by construction
- A documented pattern with rationale for future readers
- No behavioral prompt added to a heavy-traffic skill
- No detection heuristic that risks being obsoleted by stacked PRs

A detection check at push or PR time was not free even when scoped tightly: it adds a prompt to a frictionless workflow, false-positives on legitimate workflows that share commits across branches, and would require ongoing tuning as stacked-PR conventions evolve. Prevention at the right layer avoids all of that.
