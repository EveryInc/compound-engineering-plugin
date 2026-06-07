---
name: ce-worktree
description: Create an isolated git worktree for parallel feature work or PR review. Use when starting work that should not disturb the current checkout, or when `ce-work` or `ce-code-review` offers a worktree option.
allowed-tools: Bash(bash *worktree-manager.sh)
---

# Worktree Creation

Create a worktree under `.worktrees/<branch>` with branch-specific setup `git worktree add` does not handle:

- Copies `.env`, `.env.local`, `.env.test`, etc. from the main repo (skips `.env.example`)
- Trusts `mise`/`direnv` configs, with branch-aware safety rules so review branches do not auto-grant trust to untrusted `.envrc` content
- Adds `.worktrees` to `.gitignore` if not already ignored
- Leaves the main repo checkout untouched: `from-branch` is fetched, not checked out

## Creating a worktree

Invoke the bundled script via the runtime Bash tool. On Claude Code, `${CLAUDE_SKILL_DIR}` resolves to the skill's own directory across marketplace-cached installs and `claude --plugin-dir` development; the runtime Bash tool's CWD is the user's project, so a bare `bash scripts/worktree-manager.sh` fails. On other targets (Codex, Gemini, Pi) `${CLAUDE_SKILL_DIR}` is unset and the `:-.` fallback yields the bare relative path those harnesses expect.

```bash
bash "${CLAUDE_SKILL_DIR:-.}/scripts/worktree-manager.sh" create <branch-name> [from-branch]
```

Defaults:
- `from-branch` defaults to origin's default branch (or `main` if that cannot be resolved)
- The new branch is created at `origin/<from-branch>` (or the local ref if the remote is unavailable)

Examples:
```bash
bash "${CLAUDE_SKILL_DIR:-.}/scripts/worktree-manager.sh" create feat/login
bash "${CLAUDE_SKILL_DIR:-.}/scripts/worktree-manager.sh" create fix/email-validation develop
```

After creation, switch to the worktree with `cd .worktrees/<branch-name>`.

## Other worktree operations

Use `git` directly. No wrapper is needed or provided:

```bash
git worktree list                          # list worktrees
git worktree remove .worktrees/<branch>    # remove a worktree
cd .worktrees/<branch>                     # switch to a worktree
cd "$(git rev-parse --show-toplevel)"      # return to main checkout
```

To copy `.env*` files into an existing worktree created without them, run this from the main repo, not from inside the worktree (branch names often contain slashes like `feat/login`):
```bash
cp .env* .worktrees/<branch>/
```

## Dev tool trust behavior

When mise or direnv configs are present, the script trusts them so hooks and scripts do not block on interactive prompts. Trust is baseline-checked against a reference branch:

- **Trusted base branches** (`main`, `develop`, `dev`, `trunk`, `staging`, `release/*`): configs are compared against that branch; unchanged configs are auto-trusted, and `direnv allow` is permitted.
- **Other branches** (feature, PR review): configs are compared against the default branch; `direnv allow` is skipped regardless, because `.envrc` can source files direnv does not validate.

Modified configs are never auto-trusted. The script prints the manual trust command to run after review.

## When to create a worktree

Create a worktree when:
- Reviewing a PR while keeping the main checkout free for other work
- Running multiple features in parallel without branch-switching overhead
- Keeping the default branch free of in-progress state

Do not create a worktree for single-task work that can happen on a branch in the main checkout.

## Integration

`ce-work` and `ce-code-review` offer this skill as an option. When the user selects "worktree" in those flows, invoke `bash "${CLAUDE_SKILL_DIR:-.}/scripts/worktree-manager.sh" create <branch>` with a meaningful branch name derived from the work (e.g., `feat/crowd-sniff`, `fix/email-validation`). Avoid auto-generated names like `worktree-jolly-beaming-raven` that obscure the work.

## Troubleshooting

**"Worktree already exists"**: the path is in use. Switch to it (`cd .worktrees/<branch>`) or remove it (`git worktree remove .worktrees/<branch>`) before recreating.

**"Cannot remove worktree: it is the current worktree"**: `cd` out of the worktree first, then `git worktree remove`.

**Dev tool trust was skipped**: the script prints the manual command. Review the config diff (`git diff <base-ref> -- .envrc`), then run the printed command from the worktree directory.
