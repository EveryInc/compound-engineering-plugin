# `ce-worktree`

> Put the work in an isolated git worktree without disturbing the current checkout.

`ce-worktree` is the **isolation** skill. It is a git-workflow tool, not a core-loop step. Most coding harnesses already create a worktree at session start, so the common case is that you are already isolated. The skill checks that first, prefers the harness's own worktree tool, and only then falls back to plain `git worktree add`.

Nesting a worktree inside another one, or creating one the harness cannot see, is worse than working where you already are.

There is no bundled script. The agent runs inline git from the project directory, so the same instructions work on Claude Code, Codex, Gemini, OpenCode, and Pi.

Two modes:

- **New work** (default). No ref named. Create a fresh branch from trunk.
- **Attach.** You name a branch, PR, or commit. Check that ref out in a worktree instead of creating a new branch.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Makes sure isolation exists. Detects an existing worktree, prefers the harness tool, else `git worktree add` under `.worktrees/<branch>` |
| When to use it | Starting work that should stay off the current checkout, or when `ce-work` / `ce-code-review` offers a worktree |
| What it produces | Either "already isolated, work here" or a new isolated worktree, with path and branch reported |
| Skip when | Single-task work that fits on a branch in the current checkout |

---

## Example invocations

Empty or a work description is **create**. `isolate` plus a ref is **attach**. If this checkout is already a linked worktree, every form works in place rather than nesting.

```text
# New work. Detect isolation first. If none, create .worktrees/<named-branch> from trunk.
/ce-worktree for the account-notifications feature

# Already isolated (common in Orca or Cursor): report path and branch, stay here
/ce-worktree

# Attach a worktree to an existing branch. Does not create a second checkout of that branch.
/ce-worktree isolate feature/account-notifications

# Attach a worktree to a PR head on a local pr-1234 branch (so later commits can push back)
/ce-worktree isolate PR 1234

# Attach a worktree at an existing commit
/ce-worktree isolate abcdef1
```

A branch can be checked out in only one worktree at a time. If the named ref is already checked out somewhere, the skill reports that path and stops. It does not force a second worktree.

---

## The Problem

"Make a worktree" is often the wrong default, because the agent is usually already in one:

- Creating a worktree from inside a linked worktree resolves the new one against the main clone, in a directory tree you are not using
- A behind-the-back `git worktree add` is invisible to the harness (Orca, Cursor, and similar). It cannot list, open, or clean up that tree
- If `.worktrees/` is not gitignored, the extra tree shows up in `git status` and can be committed
- Auto-generated names like `worktree-jolly-beaming-raven` hide what the tree is for

## The Solution

Isolation is an ordered decision, not a create script:

1. **Detect existing isolation.** Compare the resolved absolute git dir with the resolved absolute common git dir, then rule out submodules. Already isolated -> report path and branch, work in place. In attach mode, check the named ref out here rather than nesting.
2. **Prefer the harness tool** (`EnterWorktree`, `/worktree`, `--worktree`, or similar) so the harness still owns the tree.
3. **Git fallback** only when neither applies: create `.worktrees/<branch>` from the repo root, after confirming `.worktrees/` is gitignored, with a meaningful branch name.

If `git worktree add` fails on sandbox or permissions, the skill does **not** continue in the current checkout. It reports the failure and asks whether to work here anyway or stop.

---

## What Makes It Novel

### Detection before creation

`git rev-parse --absolute-git-dir` is compared to the resolved common git dir. A raw string compare is not enough: from a subdirectory, one side can be absolute and the other relative, which looks like "already isolated" when it is not.

When the two differ, `git rev-parse --show-superproject-working-tree` splits the cases. Non-empty is a submodule (treat as a normal checkout). Empty is a linked worktree: stay there.

### Native tool first

If the harness has a worktree primitive, the skill uses it and stops. A hidden `git worktree add` creates state the harness cannot manage.

### Two modes, one-branch-one-worktree

**New work** creates `feat/...` or `fix/...` from origin's default branch (or local default if fetch fails; fetch is non-fatal). **Attach** checks out the named branch, tag, commit, or PR.

A PR is fetched to a local `pr-<n>` branch, then that branch is added as the worktree. A detached `FETCH_HEAD` is not used, because later fix commits would not update the PR. When you need fork-safe push tracking, the fallback is a detached add followed by `gh pr checkout`.

If git reports the ref is already checked out, that is the end of the create path.

### Gitignore before the add

The fallback runs `git check-ignore -q .worktrees/` (trailing slash required) from the repo root, and adds that line to `.gitignore` if needed. Then it creates the tree.

---

## Quick Example

You are in an Orca-managed worktree created at session start. `ce-work` offers isolation. `/ce-worktree` sees that the absolute git dir and the common dir differ, and the submodule guard is empty. You are already isolated. It reports the path and branch and continues in place.

In a plain terminal checkout with no native tool, the same "new work" prompt confirms `.worktrees/` is ignored, fetches the base, runs `git worktree add -b feat/login .worktrees/feat/login origin/main`, and `cd`s in.

---

## When to Reach For It

Use `ce-worktree` when:

- The work should stay off the current checkout
- `ce-work` or `ce-code-review` offered a worktree

Skip it when:

- The work fits on a branch in the current checkout
- You are already isolated and do not need a second, parallel workspace (the skill detects this)

---

## Chain Position

On-demand isolation. Callers pass a meaningful branch name (`feat/...`, `fix/...`, `refactor/...`), not a random label.

```text
/ce-work         ->  /ce-worktree   (optional isolation before implementation)
/ce-code-review  ->  /ce-worktree   (review a PR without touching in-progress work)
```

---

## Use Standalone

- New work: `/ce-worktree for the account-notifications feature`
- Attach a branch: `/ce-worktree isolate feature/account-notifications`
- Attach a PR: `/ce-worktree isolate PR 1234`

List, remove, and switch are plain git. The skill does not wrap them:

```bash
git worktree list
git worktree remove .worktrees/<branch>
cd .worktrees/<branch>
cd "$(git rev-parse --show-toplevel)"
```

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Detect isolation. If none, new-work fallback needs a name from context. |
| `<work description>` | New work: create a named branch worktree from trunk |
| `isolate <branch\|tag\|commit>` | Attach a worktree to that ref |
| `isolate PR <n>` | Attach a worktree to that PR head on local `pr-<n>` |

---

## FAQ

**Why a skill instead of `git worktree add`?**
The agent already knows that command. The skill is the order: detect first, defer to the harness, do not nest or create phantom state. `ce-work` and `ce-code-review` share that order by calling this skill.

**I am already in a worktree. Will it make another?**
No. Existing isolation is detected and used in place.

**The branch I named is already checked out.**
Git allows a branch in only one worktree. The skill reports that path. Work there, or (only if you truly need a separate tree) ask for a detached worktree at the same commit.

**How do I clean up?**
Leave with `cd "$(git rev-parse --show-toplevel)"`, then `git worktree remove .worktrees/<branch>`. If the remote tracking branch is gone, `git fetch --prune` and `git branch -d <branch>` after you confirm it is merged.

---

## See Also

- [`/ce-work`](./ce-work.md): offers this skill as its isolation option
- [`/ce-code-review`](./ce-code-review.md): offers worktree isolation for concurrent review
- [`/ce-commit`](./ce-commit.md): commit in the isolated tree without shipping
