---
name: ce-commit
description: Create a git commit with a clear, value-communication message. Use when the user asks to commit/save staged or unstaged changes with a repo-appropriate, value-communicating message.
---

# Git Commit

Create a single, well-crafted git commit from the current working tree changes.

## Context

Gather the working-tree context by running each command below as its **own** shell tool call — a single argv-style invocation (just the program and its arguments). Do **not** join them with `;`, `&&`, `||`, pipes, `$(...)`, or redirects like `2>/dev/null`: that syntax parses only under POSIX shells and aborts under Windows PowerShell. Read each command's exit status directly — a non-zero exit is a normal state to interpret, not a failure to suppress.

| Command | Purpose | Non-zero exit / empty output means |
| --- | --- | --- |
| `git status` | Working-tree state | Not a git repository — report and stop |
| `git diff HEAD` | Uncommitted changes | Unborn repo with no commits yet — treat every tracked change as new |
| `git branch --show-current` | Current branch | Empty output = detached HEAD |
| `git log --oneline -10` | Recent commit style | Unborn repo — no history to match yet |
| `git rev-parse --abbrev-ref origin/HEAD` | Remote default branch | No `origin/HEAD` set — resolve the default branch per Step 1 |

These values are a snapshot taken before any action. Re-read anything consequential (the current branch, the staged set) immediately before committing, since the working tree can change between gathering context and acting on it.

---

## Workflow

### Step 1: Gather context

Run the commands from the **Context** section above (git status, working tree diff, current branch, recent commits, remote default branch), each as its own shell tool call.

The remote default branch value returns something like `origin/main`. Strip the `origin/` prefix to get the branch name. If that command exited non-zero (no `origin/HEAD` set) or returned a bare `HEAD`, try:

```bash
gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
```

If both fail, fall back to `main`.

If `git status` shows a clean working tree (no staged, modified, or untracked files), report that there is nothing to commit and stop.

If the current branch is empty, the repository is in detached HEAD state. Explain that a branch is required before committing if the user wants this work attached to a branch. Ask whether to create a feature branch now. Use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to presenting options in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

- If the user chooses to create a branch, derive the name from the change content, create it with `git checkout -b <branch-name>`, then run `git branch --show-current` again and use that result as the current branch name for the rest of the workflow.
- If the user declines, continue with the detached HEAD commit.

### Step 2: Determine commit message convention

Follow this priority order:

1. **Repo conventions already in context** -- If project instructions (AGENTS.md, CLAUDE.md, or similar) are already loaded and specify commit message conventions, follow those. Do not re-read these files; they are loaded at session start.
2. **Recent commit history** -- If no explicit convention is documented, examine the 10 most recent commits from Step 1. If a clear pattern emerges (e.g., conventional commits, ticket prefixes, emoji prefixes), match that pattern.
3. **Default: conventional commits** -- If neither source provides a pattern, use conventional commit format: `type(scope): description` where type is one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`, `style`, `build`.

When using conventional commits, choose the type that most precisely describes the change (the type list above). Where `fix:` and `feat:` both seem to fit, default to `fix:`: a change that remedies broken or missing behavior is `fix:` even when implemented by adding code. Reserve `feat:` for capabilities the user could not previously accomplish. Other types remain primary when they fit better. The user may override for a specific change.

### Step 3: Consider logical commits

Before staging everything together, scan the changed files for naturally distinct concerns. If modified files clearly group into separate logical changes (e.g., a refactor in one directory and a new feature in another, or test files for a different change than source files), create separate commits for each group.

Keep this lightweight:
- Group at the **file level only** -- do not use `git add -p` or try to split hunks within a file.
- If the separation is obvious (different features, unrelated fixes), split. If it's ambiguous, one commit is fine.
- Two or three logical commits is the sweet spot. Do not over-slice into many tiny commits.

### Step 4: Stage and commit

If the current branch from the context above is `main`, `master`, or the resolved default branch from Step 1, automatically create a feature branch before committing. Derive the branch name from the change content, create it with `git checkout -b <branch-name>`, run `git branch --show-current` to confirm, and use the new branch as the current branch for the rest of the workflow. Do not ask whether to branch — committing on the default branch is not an option here.

Write the commit message:
- **Subject line**: Concise, imperative mood, focused on *why* not *what*. Follow the convention determined in Step 2.
- **Body** (when needed): Add a body separated by a blank line for non-trivial changes. Explain motivation, trade-offs, or anything a future reader would need. Omit the body for obvious single-purpose changes.

For each commit group, stage and commit in a single call. Prefer staging specific files by name over `git add -A` or `git add .` to avoid accidentally including sensitive files (.env, credentials) or unrelated changes. Use a heredoc to preserve formatting:

```bash
git add file1 file2 file3 && git commit -m "$(cat <<'EOF'
type(scope): subject line here

Optional body explaining why this change was made,
not just what changed.
EOF
)"
```

### Step 5: Confirm

Run `git status` after the commit to verify success. Report the commit hash(es) and subject line(s).
