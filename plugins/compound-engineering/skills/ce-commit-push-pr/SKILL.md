---
name: ce-commit-push-pr
description: Commit, push, and open a PR with an adaptive, value-first description. Use when the user says "commit and PR", "push and open a PR", "ship this", "create a PR", "open a pull request", "commit push PR", or wants to go from working changes to an open pull request in one step. Also use when the user says "update the PR description", "refresh the PR description", "freshen the PR", "rewrite the PR body", "write a PR description", "draft a PR description", or "describe this PR" — the skill will produce a description without committing or pushing if that is all the user wants. Produces PR descriptions that scale in depth with the complexity of the change, avoiding cookie-cutter templates.
---

# Git Commit, Push, and PR

**Asking the user:** When this skill says "ask the user", use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to presenting the question in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

## Mode

- **Description-only** — user wants *just* a description ("write/draft a PR description", "describe this PR", or pasted a PR URL/number alone). Run Step 4 only; print the result. Apply only if the user asks. If a PR ref was pasted, pass it to Step 4 so Pre-A resolves the right range.
- **Description update** — user wants to refresh/rewrite an existing PR's description with no commit/push intent. If no open PR, report and stop. Otherwise run Step 4 (PR mode using the existing PR's URL), then Step 5 to preview, confirm, and apply via `gh pr edit`.
- **Full workflow** — otherwise. Run Steps 1-5 in order.

## Context

**On platforms other than Claude Code**, run the Context fallback below. **In Claude Code**, the labeled sections contain pre-populated data — use them directly.

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

```bash
printf '=== STATUS ===\n'; git status; printf '\n=== DIFF ===\n'; git diff HEAD; printf '\n=== BRANCH ===\n'; git branch --show-current; printf '\n=== LOG ===\n'; git log --oneline -10; printf '\n=== DEFAULT_BRANCH ===\n'; git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo 'DEFAULT_BRANCH_UNRESOLVED'; printf '\n=== PR_CHECK ===\n'; gh pr view --json url,title,state 2>/dev/null || echo 'NO_OPEN_PR'
```

---

## Step 1: Resolve branch and PR state

The remote default branch returns something like `origin/main`; strip the `origin/` prefix. If it returned `DEFAULT_BRANCH_UNRESOLVED` or bare `HEAD`, try `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'`. If both fail, fall back to `main`.

Branch routing:

- **Detached HEAD** — explain a branch is required and ask whether to create a feature branch. If yes, derive a name from the change content. If no, stop.
- **On default branch with work to do** (uncommitted, unpushed, or no upstream) — ask whether to create a feature branch (pushing default directly is not supported). If yes, continue at Step 3 (which handles branch creation safely). If no, stop.
- **On default branch with no work** — report no feature branch work and stop.
- **Feature branch** — continue.

Note the existing PR URL from the PR check if `state: OPEN`. Step 5 uses it to route between new-PR and existing-PR application.

## Step 2: Determine conventions

Match repo style for commit messages and PR titles (project instructions in context > recent commits > conventional commits as default). With conventional commits, default to `fix:` over `feat:` when ambiguous — adding code to remedy broken or missing behavior is `fix:`. Reserve `feat:` for capabilities the user could not previously accomplish. The user may override.

## Step 3: Commit and push

If on the default branch, branch creation needs to handle stale local `<base>`, unpushed commits on local `<base>`, and uncommitted changes that collide with the fresh remote base. Read `references/branch-creation.md` and follow its decision flow before continuing.

Scan changed files for naturally distinct concerns. If they clearly group into separate logical changes, create separate commits (2-3 max). Group at file level only — no `git add -p`. When ambiguous, one commit is fine.

Stage and commit each group. **Avoid `git add -A` and `git add .`** — they sweep in `.env`, build artifacts, and generated files:

```bash
git add file1 file2 file3 && git commit -m "$(cat <<'EOF'
commit message here
EOF
)"
```

Then push:

```bash
git push -u origin HEAD
```

If the working tree is clean and all commits are already pushed, this step is a no-op.

## Step 4: Compose the PR title and body

**You MUST read `references/pr-description-writing.md`** and follow it from Pre-A onward. The only input it needs from this skill is the PR ref, if one was identified by mode dispatch (description-only with a pasted URL, or description update).

**Evidence decision** before composition. Two short-circuits, then the full decision:

1. **User explicitly asked for evidence** ("ship with a demo", "include a screenshot") — proceed directly to capture. If capture is impossible or clearly not useful, note briefly and proceed without.
2. **Agent judgment on authored changes** — if you authored the commits and know the change is non-observable (internal plumbing, type-only, backend refactor without user-facing effect, docs/markdown/changelog/CI/test-only, pure refactors), skip the prompt without asking.

Otherwise, if the branch diff changes observable behavior (UI, CLI output, API behavior with runnable code, generated artifacts, workflow output) and evidence is not blocked (unavailable credentials, paid services, deploy-only infrastructure, hardware), ask: "This PR has observable behavior. Capture evidence for the PR description?"

- **Capture now** — load `ce-demo-reel` with a target description from the branch diff. It returns `Tier`, `Description`, `URL`, `Path`. Exactly one of `URL`/`Path` contains a real value; the other is `"none"`. If `URL`, splice as a `## Demo` section. If `Path` (user chose local save), note in the body that a demo was recorded but is not embedded. If skipped, proceed without evidence.
- **Use existing evidence** — ask for the URL or markdown embed; splice as a `## Demo` section.
- **Skip** — proceed without an evidence section.

Then continue with the rest of the reference (Steps A through G) to compose the title and body.

## Step 5: Apply and report

**Description-only mode** — print the title and body. Stop unless the user asks to apply.

**New PR** (full workflow, no existing PR from Step 1) — apply per "Applying via gh" below using `gh pr create`. Report the URL.

**Existing PR** (full workflow, found in Step 1) — the new commits are already on the PR from Step 3. Report the PR URL, then ask whether to rewrite the description.

- **No** — done.
- **Yes** — run Step 4 if not already done, then preview and apply (see below).

**Description update mode, or existing-PR rewrite confirmed** — preview before applying. Ask: "New title: `<title>` (`<N>` chars). Summary leads with: `<first two sentences>`. Total body: `<L>` lines. Apply?" If declined, the user may pass focus text back for a regenerate; do not apply. If confirmed, apply per "Applying via gh" below using `gh pr edit` and report the URL.

---

## Applying via gh

The body **must** be written to a temp file and passed via `--body-file <path>`. Never use `--body-file -`, stdin pipes, heredoc-to-stdin, or `--body "$(cat ...)"` — wrappers and stdin handling can silently produce an empty PR body while `gh` still exits 0 and returns a URL.

```bash
BODY_FILE=$(mktemp "${TMPDIR:-/tmp}/ce-pr-body.XXXXXX") && cat > "$BODY_FILE" <<'__CE_PR_BODY_END__'
<the composed body markdown goes here, verbatim>
__CE_PR_BODY_END__
```

The quoted sentinel keeps `$VAR`, backticks, and any literal `EOF` inside the body from being expanded.

For `<TITLE>`: substitute verbatim. If it contains `"`, `` ` ``, `$`, or `\`, escape them or switch to single quotes.

```bash
gh pr create --title "<TITLE>" --body-file "$BODY_FILE"   # new PR
gh pr edit   --title "<TITLE>" --body-file "$BODY_FILE"   # existing PR
```
