---
name: ce-commit
description: Create a git commit with a clear, value-communication message. Use when the user asks to commit/save staged or unstaged changes with a repo-appropriate, value-communicating message.
---

# Git Commit

Commit the current working-tree changes.

## Context

Gather the working-tree context by running each command below as its **own** shell tool call — a single argv-style invocation (just the program and its arguments). Do **not** join them with `;`, `&&`, `||`, pipes, `$(...)`, or redirects like `2>/dev/null`: that syntax parses only under POSIX shells and aborts under Windows PowerShell. Read each command's exit status directly — a non-zero exit is a normal state to interpret, not a failure to suppress.

| Command | Purpose | Non-zero exit / empty output means |
| --- | --- | --- |
| `git status` | Working-tree state | Not a git repository — report and stop |
| `git diff HEAD` | Uncommitted changes | Unborn repo with no commits yet — treat every tracked change as new |
| `git branch --show-current` | Current branch | Empty output = detached HEAD |
| `git log --oneline -10` | Recent commit style | Unborn repo — no history to match yet |
| `git rev-parse --abbrev-ref origin/HEAD` | Remote default branch | No `origin/HEAD` set — resolve the default branch as below |

These values are a snapshot taken before any action. Re-read anything consequential (the current branch, the staged set) immediately before committing, since the working tree can change between gathering context and acting on it.

**Default branch.** The remote default branch value returns something like `origin/main`; strip the `origin/` prefix. If that command exited non-zero (no `origin/HEAD` set) or returned a bare `HEAD`, try `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'`. If both fail, fall back to `main`.

**Clean tree.** If `git status` shows a clean working tree (no staged, modified, or untracked files), report that there is nothing to commit and stop.

**Detached HEAD** (empty current branch). A branch is required to attach this work: say so and ask whether to create one, using the platform's blocking-question tool (`AskUserQuestion` on Claude Code, `request_user_input` on Codex, or whatever equivalent the harness exposes; present the options in chat if it has none). With no user available (non-interactive run), create the branch and report it rather than skipping the decision. To create it: derive the name from the change content, run `git checkout -b <branch-name>`, then run `git branch --show-current` again and use that result as the current branch for the rest of the workflow. If the user declines, continue with the detached HEAD commit.

## Message convention

Follow the commit convention in the project's active instructions already in your context — do not re-read those files; they are loaded at session start. Otherwise match the pattern in the 10 most recent commits (conventional commits, ticket prefixes, emoji prefixes). Otherwise use `type(scope): description`, where type is one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`, `style`, `build`.

Where `fix:` and `feat:` both seem to fit, default to `fix:`: a change that remedies broken or missing behavior is `fix:` even when implemented by adding code. Reserve `feat:` for capabilities the user could not previously accomplish. Other types remain primary when they fit better. The user may override for a specific change.

## Splitting

Split into separate commits only when the changed files group into clearly unrelated concerns. Group at the **file level only** — do not use `git add -p` or split hunks within a file. Two or three commits is the ceiling, not a target; if the separation is ambiguous, make one commit.

## Stage and commit

If the current branch is `main`, `master`, or the resolved default branch, automatically create a feature branch before committing: derive the branch name from the change content, create it with `git checkout -b <branch-name>`, run `git branch --show-current` to confirm, and use the new branch as the current branch for the rest of the workflow. Do not ask whether to branch — committing on the default branch is not an option here.

Subject line: follow the convention above. Add a body, separated by a blank line, only when a future reader needs the motivation or trade-off; omit it for obvious single-purpose changes.

For each commit group, stage and commit in a single call. Prefer staging specific files by name over `git add -A` or `git add .` to avoid accidentally including sensitive files (.env, credentials) or unrelated changes.

```bash
git add file1 file2 file3 && git commit -m "$(cat <<'EOF'
type(scope): subject line here

Optional body explaining why this change was made,
not just what changed.
EOF
)"
```

Report the commit hash(es) and subject line(s).
