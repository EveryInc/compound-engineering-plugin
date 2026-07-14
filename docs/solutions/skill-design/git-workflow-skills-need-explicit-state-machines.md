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

The `ce-commit` and `ce-commit-push-pr` skills had accumulated branch-state and PR-state bugs because they described Git flow in broad prose instead of modeling the workflow as a sequence of explicit state checks. Small wording changes kept introducing regressions around detached HEAD, untracked files, upstream detection, default-branch pushes, and PR lookup.

## Symptoms

- `git push -u origin HEAD` could be reached from detached HEAD, where Git rejects the push because `HEAD` is not a branch ref
- A repo with only untracked files could be treated as "nothing changed" because `git diff HEAD` is empty for untracked files
- A no-PR branch could trigger an error path that looked like a fatal failure instead of an expected "no PR for this branch" state
- `gh pr list --head "<branch>"` could match an unrelated PR from another fork with the same branch name
- Clean-working-tree flows on the default branch could push default-branch commits and then try to open a PR from the default branch to itself

## What Didn't Work

- Using a single early `git branch --show-current` result and referring back to it later. Once the workflow creates a branch, the earlier value is stale.
- Using `git diff HEAD` as the definition of "has changes." It does not account for untracked files.
- Treating every non-zero exit from a PR-detection command as a fatal failure. "No PR for this branch" is often a normal branch state.
- Flip-flopping between `gh pr view` and `gh pr list` without writing down the tradeoff. `gh pr view` is current-branch-aware but exits 1 on the normal no-PR state; `gh pr list --head <branch>` has clean exit-0-`[]` = "no PR" semantics but filters by branch name only. The fix is not to pick one silently — it is to document the tradeoff and the branch-name-collision caveat (see §4) so the choice stops regressing.
- Adding a "clean working tree" fast path before re-checking whether the current branch was still the default branch. That let the workflow skip the feature-branch safety gate and head straight toward invalid push/PR transitions.

## Solution

Treat the skill as a small state machine. For each transition, run the command that answers the next question directly, then branch on that result instead of carrying state forward in prose.

### 1. Use `git status` as the source of truth for working-tree cleanliness

Use the `git status` result from Step 1 to decide whether the tree is clean. This covers staged, modified, and untracked files.

```text
Clean working tree:
- no staged files
- no modified files
- no untracked files
```

Do not use `git diff HEAD` as the cleanliness check.

### 2. Re-read branch state after every branch-changing transition

When the workflow starts in detached HEAD:

```bash
git branch --show-current
git checkout -b <branch-name>
git branch --show-current
```

In `ce-commit-push-pr`, create that branch automatically: the user invoked a commit/push/PR workflow, and later push/PR steps require a branch-backed ref. The second `git branch --show-current` is not redundant. It converts "the skill thinks it created branch X" into "Git says the current branch is X."

Apply the same pattern before default-branch safety checks:

```bash
git branch --show-current
```

Run it again at the moment the decision is needed. Do not rely on a branch value captured earlier in the workflow.

### 3. Split "upstream exists" from "there are unpushed commits"

Check upstream existence first:

```bash
git rev-parse --abbrev-ref --symbolic-full-name @{u}
```

Only if that succeeds, check for unpushed commits:

```bash
git log <upstream>..HEAD --oneline
```

This avoids conflating "no upstream configured yet" with "nothing to push."

### 4. Detect an existing PR with `gh pr list`, and read its exit status as state

For "does this branch already have a PR?" use a command that separates "no PR" from "lookup failed":

```bash
gh pr list --head <branch> --state open --json number,url,title,body,state,headRefName,headRepositoryOwner
```

Interpret the result as a state check:

- Exit 0 with `[]` -> no open PR for this branch (proceed to creation)
- Exit 0 with entries -> a PR exists; pick the entry whose `headRepositoryOwner`/`headRefName` match the current head, not index 0. If several entries share the branch name from different owners and none is confirmably yours, treat it as ambiguous and stop rather than act on someone else's PR
- Non-zero exit -> `gh` is missing, unauthenticated, or offline: PR state is **unknown**, never "no PR". Resolve auth/connectivity before creating, so a lookup failure cannot cause a duplicate PR.

Pass the branch **name only** — `gh pr list --head` does not accept `<owner>:<branch>` syntax (it silently returns `[]` for it, which reads as "no PR" and opens a duplicate). On a fork checkout the PR lives on the base repo, so target the base via `gh`'s default-repo resolution or `-R <base-owner>/<repo>`. Skip this check entirely on detached HEAD (empty branch): `gh pr list` with an empty `--head` drops the filter and lists unrelated PRs.

