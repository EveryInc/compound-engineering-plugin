---
name: ce-commit
description: Create a git commit with a clear, value-communicating message. Use when the user asks to commit/save staged or unstaged changes with a repo-appropriate message.
---

# Git Commit

Create well-crafted local commit(s) from the current working tree. No push, no PR — use `ce-commit-push-pr` for the full ship flow.

**Done when:** each logical change is committed with an explicit file list and a message that states the outcome, and `git status` is clean of those changes. **Stop when:** the tree is clean (nothing to commit).

## Context

Gather context with each command as its **own** shell tool call (program + args only). Do **not** join with `;`, `&&`, `||`, pipes, `$(...)`, or redirects — that syntax fails under Windows PowerShell. A non-zero exit is a normal state to interpret, not a failure to suppress.

| Command | Purpose | Non-zero / empty means |
| --- | --- | --- |
| `git status` | Working-tree state | Not a git repo — stop |
| `git diff HEAD` | Uncommitted changes | Unborn repo / no commits yet |
| `git branch --show-current` | Current branch | Empty = detached HEAD |
| `git log --oneline -10` | Recent message style | Unborn repo — no history |
| `git rev-parse --abbrev-ref origin/HEAD` | Remote default branch | No `origin/HEAD` / bare `HEAD` — try `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'`, else `main` |

Treat this as a snapshot. Re-read branch and staged set immediately before committing if anything may have changed.

**Default branch name:** strip a leading `origin/` from `origin/HEAD` (so `origin/trunk` → `trunk`). Use that bare name for all “on the default branch?” checks — never compare against `origin/<name>`.

## Workflow

0. **Gather** — run every Context command above (own shell call each), then continue.

1. **Nothing to commit** — if `git status` shows no staged, modified, or untracked files, report that and stop. Do not use `git diff HEAD` alone as cleanliness (it misses untracked files).

2. **Branch first** — if detached HEAD, or on the default branch (`main` / `master` / the bare default name above), create a feature branch from the change content (`git checkout -b <name>`), then re-read `git branch --show-current`. Do not ask — commit-only still must not leave work only on a detached HEAD or the default branch. If the derived name exists, pick a non-conflicting suffix.

3. **Convention** — match project commit conventions already in context; else match the recent log pattern; else conventional commits (`type(scope): description`). When using conventional commits and `fix`/`feat` both fit, default to `fix:` (remedying broken or missing behavior); reserve `feat:` for new capabilities. User override wins.

4. **Logical commits** — if changed files clearly split into distinct concerns, make separate commits (file level only, 2–3 max, no `git add -p`). If ambiguous, one commit.

5. **Message** — subject is imperative and names the outcome (what is now possible or fixed), not the file list. Body only when motivation or trade-offs are not obvious from the subject. When a plan Implementation Unit ID is already in hand for this commit (conversation, caller, or the files belong to one unit), append that unit's U-ID in parentheses — `(U3)` means unit 3. Do not hunt for a plan. Omit when the commit spans units, the unit is unclear, or no plan is in hand.

   - Bad: `Update checkout.rb` / `Add tests and fix stuff`
   - Good: `Fix double-submit on checkout`
   - Good: `Add per-subscription mute (U3)`

6. **Stage and commit** — stage **named files only** (never `git add -A` or `git add .`). Honor `exclude:<paths>` when the invocation carries it: those files stay uncommitted no matter what else changed; say in the report that they were left out. Prefer one shell call per commit group:

```bash
git add file1 file2 file3 && git commit -m "$(cat <<'EOF'
type(scope): subject line here

Optional body when the why is not obvious from the subject.
EOF
)" -- file1 file2 file3
```

The trailing path list on `git commit` is load-bearing: a bare `git commit` takes the whole index, so anything already staged before this run (a caller's `exclude:` paths, or work the user staged and did not name) would ride into the commit. Naming the paths commits exactly the group and leaves other index entries alone.

7. **Confirm** — `git status`; report hash(es) and subject(s).
