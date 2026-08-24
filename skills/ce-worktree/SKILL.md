---
name: ce-worktree
description: Set up isolated git worktrees — create a new branch for fresh work, or attach a worktree to an existing branch, PR, or commit. Use when starting isolated work or isolating an existing ref.
---

# Worktree Isolation

Ensure the current work happens in an isolated workspace, without disturbing the user's main checkout. Most coding harnesses now create a worktree by default at session start, so the common case is that **isolation already exists**.

**Done when:** the caller is working in an isolated tree — existing or newly created — and its path and branch have been reported, or a blocker has been reported instead.

**Order of operations: detect existing isolation -> prefer a native worktree tool -> fall back to plain git.** Never create a worktree the harness cannot see.

**Two modes, set by the caller's need:**

- **New work (default).** No ref named — create a fresh branch from a base (trunk). This is what `ce-work` and `ce-code-review` use when the user picks the worktree option.
- **Isolate an existing ref.** The caller names a PR head, branch, or commit — attach the worktree to that ref instead of creating a new branch. **A branch can be checked out in only one worktree at a time.** If the named ref is already checked out anywhere (most commonly as the primary checkout's current branch), do **not** create a second worktree — report that it is already checked out at `<path>` and let the caller act (work there in place; or, only if a clean separate tree is essential, create a *detached* worktree at the same commit).

## Step 0: Detect existing isolation

Compare the **resolved absolute** git dir against the **resolved absolute** common git dir. Git mixes absolute and relative forms depending on the current directory (from a subdirectory of a normal checkout, `--git-dir` comes back absolute while `--git-common-dir` may be relative), so a raw string compare yields a false "already isolated":

```bash
git rev-parse --absolute-git-dir                     # absolute git dir for this worktree
(cd "$(git rev-parse --git-common-dir)" && pwd -P)   # absolute shared (common) git dir
```

**Equal** -> normal checkout; continue to Step 1.

**Different** -> a linked worktree *or* a submodule. Distinguish with `git rev-parse --show-superproject-working-tree`:

- **Non-empty** -> submodule; treat it as a normal checkout and continue to Step 1.
- **Empty** -> **already isolated**. Report the worktree path (`git rev-parse --show-toplevel`) and current branch, then **work in place** — a worktree-from-worktree lands in the wrong tree and is invisible to the harness that made the current one. In isolate-an-existing-ref mode, check that ref out here (unless it is already current) rather than nesting a worktree.

## Step 1: Prefer the harness's native worktree tool

If the harness provides a native worktree primitive — for example an `EnterWorktree` / `WorktreeCreate` tool, a `/worktree` command, or a `--worktree` flag — use it and stop. Native tools place, track, and clean up the worktree so the harness can manage it. A behind-the-back `git worktree add` creates phantom state the harness cannot see, navigate to, or clean up.

## Step 2: Git fallback

Only when there is no native tool **and** Step 0 found no existing isolation.

1. **Run from the repo root:** `cd "$(git rev-parse --show-toplevel)"`. The paths below are repo-root-relative, but the skill runs from the user's current directory — without this, `.worktrees/<branch>` and the `.gitignore` edit land in a subdirectory (e.g. `src/.worktrees/...`).
2. Choose a meaningful branch name from the work description (e.g. `feat/login`, `fix/email-validation`) — never an opaque auto-generated one. Base: origin's default branch, else `main`.
3. **Ensure `.worktrees/` is gitignored before creating anything:** `git check-ignore -q .worktrees/` — **with the trailing slash**, so an existing directory-only `.worktrees/` rule is honored even before the directory exists (without the slash the probe misses it and dirties a correctly-configured repo). Not ignored -> add a `.worktrees/` line to `.gitignore`.
4. Refresh the base with `git fetch origin <from-branch>`. This is **non-fatal** — no `origin` remote, a differently-named remote, or a local-only branch is not an abort; continue with the local ref.
5. Create the worktree, per mode:
   - **New work:** `git worktree add -b <branch-name> .worktrees/<branch-name> origin/<from-branch>` (use the local `<from-branch>` ref if `origin/<from-branch>` does not exist).
   - **Existing branch or tag:** `git worktree add .worktrees/<slug> <target-ref>`.
   - **PR:** check it out on a **local branch** — `git fetch origin pull/<n>/head:pr-<n>` then `git worktree add .worktrees/pr-<n> pr-<n>`. Never a detached `FETCH_HEAD`: that orphans the fix loop's commits instead of updating the PR. (For push-tracking back to the PR, create it detached — `git worktree add --detach .worktrees/pr-<n>` — then `cd` in and run `gh pr checkout <n>`, which is fork-safe.)
   - If git reports the ref is already checked out elsewhere, apply the one-branch-one-worktree rule above — do not force a second worktree.
6. `cd` into it, then report the path and branch.

If `git worktree add` fails with a sandbox or permission error, the requested isolation does not exist. Do **not** proceed in the current checkout — the user chose isolation specifically to avoid it. Report the failure and ask, offering options such as "work in the current checkout" vs "stop and resolve the permission issue", using the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability — do not search for another host's tool name. Only when no such tool is in the list or a real question call errors, present the numbered options in chat and wait for the reply. Never skip the confirmation, and do not retry alternative paths automatically.