**Known tradeoff (branch-name collision).** `gh pr list --head <branch>` filters by head-branch *name*, so in a busy multi-fork repo two open PRs from different owners can share a branch name, and this command cannot disambiguate them the way `gh pr view` (current-branch-aware) can. It is chosen anyway for its clean exit semantics: `gh pr view` exits 1 on the normal no-PR state, conflating "no PR" with a real failure — harder to interpret, and fatal if the check ever runs at skill *load* time (see [no-load-time-pre-resolution-for-fallible-context.md](no-load-time-pre-resolution-for-fallible-context.md)). Bound the collision by re-verifying immediately before `gh pr create` and inspecting the returned entry rather than assuming the first match is yours.

### 5. Keep the default-branch safety gate ahead of push/PR transitions

If the current branch is `main`, `master`, or the resolved default branch, and the workflow is about to push or create a PR:

- create a feature branch first and re-read the branch name
- ask only when unpushed local commits create a real carry-forward decision, such as preserving them on the feature branch vs starting from the fresh remote base
- if the safe branch transition cannot be completed in `ce-commit-push-pr`, stop rather than trying to open a PR from the default branch

This prevents "push default branch, then attempt impossible PR flow" behavior.

## Why This Works

Git workflows look linear in prose but are actually stateful. Detached HEAD, missing upstreams, untracked files, and existing-vs-missing PRs are all separate dimensions of state. The bug pattern was always the same: the skill would observe one dimension once, then assume it remained true after a later transition.

The fix is not more prose. The fix is explicit re-checks at each transition boundary:

- branch state after branch creation
- cleanliness from `git status`, not a partial diff
- upstream existence before unpushed-commit checks
- PR existence via `gh pr list --head <branch>`, reading exit-0-`[]` = none vs non-zero = unknown (with the branch-name-collision caveat in §4)
- default-branch safety before any push/PR transition

This turns a brittle narrative into a deterministic control flow with a small number of clear state transitions.

## Edge Cases We Hit While Fixing This

These were not hypothetical concerns. Each one showed up while revising `ce-commit` and `ce-commit-push-pr`, and several "fixes" introduced a new bug one step later in the flow.

### 1. Detached HEAD can reappear as a later bug even after it seems "handled"

An early version only guarded detached HEAD in the PR-detection step. That looked fine until the workflow added a "clean working tree" shortcut before PR detection. In detached HEAD with committed local work, that shortcut could jump directly to push logic and hit:

```bash
git push -u origin HEAD
```

which fails because detached HEAD is not a branch ref.

Learning: detached HEAD must be handled before any later shortcut can skip around it.

### 2. Creating a branch is not enough; the skill must re-read which branch Git says is current

Another revision created a branch from detached HEAD but still described later steps as using "the branch name from Step 1." If Step 1 originally ran in detached HEAD, that earlier branch value was empty. Later PR detection could still use the stale empty value.

Learning: after `git checkout -b <branch-name>`, run `git branch --show-current` again and treat that output as the only trusted branch name.

### 3. Bare branch-name PR lookup fixed one problem and created another

We switched from `gh pr view` to:

```bash
gh pr list --head "<branch>" --json url,title,state --jq '.[0] // empty'
```

because `gh pr view` was surfacing a non-zero exit when no PR existed. That improved the no-PR path, but it introduced a correctness problem: `gh pr list --head` matches on branch name only, and GitHub CLI does not support `<owner>:<branch>` syntax for that flag. In a multi-fork repo, another person's PR can reuse the same branch name.

Learning: this is a genuine tradeoff, not a settled winner. The skills ultimately kept `gh pr list --head <branch> --state open` for its clean exit semantics (exit-0-`[]` = no PR vs non-zero = unknown) — which also matters because `gh pr view`'s exit-1-on-no-PR is fatal if the check ever runs at skill *load* time — and bound the branch-name collision by targeting the base repo and re-verifying before `gh pr create` (see §4). Whatever you pick, write the tradeoff down so it stops regressing.

### 4. "No PR" is not an error in the workflow, even if the CLI exits non-zero

The original reason for changing away from `gh pr view` was that a branch with no PR looked like a command failure. But for this workflow, "no PR yet" is often the expected state and should lead to creation logic, not stop the skill.

