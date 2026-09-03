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
  - stacked-prs
  - contamination
---

# Stale local base contamination in multi-session branch creation

## Problem

When multiple agent sessions share one local clone, local `<default-branch>` drifts from its remote in two ways: behind (another session pushed and merged), or ahead with unpushed work (another session committed or merged locally to `main` and never pushed). A feature branch created from local `main` under the second drift silently inherits the unpushed work; the PR looks clean to the originating session and contaminated on GitHub, and cleanup is force-push surgery during review. Reported as [issue #707](https://github.com/EveryInc/compound-engineering-plugin/issues/707).

The fix is prevention at branch creation, owned by `skills/ce-commit-push-pr/references/branch-creation.md`: fetch `origin/<base>`, and when `origin/<base>..HEAD` is non-empty ask whether to carry those commits onto the new branch or leave them on local `<base>`. This doc records why detection was rejected.

## Why post-facto detection is the wrong tool

Two detection approaches at push or PR time were considered and rejected:

**Surface foreign commit authors** (`git log <base>..HEAD` with author email != `git config user.email`). Catches cross-author cases (cherry-picks, teammate work) but misses the dominant scenario: multi-agent setups where every session uses the same `user.email`. It fires on intentional cherry-picks and stays silent on the actual contamination pattern.

**Cross-branch reachability** (a commit in `<base>..HEAD` reachable from another `origin/*` ref is suspect). Authorship-agnostic, so it catches same-user contamination -- but "this commit is on another remote branch" is the **defining characteristic** of stacked-PR workflows (Graphite, git-spice, GitHub-native stacks), where parent commits are intentionally shared with sibling branches. As stacking spreads, the false-positive rate moves from a narrow population to the majority of pushes for sophisticated users. Patching around it (parsing stack metadata from PR base refs) multiplies with every adjacent workflow -- first push before a PR exists, multi-level stacks, fork-based stacks -- and each patch is a heuristic that is wrong somewhere.

A detection check is also not free even when scoped tightly: it adds a prompt to a frictionless high-traffic path and needs ongoing tuning as stacking conventions evolve. Prevention at branch creation is safe by construction and needs neither: nothing about it depends on deciding whether a commit is "suspicious," and it generalizes to stacking (branch from `origin/<parent>` instead of `origin/<base>`).

## What this does not cover

- Branches created outside the skill (manual `git checkout -b`, IDE branch creation without a fetch). The skill's path is safe; the user's general workflow is not. An opt-in user-side pre-push hook remains reasonable for individuals but is not shipped from the plugin, because getting stacked-PR semantics right in a hook costs more than it is worth at the plugin level.
- Already-contaminated branches. Recovery is manual: identify the foreign commits, drop them via rebase or `git reset` to a clean base, force-push.
- The Step 1 "rescue" path, where the user is on the default branch with unpushed commits and wants a feature branch that *carries* them -- the opposite intent, and unchanged.
