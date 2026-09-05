---
title: "Git workflow skills need explicit state machines for branch, push, and PR state"
category: skill-design
date: 2026-03-27
last_refreshed: 2026-07-12
module: skills/ce-commit and ce-commit-push-pr
problem_type: architecture_pattern
component: tooling
symptoms:
  - Detached HEAD could fall through to invalid push or PR paths
  - Untracked-only work could be misclassified as a clean working tree
  - PR detection could select the wrong PR or mis-handle the no-PR case
  - Default-branch flows could attempt invalid "open a PR from the default branch" behavior
root_cause: missing_workflow_step
resolution_type: workflow_improvement
severity: high
tags:
  - git-workflows
  - skill-design
  - state-machine
  - detached-head
  - gh-cli
  - pr-detection
  - default-branch
---

# Git workflow skills need explicit state machines for branch, push, and PR state

## Problem

`ce-commit` and `ce-commit-push-pr` accumulated branch-state and PR-state regressions because they described Git flow in prose instead of as explicit state checks. Git workflows look linear but are stateful along independent dimensions — detached HEAD, untracked files, upstream existence, default branch, existing PR — and every bug had the same shape: the skill observed one dimension once, then assumed it still held after a later transition. Each fix that added a branch to the prose tended to skip a checkpoint an earlier path had protected; the clean-working-tree shortcut was the worst, because it combines all five dimensions at once.

## Solution

Treat the skill as a small state machine: at each transition, run the command that answers the next question, then branch on that result instead of carrying state forward in prose. The current commands and their exit-status readings live in `skills/ce-commit-push-pr/references/context.md`; the transitions they must protect are:

1. **Cleanliness from `git status`, never `git diff HEAD`.** `git diff HEAD` is empty for untracked-only work, which is one of the most common commit cases.
2. **Re-read branch state after every branch-changing transition.** A `git branch --show-current` captured before `git checkout -b` is stale (and empty on detached HEAD); run it again at the moment of decision. The second read converts "the skill thinks it created branch X" into "Git says the current branch is X."
3. **Upstream existence before unpushed-commit checks.** An error from `git log @{u}..HEAD` on a branch with no upstream is not "nothing to push"; that branch needs its first push.
4. **PR detection reads exit status as state** (tradeoff below).
5. **Default-branch safety ahead of every push/PR transition**, including the clean-tree-but-unpushed-commits shortcut. In `ce-commit-push-pr`, declining feature-branch creation on the default branch is a stop condition, not a continue — otherwise the flow pushes the default branch and then tries to open a PR from it to itself.

### The PR-detection tradeoff (§4)

Two commands answer "does this branch already have a PR?", and the choice regressed repeatedly until the tradeoff was written down:

- `gh pr view` is current-branch-aware, so it cannot pick up another fork's PR that shares a branch name — but it exits 1 on the normal no-PR state, conflating "no PR" with a real failure. That exit is also fatal if the check ever runs at skill load time (the always-loaded project instructions explain why load-time pre-resolution is banned).
- `gh pr list --head <branch> --state open` has clean semantics — exit 0 with `[]` = no PR; non-zero = `gh` missing, unauthenticated, or offline, so PR state is **unknown**, never "none" — but filters by branch *name* only, so in a multi-fork repo two owners' PRs can collide.

The skills keep `gh pr list` for the exit semantics and bound the collision: pass the branch name only (`--head` silently returns `[]` for `<owner>:<branch>`, which reads as "no PR" and opens a duplicate), target the base repo on a fork, skip the check on detached HEAD (an empty `--head` drops the filter and lists unrelated PRs), match the returned entry by `headRepositoryOwner`/`headRefName` rather than index 0, and re-verify immediately before `gh pr create`. Whatever a future edit picks, the point is that it is a genuine tradeoff, not a settled winner, and it stops regressing only when the caveat travels with the choice.

## Prevention

- Only skills that *own* Git/GitHub mechanics get a state machine. A delegating skill states the condition and lets the owner run the machine — see [skill-gates-state-conditions-not-prescribed-git-commands.md](skill-gates-state-conditions-not-prescribed-git-commands.md).
- Model expected non-zero CLI exits as state transitions, not failures; when a tool highlights non-zero exits, capture the exit code yourself so correct logic does not look broken to the user.
- Any change to one transition triggers a walkthrough of the adjacent states before the change is considered done: detached HEAD with uncommitted changes; detached HEAD with committed but unpushed work; untracked-only files; feature branch with no upstream; feature branch with upstream and no PR; feature branch with an existing PR; default branch with unpushed commits; non-`main` default branch names such as `develop` or `trunk`.

## Related

- [skill-gates-state-conditions-not-prescribed-git-commands.md](skill-gates-state-conditions-not-prescribed-git-commands.md) — the caller-side rule.
- [pass-paths-not-content-to-subagents.md](pass-paths-not-content-to-subagents.md)