Learning: document expected non-zero exits as state transitions, not generic failures.

### 5. `git diff HEAD` misses one of the most common commit cases: untracked files

At one point the skill used `git diff HEAD` to decide whether work existed. In a repo with only a newly created file, `git diff HEAD` is empty even though `git status` shows `?? file`.

Learning: untracked-only work is a first-class case. Use `git status` as the cleanliness check.

### 6. "No upstream" and "nothing to push" are different states

An early shortcut treated an error from `git log @{u}..HEAD` as "nothing to push." That is wrong on a new feature branch with local commits but no upstream yet. The branch still needs its first push.

Learning: first check whether an upstream exists, then check whether there are unpushed commits.

### 7. Default-branch safety can be bypassed by a convenience shortcut

Another revision added a clean-working-tree shortcut that said "if there are unpushed commits, skip commit and continue to push." That worked on feature branches but accidentally skipped the normal "don't work directly on main/default branch" safety gate. The result was: push default-branch commits, then head toward PR creation.

Learning: every path that can lead to push or PR creation must pass through a default-branch safety check.

### 8. Declining feature-branch creation on the default branch must stop the PR workflow

One fix asked the user whether to create a feature branch first when clean-tree logic found unpushed default-branch commits. But if the user declined, the workflow still continued to push and then attempt PR creation. That leads to an impossible "open a PR from the default branch to itself" situation.

Learning: in `ce-commit-push-pr`, declining feature-branch creation on the default branch is a stop condition, not a continue condition.

### 9. Clean-working-tree shortcuts interact with branch safety, PR state, and upstream state all at once

The hardest bugs came from the "no local edits, but there may still be work to do" path. That single branch of logic had to answer all of these:

- Is the current branch detached?
- Is the current branch the default branch?
- Does the branch have an upstream?
- Are there unpushed commits?
- Does a PR already exist?

Missing any one of those checks produced a new bug.

Learning: clean-working-tree shortcuts are the highest-risk part of Git workflow skills because they combine the most state dimensions at once.

### 10. Git workflow skills are unusually prone to whack-a-mole regressions

The meta-pattern across all these fixes was:

1. Improve one failure mode
2. Reveal that another state transition was only implicitly modeled
3. Add a new branch in the prose
4. Discover that the new branch skipped a previously safe checkpoint

Learning: these skills should be designed and reviewed like tiny state machines, not as narrative instructions. Any change to one state transition should trigger a walkthrough of all adjacent states before considering the skill fixed.

## Prevention

- For Git/GitHub skills, treat workflow design as a state machine, not as a linear checklist.
- Re-run the command that answers the current question at the point of decision. Do not rely on values gathered earlier if a mutating command may have changed them.
- Use `git status` for "is there local work?" and reserve `git diff` for describing content, not determining whether work exists.
- Model expected non-zero CLI exits explicitly when they represent state, such as `gh pr view` on a branch with no PR.
- When a tool visually highlights non-zero exits as failures, capture the exit code yourself for expected state probes so correct logic does not still look broken to the user.
- Know the PR-detection tradeoff and document your choice. `gh pr list --head <branch>` has clean exit semantics (exit-0-`[]` = no PR, non-zero = unknown) but filters by branch name only; `gh pr view` is current-branch-aware but exits 1 on the normal no-PR state (and is fatal at skill load time). The current skills use `gh pr list` — base-repo-targeted, branch name only — and bound the multi-fork branch-name collision by re-verifying before `gh pr create`.
- Keep default-branch safety checks in every path that can lead to push or PR creation, including "clean working tree but unpushed commits" shortcuts.
- When editing skill logic, manually walk these cases before considering the change complete:
  - detached HEAD with uncommitted changes
  - detached HEAD with committed but unpushed work
  - untracked-only files
  - feature branch with no upstream
  - feature branch with upstream and no PR
  - feature branch with upstream and an existing PR
  - default branch with unpushed commits
  - non-`main` default branch names such as `develop` or `trunk`

## Related Issues

- [no-load-time-pre-resolution-for-fallible-context.md](no-load-time-pre-resolution-for-fallible-context.md) — why the PR check moved to `gh pr list` and out of load-time pre-resolution; the source of the current §4 decision.
- [script-first-skill-architecture.md](script-first-skill-architecture.md)
- [pass-paths-not-content-to-subagents.md](pass-paths-not-content-to-subagents.md)
