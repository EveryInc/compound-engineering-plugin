# `ce-worktree`

> Ensure work happens in an isolated git worktree without disturbing the current checkout — by detecting existing isolation, deferring to the harness's native worktree tool, and only falling back to plain git.

`ce-worktree` is the **isolation guardrail** skill. Its value is judgment, not mechanics: most coding harnesses now create a worktree by default at session start, so the common case is that you are *already* isolated. The skill encodes the discipline to recognize that, defer to the harness's own worktree tooling, and only create a worktree with plain git as a last resort — so you never nest worktrees or create state the harness can't manage.

It is pure prose + inline git, with **no bundled script**, so it works verbatim on every supported target (Claude Code, Codex, Gemini, OpenCode, Pi).

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Ensures isolation exists. Detects an existing worktree first, prefers the harness's native worktree tool, falls back to `git worktree add` under `.worktrees/<branch>` |
| When to use it | Starting work that should stay isolated; when `ce-work` or `ce-code-review` offers a worktree option |
| What it produces | Either "you're already isolated, work in place" or a new isolated worktree |
| Skip when | Single-task work that fits on a branch in the current checkout |

---

## The Problem

Asking an agent to "make a worktree" is increasingly the *wrong* default, because the agent is usually already in one:

- **Worktree-from-worktree** — creating a worktree from inside a linked worktree resolves the new one against the *main* clone, landing it in a different directory tree the user isn't working in.
- **Phantom state** — a behind-the-back `git worktree add` is invisible to the harness (Orca, Cursor, etc.) that owns worktree lifecycle: it can't list, navigate to, or clean it up.
- **Committed worktree contents** — if `.worktrees/` isn't gitignored, the worktree pollutes `git status` and risks being committed.
- **Cryptic branch names** — auto-generated names like `worktree-jolly-beaming-raven` obscure what the worktree is for.

## The Solution

`ce-worktree` runs isolation as an ordered decision, not a creation script:

1. **Detect existing isolation** (compare `--git-dir` against `--git-common-dir`, with a submodule guard). Already isolated → report and work in place.
2. **Prefer the harness's native worktree tool** (e.g. an `EnterWorktree` tool, a `/worktree` command, a `--worktree` flag) so the worktree stays managed.
3. **Inline git fallback** only when neither applies: create `.worktrees/<branch>`, ensuring `.worktrees` is gitignored first, with a meaningful branch name.

---

## What Makes It Novel

### 1. Detection before creation

The single most important behavior: before creating anything, determine whether the current directory is already a linked worktree. `git rev-parse --git-dir` and `--git-common-dir` differ inside both linked worktrees and submodules, so a `git rev-parse --show-superproject-working-tree` submodule guard disambiguates. When already isolated, the skill works in place rather than nesting.

### 2. Native-tool deference

If the harness provides a worktree primitive, the skill uses it instead of shelling out to git. This avoids creating phantom worktrees the harness can't see or clean up — the "don't fight the harness" rule.

### 3. Portable by construction

There is no bundled script and no `${CLAUDE_SKILL_DIR}` dependence — only inline git the agent runs from the project directory. That is why the skill resolves identically on every target, and why it carries no `ce_platforms` gate.

### 4. Gitignore safety before creation

When the git fallback runs, the skill verifies `.worktrees` is gitignored (`git check-ignore`) before creating the worktree, so its contents are never committed.

### 5. Naming guidance for upstream callers

When `ce-work` or `ce-code-review` invoke the skill, they pass a meaningful branch name derived from the work (`feat/crowd-sniff`, `fix/email-validation`) — never an opaque auto-generated name.

---

## Quick Example

You're in an Orca-managed worktree (the harness created it at session start) and ask `ce-work` to isolate the work. The skill runs Step 0: `--git-dir` and `--git-common-dir` differ, and the submodule guard returns empty → **you are already isolated**. It reports the worktree path and current branch and proceeds in place — no second worktree, no phantom state.

In a plain terminal checkout with no native worktree tool, the same invocation falls through to Step 2: it confirms `.worktrees` is gitignored, fetches the base branch, runs `git worktree add -b feat/login .worktrees/feat/login origin/main`, and `cd`s in.

---

## When to Reach For It

Reach for `ce-worktree` when:

- You're starting work that should stay isolated from the current checkout
- A skill (`ce-work`, `ce-code-review`) offered worktree as an option

Skip it when:

- The work is single-task and fits on a branch in the current checkout
- You are already isolated and have no need for a *second*, parallel workspace (the skill detects this for you)

---

## Use as Part of the Workflow

`ce-worktree` is invoked from chain skills as their isolation step:

- **`/ce-work`** — when starting work, the user can choose worktree isolation over branching in the current checkout
- **`/ce-code-review`** — for reviewing PRs concurrently without disturbing in-progress work

Upstream callers pass meaningful branch names; the skill expects `feat/...`, `fix/...`, `refactor/...` shapes — not auto-generated random names.

---

## Other worktree operations

List, remove, and switch use `git` directly — the skill provides no wrapper:

```bash
git worktree list                          # list worktrees
git worktree remove .worktrees/<branch>    # remove a worktree
cd .worktrees/<branch>                     # switch to a worktree
cd "$(git rev-parse --show-toplevel)"      # return to the current checkout root
```

---

## FAQ

**Why a skill instead of just `git worktree add`?**
The value isn't the `git worktree add` command — the agent knows that. It's the *judgment*: detect that you're probably already isolated, defer to the harness's worktree tooling, and don't nest or create phantom state. That discipline is shared by `ce-work` and `ce-code-review`, so it lives in one named skill rather than being duplicated and drifting.

**I'm already in a worktree — will it make another?**
No. Step 0 detects existing isolation and works in place. A worktree-from-worktree is exactly the failure mode the skill prevents.

**How do I clean up a worktree?**
`cd "$(git rev-parse --show-toplevel)"` to leave it, then `git worktree remove .worktrees/<branch>`. If the remote tracking branch is gone, prune with normal git commands such as `git fetch --prune` followed by `git branch -d <branch>` after verifying the branch is merged.

---

## See Also

- [`/ce-work`](./ce-work.md) — offers this skill as its isolation option
- [`/ce-code-review`](./ce-code-review.md) — offers worktree isolation for concurrent review
