# `ce-clean-gone-branches`

> Delete local branches whose remote tracking branch has been deleted, including any associated worktrees.

`ce-clean-gone-branches` is the **branch-hygiene** skill. After PRs merge upstream, the remote tracking branches go away — but the local branches stick around indefinitely, cluttering `git branch` and inflating `git fetch` time. This skill discovers those orphaned local branches via `git fetch --prune` + `git branch -vv` parsing, presents the list, asks for confirmation, then deletes them — including any associated worktrees.

A simple, high-frequency utility. Run it whenever your branch list feels noisy.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Discovers local branches whose remote tracking branch is `: gone]`, then deletes them on confirmation (worktrees first, then branches) |
| When to use it | "Clean up branches", "delete gone branches", "prune local branches" — periodic branch-list hygiene |
| What it produces | Removed worktrees, deleted local branches; nothing committed |
| Scope | Yes-or-no on the entire list — no per-branch picking |

---

## The Problem

After PRs merge, local branches accumulate:

- **`git branch` becomes noisy** — 30+ local branches, most representing already-shipped work
- **`git fetch` and tab-completion get slower** — more refs to enumerate
- **Worktrees orphan** — worktrees attached to long-merged branches keep their disk space and tooling overhead
- **Manual cleanup is tedious** — `git branch -vv | grep gone` then `git branch -D` for each one, with worktree handling layered on top
- **Auto-generated worktree names** like `worktree-jolly-beaming-raven` make it unclear which orphans belong to what

## The Solution

`ce-clean-gone-branches` runs cleanup in three stages:

- **Discovery** — `git fetch --prune` to refresh remote state, then parse `git branch -vv` for `: gone]` markers
- **Confirmation** — show the full list, ask yes-or-no on the entire list (no per-branch picking)
- **Deletion** — for each branch, remove its worktree first if one exists, then `git branch -D`

A simple all-or-nothing decision keeps the skill fast. If you only want some branches gone, decline and use `git branch -D` directly for the ones you actually want.

---

## What Makes It Novel

### 1. Discovery via `git fetch --prune` + `: gone]` parsing

The skill runs `git fetch --prune` first to refresh local knowledge of remote state, then parses `git branch -vv` for branches whose tracking branch shows `: gone]` — the canonical signal that the remote branch was deleted. Without the prune, local refs would still believe stale remote branches exist; the skill never relies on the user having pruned recently.

### 2. Worktree-aware cleanup

For each branch slated for deletion, the skill checks `git worktree list` for an associated worktree. If one exists and isn't the main repo root, it's removed first via `git worktree remove --force` before the branch itself is deleted. This avoids the "cannot delete branch — checked out in worktree" error that bare `git branch -D` would hit.

### 3. All-or-nothing confirmation

The user sees the full list and answers yes or no on the entire list. The skill **doesn't** offer multi-select or per-branch choices. Two reasons:

- The list is usually small (5-20 branches); the cost of seeing them all and saying "yes" is low
- A multi-select adds UI overhead that doesn't pay off for a routine cleanup task

If the user wants finer control, declining and running `git branch -D <specific-branch>` is fast.

### 4. Reports as it goes

While deleting, the skill prints each action — "Removed worktree: ...", "Deleted branch: ..." — so the user sees progress in real time. Final summary names the count.

---

## Quick Example

You haven't cleaned local branches in a while. You invoke `/ce-clean-gone-branches`.

The skill runs `bash scripts/clean-gone`, which fetches with prune and parses `git branch -vv`. Output: 5 gone branches.

```text
These local branches have been deleted from the remote:

  - feat/notification-mute
  - fix/auth-redirect
  - refactor/extract-service
  - chore/upgrade-deps
  - experiment/new-clustering

Delete all of them? (y/n)
```

You answer yes. The skill processes each:

- `feat/notification-mute` has a worktree at `.worktrees/feat-notification-mute`. Remove worktree first: ✓. Delete branch: ✓.
- `fix/auth-redirect` no worktree. Delete branch: ✓.
- ...

Final summary:

```text
Removed worktree: .worktrees/feat-notification-mute
Deleted branch: feat/notification-mute
Deleted branch: fix/auth-redirect
Deleted branch: refactor/extract-service
Deleted branch: chore/upgrade-deps
Deleted branch: experiment/new-clustering

Cleaned up 5 branches.
```

---

## When to Reach For It

Reach for `ce-clean-gone-branches` when:

- Your `git branch` list is getting noisy after several PRs have merged
- You're noticing worktrees lingering for branches you no longer remember
- It's been a while since you cleaned up; periodic hygiene is overdue

Skip `ce-clean-gone-branches` when:

- You want to delete only specific branches → `git branch -D <name>` directly
- You want to keep a local branch even though remote is gone → decline the prompt
- You're not on a working copy with a remote configured → the skill needs a remote to compare against

---

## Use as Part of the Workflow

`ce-clean-gone-branches` is mostly standalone — it doesn't sit inside the chain. It's invoked when:

- Several PRs have merged and the user wants to tidy local state
- Worktree creation is failing because of orphaned worktrees on dead branches
- The user is preparing to start a new line of work and wants a clean slate

---

## Use Standalone

Direct invocation with no arguments:

- `/ce-clean-gone-branches`

The skill discovers, asks, and deletes. No flags, no selection — just yes or no on the full list.

---

## Reference

| Step | Action |
|------|--------|
| 1 | Run `bash scripts/clean-gone` (fetches with prune, parses for `: gone]`) |
| 2 | Present the list of stale branches; ask yes/no on the entire list |
| 3 | For each confirmed branch: remove worktree if present, then `git branch -D` |
| 4 | Report results as deletions happen; final summary with count |

If the script outputs `__NONE__`, the skill reports that no stale branches were found and stops.

---

## FAQ

**What's a "gone" branch?**
A local branch whose remote tracking branch was deleted upstream (typically because the PR merged and GitHub deleted the source branch). `git branch -vv` shows `: gone]` next to such branches.

**Why all-or-nothing instead of per-branch picking?**
Because the list is usually small and reviewing them all takes seconds. A multi-select UI adds friction for a high-frequency task. If you need surgical control, decline and use `git branch -D <name>` for specific branches.

**Why does it remove the worktree before deleting the branch?**
Because `git branch -D` on a checked-out branch (in a worktree) fails. The skill removes the worktree first to avoid that error.

**What if a worktree has uncommitted changes?**
`--force` is used on `git worktree remove`, so uncommitted changes are discarded. If the branch has been "gone" (merged remotely and deleted), you almost certainly don't want lingering uncommitted changes there. If you do, decline the prompt and handle that worktree manually first.

**What if the script fails or returns no branches?**
If no gone branches exist, the skill stops cleanly and reports "no stale branches found." If the script itself errors, the skill surfaces the error.

---

## See Also

- [`/ce-worktree`](./ce-worktree.md) — sibling skill for worktree creation; this skill cleans up after worktrees become orphaned
