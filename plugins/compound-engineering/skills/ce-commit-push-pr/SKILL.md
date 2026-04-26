---
name: ce-commit-push-pr
description: Commit, push, and open a PR with an adaptive, value-first description. Use when the user says "commit and PR", "push and open a PR", "ship this", "create a PR", "open a pull request", "commit push PR", or wants to go from working changes to an open pull request in one step. Also use when the user says "update the PR description", "refresh the PR description", "freshen the PR", "rewrite the PR body", "write a PR description", "draft a PR description", or "describe this PR" — the skill will produce a description without committing or pushing if that is all the user wants. Produces PR descriptions that scale in depth with the complexity of the change, avoiding cookie-cutter templates.
---

# Git Commit, Push, and PR

Go from working changes to an open pull request, rewrite an existing PR description, or generate a description without touching git state.

**Asking the user:** When this skill says "ask the user", use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to presenting the question in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

## Mode detection

Three flavors of intent. Pick one and follow the matching path; otherwise default to the full workflow.

- **Description-only generation.** If the user asked for *just* a PR description with no commit or push intent (e.g., "write a PR description", "draft a PR description for this branch", "describe this PR", or pasted a PR URL/number alone), skip Steps 4–5. Run Step 1 for context, then jump to Step 6 to compose the title and body following `references/pr-description-writing.md`. Print the result back to the user. Apply via `gh pr edit`/`gh pr create` only if the user asks. If the user pasted a PR URL or number, describe that PR's commit range (use `gh pr view <ref> --json baseRefName,headRefOid,body` and diff against its base) rather than the local branch.
- **Description update on existing PR.** If the user is asking to update, refresh, or rewrite an existing PR description (with no mention of committing or pushing), follow the Description Update workflow below. The user may also provide a focus (e.g., "update the PR description and add the benchmarking results"). Note any focus for DU-3.
- **Full workflow.** Otherwise, follow the Full workflow below.

## Context

**On platforms other than Claude Code**, skip to the "Context fallback" section below and run the command there to gather context.

**In Claude Code**, the six labeled sections below contain pre-populated data. Use them directly -- do not re-run these commands.

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

### Context fallback

**In Claude Code, skip this section — the data above is already available.**

Run this single command to gather all context:

```bash
printf '=== STATUS ===\n'; git status; printf '\n=== DIFF ===\n'; git diff HEAD; printf '\n=== BRANCH ===\n'; git branch --show-current; printf '\n=== LOG ===\n'; git log --oneline -10; printf '\n=== DEFAULT_BRANCH ===\n'; git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo 'DEFAULT_BRANCH_UNRESOLVED'; printf '\n=== PR_CHECK ===\n'; gh pr view --json url,title,state 2>/dev/null || echo 'NO_OPEN_PR'
```

---

## Description Update workflow

### DU-1: Confirm intent

Ask the user: "Update the PR description for this branch?" If declined, stop.

### DU-2: Find the PR

Use the current branch and existing PR check from context. If the current branch is empty (detached HEAD), report no branch and stop. If the PR check returned `state: OPEN`, note the PR `url` and proceed to DU-3. Otherwise, report no open PR and stop.

### DU-3: Write and apply the updated description

Read the current PR body so you can preserve any existing evidence block and explain what changed:

```bash
gh pr view --json body --jq '.body'
```

Compose the new title and body following `references/pr-description-writing.md`. If the user provided focus (e.g., "include the benchmarking results"), apply it as steering — do not let it override the writing principles or fabricate content the diff does not support.

**Evidence decision:** the writing reference preserves any existing `## Demo` or `## Screenshots` block from the current body by default. If the user's focus asks to refresh or remove evidence, honor that. If no evidence block exists and one would benefit the reader, invoke `ce-demo-reel` separately to capture, then re-compose with the captured URL/path spliced in.

**Compare and confirm.** Briefly explain what the new description covers differently from the old one. Ask the user to confirm before applying. If the user provided focus, confirm it was addressed.

If confirmed, apply with `gh pr edit`. Substitute `<TITLE>` verbatim; if it contains `"`, `` ` ``, `$`, or `\`, escape them or switch to single quotes. The body is best written to a temp file first to avoid shell-escaping the whole markdown body:

```bash
BODY_FILE=$(mktemp "${TMPDIR:-/tmp}/ce-pr-body.XXXXXX") && cat > "$BODY_FILE" <<'__CE_PR_BODY_END__'
<the composed body markdown goes here, verbatim>
__CE_PR_BODY_END__
gh pr edit --title "<TITLE>" --body "$(cat "$BODY_FILE")"
```

The quoted sentinel keeps `$VAR`, backticks, and any literal `EOF` inside the body from being expanded.

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

When using conventional commits, choose the type that most precisely describes the change. Where `fix:` and `feat:` both seem to fit, default to `fix:`: a change that remedies broken or missing behavior is `fix:` even when implemented by adding code. Reserve `feat:` for capabilities the user could not previously accomplish. Other types (`chore:`, `refactor:`, `docs:`, `perf:`, `test:`, `ci:`, `build:`, `style:`) remain primary when they fit better. The user may override for a specific change.

### Step 3: Check for existing PR

Use the current branch and existing PR check from context. If the branch is empty, report detached HEAD and stop.

If the PR check returned `state: OPEN`, note the URL -- this is the existing-PR flow. Continue to Step 4 and 5 (commit any pending work and push), then go to Step 7 to ask whether to rewrite the description. Only run Step 6 if the user confirms the rewrite. Otherwise (no open PR), continue through Steps 6, 7, and 8 in order.

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

### Step 5: Push

```bash
git push -u origin HEAD
```

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

**Gather the full branch diff (before evidence decision).** The working-tree diff from Step 1 only reflects uncommitted changes at invocation time — on the common "feature branch, all pushed, open PR" path, Step 1 skips the commit/push steps and the working-tree diff is empty. The evidence decision below needs the real branch diff to judge whether behavior is observable, so compute it explicitly against the base resolved above. Only fetch when the local ref isn't available — if `<base-remote>/<base-branch>` already resolves locally, run the diff from local state so offline / restricted-network / expired-auth environments don't hard-fail:

```bash
git rev-parse --verify <base-remote>/<base-branch> >/dev/null 2>&1 \
  || git fetch --no-tags <base-remote> <base-branch>
