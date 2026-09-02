# `ce-worktree`

> Put the work in an isolated git worktree without disturbing the current checkout.

`ce-worktree` is the **isolation** skill, a git-workflow tool rather than a core-loop step. Most coding harnesses already create a worktree at session start, so the common case is that you are already isolated. The skill checks that first, then prefers the harness's own worktree tool, and only falls back to plain `git worktree add` when neither applies. Nesting a worktree inside another one, or creating one the harness cannot see, is worse than working where you already are.

There is no bundled script. The agent runs inline git from the project directory, so the same instructions work on Claude Code, Codex, Gemini, OpenCode, and Pi.

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

Empty or a work description means **new work**. `isolate` plus a ref means **attach**. If this checkout is already a linked worktree, every form works in place rather than nesting.

```text
# New work. Detect isolation first. If none, create .worktrees/<named-branch> from trunk.
/ce-worktree for the account-notifications feature

# Already isolated (common in Orca or Cursor): report path and branch, stay here
/ce-worktree

# Attach a worktree to an existing branch
/ce-worktree isolate feature/account-notifications

# Attach a worktree to a PR head on a local pr-1234 branch (so later commits can push back)
/ce-worktree isolate PR 1234

# Attach a worktree at an existing commit
/ce-worktree isolate abcdef1
```

Git allows a branch in only one worktree at a time. If the named ref is already checked out somewhere, the skill reports that path and stops instead of forcing a second worktree. Work there, or ask for a detached worktree at the same commit if you truly need a separate tree.

---

## The Problem

"Make a worktree" is often the wrong default, because the agent is usually already in one:

- Creating a worktree from inside a linked worktree resolves the new one against the main clone, in a directory tree you are not using
- A behind-the-back `git worktree add` is invisible to the harness (Orca, Cursor, and similar). It cannot list, open, or clean up that tree
- If `.worktrees/` is not gitignored, the extra tree shows up in `git status` and can be committed
- Auto-generated names like `worktree-jolly-beaming-raven` hide what the tree is for

## The Solution

Isolation is an ordered decision, not a create script.

**1. Detect existing isolation.** The skill compares the resolved absolute git dir against the resolved absolute common git dir. A raw string compare is not enough. From a subdirectory, one side can come back absolute and the other relative, which looks like "already isolated" when it is not. When the two differ, `git rev-parse --show-superproject-working-tree` splits the cases: non-empty means submodule (treat as a normal checkout), empty means linked worktree. Already isolated means report path and branch and work in place. In attach mode, check the named ref out here rather than nesting.

**2. Prefer the harness tool.** If the harness has a worktree primitive (`EnterWorktree`, `/worktree`, `--worktree`, or similar), the skill uses it and stops, so the harness still owns the tree.

**3. Git fallback.** Only when neither applies. From the repo root, the skill runs `git check-ignore -q .worktrees/` (trailing slash required), adds the `.gitignore` line if needed, fetches the base (non-fatal if there is no `origin` or the branch is local-only), and creates the tree with a meaningful branch name.

The two modes share the fallback. **New work** creates `feat/...` or `fix/...` from origin's default branch. **Attach** checks out the named branch, tag, commit, or PR. A PR is fetched to a local `pr-<n>` branch, then that branch is added as the worktree. A detached `FETCH_HEAD` is not used, because later fix commits would not update the PR. When you need fork-safe push tracking, the fallback is a detached add followed by `gh pr checkout`.

If `git worktree add` fails on sandbox or permissions, the skill does **not** continue in the current checkout. You chose isolation for a reason. It reports the failure and asks whether to work here anyway or stop.

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

Why a skill at all, when the agent already knows `git worktree add`? The skill is the order: detect first, defer to the harness, do not nest or create phantom state. `ce-work` and `ce-code-review` share that order by calling this skill.

---

## Chain Position

On-demand isolation. Callers pass a meaningful branch name (`feat/...`, `fix/...`, `refactor/...`), not a random label.

```text
/ce-work         ->  /ce-worktree   (optional isolation before implementation)
/ce-code-review  ->  /ce-worktree   (review a PR without touching in-progress work)
```

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Detect isolation. If none, new-work fallback needs a name from context. |
| `<work description>` | New work: create a named branch worktree from trunk |
| `isolate <branch\|tag\|commit>` | Attach a worktree to that ref |
| `isolate PR <n>` | Attach a worktree to that PR head on local `pr-<n>` |

List, remove, and switch are plain git. The skill does not wrap them:

```bash
git worktree list
git worktree remove .worktrees/<branch>
cd .worktrees/<branch>
cd "$(git rev-parse --show-toplevel)"
```

To clean up when you are done, leave with `cd "$(git rev-parse --show-toplevel)"`, then `git worktree remove .worktrees/<branch>`. If the remote tracking branch is gone, `git fetch --prune` and `git branch -d <branch>` after you confirm it is merged.

---

## See Also

- [`/ce-work`](./ce-work.md): offers this skill as its isolation option
- [`/ce-code-review`](./ce-code-review.md): offers worktree isolation for concurrent review
- [`/ce-commit`](./ce-commit.md): commit in the isolated tree without shipping
