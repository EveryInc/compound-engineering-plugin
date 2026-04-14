---
name: git-commit-push-pr
description: Commit, push, and open a PR with an adaptive, value-first description. Use when the user says "commit and PR", "push and open a PR", "ship this", "create a PR", "open a pull request", "commit push PR", or wants to go from working changes to an open pull request in one step. Also use when the user says "update the PR description", "refresh the PR description", "freshen the PR", or wants to rewrite an existing PR description. Produces PR descriptions that scale in depth with the complexity of the change, avoiding cookie-cutter templates.
---

# Git Commit, Push, and PR

Go from working changes to an open pull request, or rewrite an existing PR description.

**Asking the user:** When this skill says "ask the user", use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If unavailable, present the question and wait for a reply.

## Mode detection

If the user is asking to update, refresh, or rewrite an existing PR description (with no mention of committing or pushing), this is a **description-only update**. The user may also provide a focus (e.g., "update the PR description and add the benchmarking results"). Note any focus for DU-3.

For description-only updates, follow the Description Update workflow below. Otherwise, follow the full workflow.

## Context

**If you are not Claude Code**, skip to the "Context fallback" section below and run the command there to gather context.

**If you are Claude Code**, the seven labeled sections below contain pre-populated data. Use them directly -- do not re-run these commands.

**Git status:**
!`git status`

**Working tree diff:**
!`git diff HEAD`

**Current branch:**
!`git branch --show-current`

**Recent commits:**
!`git log --oneline -10`

**Remote default branch:**
!`git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo 'DEFAULT_BRANCH_UNRESOLVED'`

**Existing PR check:**
!`gh pr view --json url,title,state 2>/dev/null || echo 'NO_OPEN_PR'`

**gh-stack availability:**
!`gh extension list 2>/dev/null | grep -q gh-stack && echo "GH_STACK_INSTALLED" || echo "GH_STACK_NOT_INSTALLED"`

### Context fallback

**If you are Claude Code, skip this section — the data above is already available.**

Run this single command to gather all context:

```bash
printf '=== STATUS ===\n'; git status; printf '\n=== DIFF ===\n'; git diff HEAD; printf '\n=== BRANCH ===\n'; git branch --show-current; printf '\n=== LOG ===\n'; git log --oneline -10; printf '\n=== DEFAULT_BRANCH ===\n'; git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo 'DEFAULT_BRANCH_UNRESOLVED'; printf '\n=== PR_CHECK ===\n'; gh pr view --json url,title,state 2>/dev/null || echo 'NO_OPEN_PR'; printf '\n=== GH_STACK ===\n'; gh extension list 2>/dev/null | grep -q gh-stack && echo "GH_STACK_INSTALLED" || echo "GH_STACK_NOT_INSTALLED"
```

---

## Description Update workflow

### DU-1: Confirm intent

Ask the user: "Update the PR description for this branch?" If declined, stop.

### DU-2: Find the PR

Use the current branch and existing PR check from context. If the current branch is empty (detached HEAD), report no branch and stop. If the PR check returned `state: OPEN`, proceed to DU-3. Otherwise, report no open PR and stop.

### DU-3: Write and apply the updated description

Read the current PR description to drive the compare-and-confirm step later:

```bash
gh pr view --json body --jq '.body'
```

**Generate the updated title and body** — load the `ce-pr-description` skill with `pr: <PR number from DU-2>`. If the user provided a focus (e.g., "include the benchmarking results"), pass it as `focus: <hint>`. The skill returns a `{title, body}` block without applying or prompting.

If `ce-pr-description` returns a "not open" or other graceful-exit message instead of a `{title, body}` pair, report that message and stop.

**Evidence decision:** `ce-pr-description` preserves any existing `## Demo` or `## Screenshots` block from the current body by default. If the user's focus asks to refresh or remove evidence, pass that intent via the `focus:` hint — the skill will honor it. If no evidence block exists and one would benefit the reader, invoke `ce-demo-reel` separately to capture, then re-invoke `ce-pr-description` with an updated focus that references the captured evidence.

**Compare and confirm** — briefly explain what the new description covers differently from the old one. This helps the user decide whether to apply; the description itself does not narrate these differences.

- If the user provided a focus, confirm it was addressed.
- Ask the user to confirm before applying.

If confirmed, apply with the returned title and body:

```bash
gh pr edit --title "<returned title>" --body "$(cat <<'EOF'
<returned body>
EOF
)"
```

Report the PR URL.

---

## Full workflow

### Step 1: Gather context

Use the context above. All data needed for this step and Step 3 is already available -- do not re-run those commands.

The remote default branch value returns something like `origin/main`. Strip the `origin/` prefix. If it returned `DEFAULT_BRANCH_UNRESOLVED` or a bare `HEAD`, try:

```bash
gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
```

If both fail, fall back to `main`.

If the current branch is empty (detached HEAD), explain that a branch is required. Ask whether to create a feature branch now.
- If yes, derive a branch name from the change content, create with `git checkout -b <branch-name>`, and use that for the rest of the workflow.
- If no, stop.

If the working tree is clean (no staged, modified, or untracked files), determine the next action:

1. Run `git rev-parse --abbrev-ref --symbolic-full-name @{u}` to check upstream.
2. If upstream exists, run `git log <upstream>..HEAD --oneline` for unpushed commits.

Decision tree:

- **On default branch, unpushed commits or no upstream** -- ask whether to create a feature branch (pushing default directly is not supported). If yes, create and continue from Step 5. If no, stop.
- **On default branch, all pushed, no open PR** -- report no feature branch work. Stop.
- **Feature branch, no upstream** -- skip Step 4, continue from Step 5.
- **Feature branch, unpushed commits** -- skip Step 4, continue from Step 5.
- **Feature branch, all pushed, no open PR** -- skip Steps 4-5, continue from Step 6.
- **Feature branch, all pushed, open PR** -- report up to date. Stop.

