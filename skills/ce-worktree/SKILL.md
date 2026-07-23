---
name: ce-worktree
description: Isolate work in a git worktree — new branch, or attach to an existing branch/PR/commit. Use when starting isolated work or isolating an existing ref; detects existing isolation first.
---

# Worktree Isolation

Ensure the current work happens in an isolated workspace, without disturbing the user's main checkout. Most coding harnesses now create a worktree by default at session start, so the common case is that **isolation already exists** — detect that first and do not create a redundant one.

Order of operations: **detect existing isolation -> prefer a native worktree tool -> fall back to plain git.**

**Two modes.** If no ref is named, create a fresh branch from a base (trunk) — the default. If a ref is named (a PR head, an existing branch, a commit), attach the worktree to that ref instead of branching. One hard git rule governs the second mode: **a branch can be checked out in only one worktree at a time.** If the named ref is already checked out somewhere, report that path and **work in place** there — do not force a second worktree or a detached duplicate at the same commit.

## Detect existing isolation

Before creating anything, check whether the current directory is already a linked worktree. Compare the **resolved absolute** git dir against the **resolved absolute** common git dir, not the raw `git rev-parse` output — git mixes absolute and relative forms depending on the current directory, so a raw string compare yields a false "already isolated":

```bash
git rev-parse --absolute-git-dir                     # absolute git dir for this worktree
(cd "$(git rev-parse --git-common-dir)" && pwd -P)   # absolute shared (common) git dir
```

If the two absolute paths are **equal**, this is a normal checkout — continue below.

If they **differ**, you are in a linked worktree *or* a submodule. Distinguish them:

```bash
git rev-parse --show-superproject-working-tree
```

- **Non-empty** output -> you are in a submodule; treat it as a normal checkout and continue below.
- **Empty** output -> you are **already in an isolated worktree**. Report the worktree path (`git rev-parse --show-toplevel`) and current branch. Do not create another worktree — a worktree-from-worktree lands in the wrong tree and is invisible to the harness that made the current one. Then **work in place**: in new-work mode, continue here; in isolate-an-existing-ref mode, check that ref out here (unless it is already the current branch) rather than nesting a worktree.

## Prefer the harness's native worktree tool

If the harness provides a native worktree primitive — for example an `EnterWorktree` / `WorktreeCreate` tool, a `/worktree` command, or a `--worktree` flag — use it and stop. Never create a worktree behind the harness's back: a `git worktree add` it does not know about is phantom state it cannot see, navigate to, or clean up.

## Git fallback (no native tool, not already isolated)

1. **Run from the repo root** — the `.worktrees/` and `.gitignore` paths below are repo-root-relative: `cd "$(git rev-parse --show-toplevel)"`.
2. Choose a meaningful branch name from the work description (e.g. `feat/login`, `fix/email-validation`) — avoid opaque auto-generated names. Pick a base branch (default: origin's default branch, else `main`).
3. **Ensure `.worktrees/` is gitignored before creating anything**, so worktree contents are never committed: check `git check-ignore -q .worktrees/` — **with the trailing slash**, so an existing directory-only `.worktrees/` rule is honored even before the directory exists; without the slash the check misses it and dirties a correctly-configured repo. If it is not ignored, add a `.worktrees/` line to `.gitignore`.
4. Best-effort refresh of the base branch: `git fetch origin <from-branch>` — **non-fatal**; on error, use the local ref and continue.
5. Create the worktree and `cd` into it — the command depends on the mode:
   - **New work:** `git worktree add -b <branch-name> .worktrees/<branch-name> origin/<from-branch>` (use the local `<from-branch>` ref if `origin/<from-branch>` does not exist).
   - **Isolate an existing ref:** attach to the ref instead of branching — for an existing branch or tag, `git worktree add .worktrees/<slug> <target-ref>`. For a **PR**, check it out **on a local branch** (never a detached `FETCH_HEAD` — that orphans the fix loop's commits instead of updating the PR): `git fetch origin pull/<n>/head:pr-<n>` then `git worktree add .worktrees/pr-<n> pr-<n>`. Use `git worktree add --detach .worktrees/pr-<n>` followed by `gh pr checkout <n>` inside it whenever later steps must **push** to the PR (including fork PRs): a local `pr-<n>` branch has no upstream to the PR head, so pushes go nowhere useful.

If `git worktree add` fails with a sandbox or permission error, the requested isolation could not be created. This needs a **blocking** user decision before touching the current checkout. Report the failure and ask via the platform's blocking question tool (`AskUserQuestion`, `request_user_input`, `ask_question`, `ask_user`), falling back to numbered options in chat if none is available — "work in the current checkout" vs "stop and resolve the permission issue". Only work in the current checkout on explicit confirmation, and do not retry alternative paths automatically. In a non-interactive run, stop and report the failure rather than guessing.
