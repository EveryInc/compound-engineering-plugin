---
name: resolve_pr_parallel
description: Resolve all PR comments using parallel processing
argument-hint: "[optional: PR number or current PR]"
---

Resolve all PR comments using parallel processing.

Claude Code automatically detects and understands your git context:

- Current branch detection
- Associated PR context
- All PR comments and review threads
- Can work with any PR by specifying the PR number, or ask it.

## Workflow

### 1. Analyze

Get all unresolved comments for the PR:

```bash
# Get PR status and context
gh pr status

# Get review comments (inline code comments)
gh api repos/{owner}/{repo}/pulls/PR_NUMBER/comments

# Get reviews with their bodies
gh pr view PR_NUMBER --json reviews,comments
```

### 2. Plan

Create a TodoWrite list of all unresolved items grouped by type.

### 3. Implement (PARALLEL)

Spawn a pr-comment-resolver agent for each unresolved item in parallel.

So if there are 3 comments, spawn 3 pr-comment-resolver agents in parallel:

1. Task pr-comment-resolver(comment1)
2. Task pr-comment-resolver(comment2)
3. Task pr-comment-resolver(comment3)

Always run all in parallel subagents/Tasks for each Todo item.

### 4. Commit & Push

- Commit changes with a clear message referencing the PR feedback
- Push to remote

### 5. Verify

Re-fetch comments to confirm all feedback has been addressed:

```bash
gh api repos/{owner}/{repo}/pulls/PR_NUMBER/comments
```

If any comments remain unaddressed, repeat the process from step 1.