git diff <base-remote>/<base-branch>...HEAD
```

Use this branch diff (not the working-tree diff) for the evidence decision. If the branch diff is empty (e.g., HEAD is already merged into the base or the branch has no unique commits), skip the evidence prompt and continue to composition.

**Evidence decision (before composition).** Before running the full decision, two short-circuits:

1. **User explicitly asked for evidence.** If the user's invocation requested it ("ship with a demo", "include a screenshot"), proceed directly to capture. If capture turns out to be not possible (no runnable surface, missing credentials, docs-only diff) or clearly not useful, note that briefly and proceed without evidence — do not force capture for its own sake.

2. **Agent judgment on authored changes.** If you authored the commits in this session and know the change is clearly non-observable (internal plumbing, backend refactor without user-facing effect, type-level changes, etc.), skip the prompt without asking. The categorical skip list below is not exhaustive — trust judgment about the change you just wrote.

Otherwise, run the full decision: if the branch diff changes observable behavior (UI, CLI output, API behavior with runnable code, generated artifacts, workflow output) and evidence is not otherwise blocked (unavailable credentials, paid services, deploy-only infrastructure, hardware), ask: "This PR has observable behavior. Capture evidence for the PR description?"

- **Capture now** -- load the `ce-demo-reel` skill with a target description inferred from the branch diff. ce-demo-reel returns `Tier`, `Description`, `URL`, and `Path`. Exactly one of `URL` or `Path` contains a real value; the other is `"none"`. If capture returns a public URL, splice it into the body as a `## Demo` section. If capture returns a local `Path` instead (user chose local save), note in the body that a demo was recorded but is not embedded because the user chose local save. If capture returns `Tier: skipped` or both `URL` and `Path` are `"none"`, proceed with no evidence.
- **Use existing evidence** -- ask for the URL or markdown embed, then splice it in as a `## Demo` section.
- **Skip** -- proceed with no evidence section.

When evidence is not possible (docs-only, markdown-only, changelog-only, release metadata, CI/config-only, test-only, or pure internal refactors), skip without asking.

**Compose the title and body.** Read `references/pr-description-writing.md` and follow Steps A through H. The reference covers commit classification, evidence handling, narrative framing, sizing, writing voice and principles, visual communication, title format, body assembly, the Compound Engineering badge, and the compression pass.

For an existing PR, also read its current body (`gh pr view --json body --jq '.body'`) so the reference's evidence-preservation rule has the source material it needs.

If the commit list is empty (e.g., HEAD is already merged into the base or the branch has no unique commits), report "No commits to describe" and stop — do not invent a description.

### Step 7: Create or update the PR

Apply via `gh pr create` (new PR) or `gh pr edit` (existing PR). The body is best written to a temp file first to avoid shell-escaping the whole markdown body. Substitute `<TITLE>` verbatim; if it contains `"`, `` ` ``, `$`, or `\`, escape them or switch to single quotes:

```bash
BODY_FILE=$(mktemp "${TMPDIR:-/tmp}/ce-pr-body.XXXXXX") && cat > "$BODY_FILE" <<'__CE_PR_BODY_END__'
<the composed body markdown goes here, verbatim>
__CE_PR_BODY_END__
```

The quoted sentinel keeps `$VAR`, backticks, and any literal `EOF` inside the body from being expanded.

#### New PR (no existing PR from Step 3)

```bash
gh pr create --title "<TITLE>" --body "$(cat "$BODY_FILE")"
```

Keep the title under 72 characters; the writing reference already emits a conventional-commit title in that range.

#### Existing PR (found in Step 3)

The new commits are already on the PR from Step 5. Report the PR URL, then ask whether to rewrite the description.

- If **no** -- skip Step 6 entirely and finish. Do not run composition or evidence capture when the user declined the rewrite.
- If **yes**, perform these three actions in order. They are separate steps with a hand-off boundary between them -- do not stop between actions.
  1. Run Step 6 to compose the new title and body.
  2. **Preview and confirm.** Read the first two sentences of the Summary, plus the total line count. Ask the user (per the "Asking the user" convention at the top of this skill): "New title: `<title>` (`<N>` chars). Summary leads with: `<first two sentences>`. Total body: `<L>` lines. Apply?" The first two sentences of the Summary carry most of the reviewer's attention. If the user declines, they may pass focus text back for a regenerate; do not apply.
  3. If confirmed, apply with `gh pr edit`:

     ```bash
     gh pr edit --title "<TITLE>" --body "$(cat "$BODY_FILE")"
     ```

  Then report the PR URL (Step 8).

### Step 8: Report

Output the PR URL.
