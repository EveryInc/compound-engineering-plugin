---
name: resolve-pr-parallel
description: Resolve all PR comments using parallel processing. Use when addressing PR review feedback, resolving review threads, or batch-fixing PR comments.
argument-hint: "[optional: PR number or current PR]"
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(git *), Read
---

# Resolve PR Comments in Parallel

Resolve all unresolved PR review comments by spawning parallel agents for each thread.

## Context Detection

Detect git context from the current working directory:
- Current branch and associated PR
- All PR comments and review threads
- Works with any PR by specifying the number

## Workflow

### 1. Analyze

Fetch unresolved review threads using the GraphQL script at [scripts/get-pr-comments](scripts/get-pr-comments):

```bash
bash scripts/get-pr-comments PR_NUMBER
```

This returns only **unresolved, non-outdated** threads with file paths, line numbers, and comment bodies.

If the script fails, fall back to:
```bash
gh pr view PR_NUMBER --json reviews,comments
gh api repos/{owner}/{repo}/pulls/PR_NUMBER/comments
```

### 2. Plan

Create a task list of all unresolved items grouped by type (e.g., `TaskCreate` in Claude Code, `update_plan` in Codex):
- Code changes requested
- Questions to answer
- Style/convention fixes
- Test additions needed

### 3. Implement (PARALLEL)

Spawn a `compound-engineering:workflow:pr-comment-resolver` agent for each unresolved item.

If there are 3 comments, spawn 3 agents — one per comment. Prefer running all agents in parallel; if the platform does not support parallel dispatch, run them sequentially.

Keep parent-context pressure bounded:
- If there are 1-4 unresolved items, direct parallel returns are fine
- If there are 5+ unresolved items, launch in batches of at most 4 agents at a time
- Require each resolver agent to return a short status summary to the parent: comment/thread handled, files changed, tests run or skipped, any blocker that still needs human attention, and for question-only threads the substantive reply text so the parent can post or verify it

If the PR is large enough that even batched short returns are likely to get noisy, use a per-run scratch directory such as `.context/compound-engineering/resolve-pr-parallel/<run-id>/`:
- Have each resolver write a compact artifact for its thread there
- Return only a completion summary to the parent
- Re-read only the artifacts that are needed to resolve threads, answer reviewer questions, or summarize the batch

### 4. Commit & Resolve

- Commit changes with a clear message referencing the PR feedback
- Resolve each thread programmatically using [scripts/resolve-pr-thread](scripts/resolve-pr-thread):

```bash
bash scripts/resolve-pr-thread THREAD_ID
```

- Push to remote

### 5. Verify

Re-fetch comments to confirm all threads are resolved:

```bash
bash scripts/get-pr-comments PR_NUMBER
```

Should return an empty array `[]`. If threads remain, repeat from step 1.

If a scratch directory was used and the user did not ask to inspect it, clean it up after verification succeeds.

## Scripts

- [scripts/get-pr-comments](scripts/get-pr-comments) - GraphQL query for unresolved review threads
- [scripts/resolve-pr-thread](scripts/resolve-pr-thread) - GraphQL mutation to resolve a thread by ID

## Success Criteria

- All unresolved review threads addressed
- Changes committed and pushed
- Threads resolved via GraphQL (marked as resolved on GitHub)
- Empty result from get-pr-comments on verify
