---
name: ce-quick-ship-pr
description: "Use for routine review-commit-push-open-PR requests."
argument-hint: "[tests:auto|skip]"
---

# Quick Ship PR

Use this for the ordinary finish line: **review -> verify lightly -> commit -> push -> open/verify PR**. This is deliberately a short path. It does not merge, deploy, rewrite an existing PR description, capture evidence, teach concepts, add branding, or babysit CI.

## Authorization boundary

The user's request to review changes, commit, push, and open a PR authorizes those remote writes. It does not authorize merge, deployment, force-push, reset, rebase of a published branch, branch deletion, or secret handling.

Preserve unrelated staged, unstaged, and untracked work. Never stage `.env`, private keys, tokens, database dumps, caches, screenshots, or unrelated generated files.

## Workflow

### 1. Establish the repository and branch

Run a compact read-only preflight from the repository root. Establish:

- Git repository root
- current branch and whether the worktree is dirty
- staged, unstaged, and untracked paths
- diff stat and `git diff --check`
- remote and default branch
- recent commit style
- whether an open PR already exists for this branch

If this is not a Git repository, stop. If the branch is detached or is the default branch with work to ship, create a descriptive feature branch from the current `HEAD`, then re-read the live branch name. Do not commit routine feature work directly to the default branch.

If the worktree is clean but the current branch is ahead of its upstream, treat the existing commits as the work to push; do not create an empty commit.

### 2. Review the actual change set

Inspect the diff and untracked files that belong to the requested work. Identify unrelated changes and leave them untouched. Group clearly separate concerns into at most 2-3 commits; when the boundary is unclear, use one commit.

Match repository instructions and recent commit style. Otherwise use a conventional commit with an imperative subject, choosing `fix:` when the change repairs or completes existing behavior and `feat:` only when it adds a capability users could not previously perform.

### 3. Run the smallest meaningful verification

Use repository-native instructions when they identify a focused check for the changed area. Prefer a focused test, type check, lint check, build check, or executable smoke over an unrelated full suite. Do not install dependencies or launch long-running watchers merely to make this quick path look complete.

Always run `git diff --check` before committing. If no meaningful local check is available, report that fact precisely rather than claiming tests passed. A `tests:skip` modifier skips optional tests but never skips diff review, secret screening, or `git diff --check`.

### 4. Commit only owned paths

Stage explicit paths, never `git add -A` or `git add .`. Create the conventional commit(s), then read back each commit subject and full SHA. If the tree is clean and the intended commits already exist, skip the commit step.

Before pushing, re-read `git branch --show-current` and confirm it is the intended feature branch. Push the live `HEAD`:

```bash
git push -u origin HEAD
```

If the push is rejected because the remote advanced, fetch and inspect the divergence. Do not force-push or rewrite a published branch in this quick path.

### 5. Open or verify the PR

After pushing, verify that the remote branch points to the local `HEAD`. Re-check open PRs for the exact current head branch immediately before creating anything. Treat a non-zero `gh`/network/auth result as unknown, not as proof that no PR exists.

- If a matching open PR exists, report it. Do not rewrite its title or body unless explicitly requested.
- If no matching PR exists and GitHub CLI is authenticated, create one using the repository's default base and the committed change summary (`gh pr create --fill` is acceptable for this routine path).
- Read the created or existing PR back with its URL, state, base branch, head branch, and head SHA.
- If PR creation is unavailable, report the pushed branch and exact blocker; never invent a PR URL.

### 6. Completion report

Report only verified facts:

- files/concerns included and excluded
- verification commands and results
- commit SHA and message
- branch and remote SHA
- PR URL/state/head SHA, or the exact reason no PR was created
- explicit boundary: merge and deployment were not performed

The workflow is complete when the intended commit is verified on the remote branch and an existing or newly-created PR is verified, or when a concrete blocker is reported with the pushed branch preserved.

## Escalate instead of improvising

Use the heavier workflows when the request also asks to merge, deploy, babysit/watch CI, rewrite a PR description, add evidence/branding/teaching content, recover a dirty or multi-repository shipment, handle a fork/remote conflict, or perform security-sensitive release work. Do not turn this fast path into a release workflow by default.