### Step 2: Determine conventions

Priority order for commit messages and PR titles:

1. **Repo conventions in context** -- follow project instructions if they specify conventions. Do not re-read; they load at session start.
2. **Recent commit history** -- match the pattern in the last 10 commits.
3. **Default** -- `type(scope): description` (conventional commits).

### Step 3: Check for existing PR

Use the current branch and existing PR check from context. If the branch is empty, report detached HEAD and stop.

If the PR check returned `state: OPEN`, note the URL -- continue to Step 4 and 5, then skip to Step 7 (existing PR flow). Otherwise, continue through Step 8.

### Step 4: Branch, stage, and commit

1. If on the default branch, create a feature branch first with `git checkout -b <branch-name>`.
2. Scan changed files for naturally distinct concerns. If files clearly group into separate logical changes, create separate commits (2-3 max). Group at the file level only (no `git add -p`). When ambiguous, one commit is fine.
3. Stage and commit each group in a single call. Avoid `git add -A` or `git add .`. Follow conventions from Step 2:
   ```bash
   git add file1 file2 file3 && git commit -m "$(cat <<'EOF'
   commit message here
   EOF
   )"
   ```

### Step 5: Push and stack-aware routing

Before pushing, check the `gh-stack availability` value from context and the current branch's stack membership. If `GH_STACK_INSTALLED`, or if the change is substantial enough that stacking could help, load `references/stack-aware-workflow.md` to route through one of four cases (in-stack ship, not-in-stack suggestion, offer-to-install, or monolithic). The reference file owns push, submit, per-PR description, and the stacking heuristic.

If the reference file handles the ship end-to-end (Cases 1-3 on their stacked paths), skip the remaining steps of this skill — the reference file reports the PR URLs itself. Otherwise, fall through to the monolithic path:

```bash
git push -u origin HEAD
```

Then continue to Step 6.

### Step 6: Generate the PR title and body

The working-tree diff from Step 1 only shows uncommitted changes at invocation time. The PR description must cover **all commits** in the PR.

**Detect the base branch and remote.** Resolve both the base branch and the remote (fork-based PRs may use a remote other than `origin`). Stop at the first that succeeds:

1. **PR metadata** (if existing PR found in Step 3):
   ```bash
   gh pr view --json baseRefName,url
   ```
   Extract `baseRefName`. Match `owner/repo` from the PR URL against `git remote -v` fetch URLs to find the base remote. Fall back to `origin`.
2. **Remote default branch from context** -- if resolved, strip `origin/` prefix. Use `origin`.
3. **GitHub metadata:**
   ```bash
   gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
   ```
   Use `origin`.
4. **Common names** -- check `main`, `master`, `develop`, `trunk` in order:
   ```bash
   git rev-parse --verify origin/<candidate>
   ```
   Use `origin`.

If none resolve, ask the user to specify the target branch.

**Evidence decision (before delegation).** If the branch diff changes observable behavior (UI, CLI output, API behavior with runnable code, generated artifacts, workflow output) and evidence is not otherwise blocked (unavailable credentials, paid services, deploy-only infrastructure, hardware), ask: "This PR has observable behavior. Capture evidence for the PR description?"

- **Capture now** -- load the `ce-demo-reel` skill with a target description inferred from the branch diff. ce-demo-reel returns `Tier`, `Description`, and `URL`. Note the captured evidence so it can be passed as `focus:` context to `ce-pr-description` (e.g., "include the captured demo: <URL> as a `## Demo` section") or spliced into the returned body before apply. If capture returns `Tier: skipped` or `URL: "none"`, proceed with no evidence.
- **Use existing evidence** -- ask for the URL or markdown embed, then pass it via `focus:` or splice in before apply.
- **Skip** -- proceed with no evidence section.

When evidence is not possible (docs-only, markdown-only, changelog-only, release metadata, CI/config-only, test-only, or pure internal refactors), skip without asking.

**Delegate title and body generation to `ce-pr-description`.** Load the `ce-pr-description` skill with:

- `range: <base-remote>/<base-branch>..HEAD` — for new PRs (no existing PR found in Step 3).
- `pr: <existing PR number>` — for existing PRs (found in Step 3) that should be refreshed.
- `focus: <hint>` — optional; include captured/linked evidence context or any user-supplied focus.

`ce-pr-description` returns a `{title, body}` block. It applies the value-first writing principles, commit classification, sizing, narrative framing, writing voice, visual communication, numbering rules, and the Compound Engineering badge footer internally. Use the returned values verbatim in Step 7; do not layer manual edits onto them unless a focused adjustment is required (e.g., splicing an evidence block captured in this step that was not passed via `focus:`).

If `ce-pr-description` returns a graceful-exit message instead of `{title, body}` (e.g., invalid range, closed PR), report the message and stop — do not create or edit the PR.

### Step 7: Create or update the PR

#### New PR (no existing PR from Step 3)

Using the `{title, body}` returned by `ce-pr-description`:

```bash
gh pr create --title "<returned title>" --body "$(cat <<'EOF'
<returned body>
EOF
)"
```

Keep the title under 72 characters; `ce-pr-description` already emits a conventional-commit title in that range.

#### Existing PR (found in Step 3)

The new commits are already on the PR from Step 5. Report the PR URL, then ask whether to rewrite the description.

- If **yes**, apply the returned title and body from `ce-pr-description`:

  ```bash
  gh pr edit --title "<returned title>" --body "$(cat <<'EOF'
  <returned body>
  EOF
  )"
  ```

- If **no** -- done.

### Step 8: Report

Output the PR URL.
