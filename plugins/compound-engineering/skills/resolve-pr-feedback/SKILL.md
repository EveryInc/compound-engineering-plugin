---
name: resolve-pr-feedback
description: Resolve PR review feedback by evaluating validity and fixing issues in parallel. Use when addressing PR review comments, resolving review threads, or fixing code review feedback.
argument-hint: "[PR number, comment URL, or blank for current branch's PR]"
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(git *), Read
---

# Resolve PR Review Feedback

Evaluate and fix PR review feedback, then reply and resolve threads. Spawns parallel agents for each thread.

> **Agent time is cheap. Tech debt is expensive.**
> Fix everything valid -- including nitpicks and low-priority items. If we're already in the code, fix it rather than punt it.

## Mode Detection

| Argument | Mode |
|----------|------|
| No argument | **Full** -- all unresolved threads on the current branch's PR |
| PR number (e.g., `123`) | **Full** -- all unresolved threads on that PR |
| Comment/thread URL | **Targeted** -- only that specific thread |

**Targeted mode**: When a URL is provided, ONLY address that feedback. Do not fetch or process other threads.

---

## Full Mode

### 1. Fetch Unresolved Threads

If no PR number was provided, detect from the current branch:
```bash
gh pr view --json number -q .number
```

Then fetch all feedback using the GraphQL script at [scripts/get-pr-comments](scripts/get-pr-comments):

```bash
bash scripts/get-pr-comments PR_NUMBER
```

Returns a JSON object with three keys:

| Key | Contents | Has file/line? | Resolvable? |
|-----|----------|---------------|-------------|
| `review_threads` | Unresolved, non-outdated inline code review threads | Yes | Yes (GraphQL) |
| `pr_comments` | Top-level PR conversation comments (excludes PR author) | No | No |
| `review_bodies` | Review submission bodies with non-empty text (excludes PR author) | No | No |

If the script fails, fall back to:
```bash
gh pr view PR_NUMBER --json reviews,comments
gh api repos/{owner}/{repo}/pulls/PR_NUMBER/comments
```

### 2. Triage: Separate New from Pending

Before processing, classify each piece of feedback as **new** or **already handled**.

**Review threads**: Read the thread's comments. If there's a substantive reply that acknowledges the concern but defers action (e.g., "need to align on this", "going to think through this", or a reply that presents options without resolving), it's a **pending decision** -- don't re-process. If there's only the original reviewer comment(s) with no substantive response, it's **new**.

**PR comments and review bodies**: These have no resolve mechanism, so they reappear on every run. Check the PR conversation for an existing reply that quotes and addresses the feedback. If a reply already exists, skip. If not, it's new.

The distinction is about content, not who posted what. A deferral from a teammate, a previous skill run, or a manual reply all count.

If there are no new items across all feedback types, skip steps 3-7 and go straight to step 8.

### 3. Plan

Create a task list of all **new** unresolved items grouped by type (e.g., `TaskCreate` in Claude Code, `update_plan` in Codex):
- Code changes requested
- Questions to answer
- Style/convention fixes
- Test additions needed

### 4. Implement (PARALLEL)

Process all three feedback types. Review threads are the primary type; PR comments and review bodies are secondary but should not be ignored.

**For review threads** (`review_threads`): Spawn a `compound-engineering:workflow:pr-comment-resolver` agent for each.

Each agent receives:
- The thread ID
- The file path and line number
- The full comment text (all comments in the thread)
- The PR number (for context)
- The feedback type (`review_thread`)

**For PR comments and review bodies** (`pr_comments`, `review_bodies`): These lack file/line context. Spawn a `compound-engineering:workflow:pr-comment-resolver` agent for each actionable item. The agent receives the comment ID, body text, PR number, and feedback type (`pr_comment` or `review_body`). The agent must identify the relevant files from the comment text and the PR diff.

Each agent returns a short summary:
- **verdict**: `fixed`, `fixed-differently`, `replied`, `not-addressing`, or `needs-human`
- **feedback_id**: the thread ID or comment ID it handled
- **feedback_type**: `review_thread`, `pr_comment`, or `review_body`
- **reply_text**: the markdown reply to post (quoting the relevant part of the original feedback)
- **files_changed**: list of files modified (empty if replied/not-addressing)
- **reason**: brief explanation of what was done or why it was skipped

Verdict meanings:
- `fixed` -- code change made as requested
- `fixed-differently` -- code change made, but with a better approach than suggested
- `replied` -- no code change needed; answered a question, acknowledged feedback, or explained a design decision
- `not-addressing` -- feedback is factually wrong about the code; skip with evidence
- `needs-human` -- cannot determine the right action; needs user decision

**Batching**: If there are 1-4 items total, dispatch all in parallel. For 5+ items, batch in groups of 4.

**Conflict avoidance**: If multiple threads reference the same file, group them into a single agent dispatch to avoid parallel edit conflicts. The agent handling a multi-thread file receives all threads for that file and addresses them sequentially.

Fixes can occasionally expand beyond their referenced file (e.g., renaming a method updates callers elsewhere). This is rare but can cause parallel agents to collide. The verification step (step 7) catches this -- if re-fetching shows unresolved threads or if the commit reveals inconsistent changes, re-run the affected agents sequentially.

Platforms that do not support parallel dispatch should run agents sequentially.

### 5. Commit and Push

After all agents complete, check whether any files were actually changed. If all verdicts are `replied`, `not-addressing`, or `needs-human` (no code changes), skip this step entirely and proceed to step 6.

If there are file changes:

1. Stage only files reported by sub-agents and commit with a message referencing the PR:

```bash
git add [files from agent summaries]
git commit -m "Address PR review feedback (#PR_NUMBER)

- [list changes from agent summaries]"
```

2. Push to remote:
```bash
git push
```

### 6. Reply and Resolve

After the push succeeds, post replies and resolve where applicable. The mechanism depends on the feedback type.

#### Reply format

All replies should quote the relevant part of the original feedback for continuity. Quote the specific sentence or passage being addressed, not the entire comment if it's long.

For fixed items:
```markdown
> [quoted relevant part of original feedback]

Addressed: [brief description of the fix]
```

For items not addressed:
```markdown
> [quoted relevant part of original feedback]

Not addressing: [reason with evidence, e.g., "null check already exists at line 85"]
```

For `needs-human` verdicts, post the reply but do NOT resolve the thread. Leave it open for human input.

#### Review threads

1. **Reply** using [scripts/reply-to-pr-thread](scripts/reply-to-pr-thread):
```bash
echo "REPLY_TEXT" | bash scripts/reply-to-pr-thread THREAD_ID
```

2. **Resolve** using [scripts/resolve-pr-thread](scripts/resolve-pr-thread):
```bash
bash scripts/resolve-pr-thread THREAD_ID
```

#### PR comments and review bodies

These cannot be resolved via GitHub's API. Reply with a top-level PR comment referencing the original:

```bash
gh pr comment PR_NUMBER --body "REPLY_TEXT"
```

Include enough quoted context in the reply so the reader can follow which comment is being addressed without scrolling.

### 7. Verify

Re-fetch feedback to confirm resolution:

```bash
bash scripts/get-pr-comments PR_NUMBER
```

The `review_threads` array should be empty (except `needs-human` items). If threads remain, repeat from step 1 for the remaining threads.

PR comments and review bodies have no resolve mechanism, so they will still appear in the output. Verify they were replied to by checking the PR conversation.

### 8. Summary

Present a concise summary of all work done. Group by verdict, one line per item describing *what was done* not just *where*. This is the primary output the user sees.

Format:

```
Resolved N of M new items on PR #NUMBER:

Fixed (count): [brief description of each fix]
Fixed differently (count): [what was changed and why the approach differed]
Replied (count): [what questions were answered]
Not addressing (count): [what was skipped and why]
```

If any agent returned `needs-human`, append a decisions section. These are rare but high-signal. Each `needs-human` agent returns a `decision_context` field with a structured analysis: what the reviewer said, what the agent investigated, why it needs a decision, concrete options with tradeoffs, and the agent's lean if it has one.

Present the `decision_context` directly -- it's already structured for the user to read and decide quickly:

```
Needs your input (count):

1. [decision_context from the agent -- includes quoted feedback,
   investigation findings, why it needs a decision, options with
   tradeoffs, and the agent's recommendation if any]
```

The `needs-human` threads already have a natural-sounding acknowledgment reply posted and remain open on the PR.

If there are **pending decisions from a previous run** (threads detected in step 2 as already responded to but still unresolved), surface them after the new work:

```
Still pending from a previous run (count):

1. [Thread path:line] -- [brief description of what's pending]
   Previous reply: [link to the existing reply]
   [Re-present the decision options if the original context is available,
   or summarize what was asked]
```

If a blocking question tool is available, use it to ask about all pending decisions (both new `needs-human` and previous-run pending) together. If there are only pending decisions and no new work was done, the summary is just the pending items.

If a blocking question tool is available (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini), use it to present the decisions and wait for the user's response. After they decide, process the remaining items: fix the code, compose the reply, post it, and resolve the thread.

If no question tool is available, present the decisions in the summary output and wait for the user to respond in conversation. If they don't respond, the items remain open on the PR for later handling.

---

## Targeted Mode

When a specific comment or thread URL is provided:

### 1. Extract Thread Context

Parse the URL to extract OWNER, REPO, PR number, and comment REST ID:
```
https://github.com/OWNER/REPO/pull/NUMBER#discussion_rCOMMENT_ID
```

**Step 1** -- Get comment details and GraphQL node ID via REST (cheap, single comment):
```bash
gh api repos/OWNER/REPO/pulls/comments/COMMENT_ID \
  --jq '{node_id, path, line, body}'
```

**Step 2** -- Map comment to its thread ID. Use [scripts/get-thread-for-comment](scripts/get-thread-for-comment):
```bash
bash scripts/get-thread-for-comment PR_NUMBER COMMENT_NODE_ID [OWNER/REPO]
```

This fetches thread IDs and their first comment IDs (minimal fields, no bodies) and returns the matching thread with full comment details.

### 2. Fix, Reply, Resolve

Spawn a single `compound-engineering:workflow:pr-comment-resolver` agent for the thread. Then follow the same commit -> push -> reply -> resolve flow as Full Mode steps 5-6.

---

## Scripts

- [scripts/get-pr-comments](scripts/get-pr-comments) -- GraphQL query for unresolved review threads
- [scripts/get-thread-for-comment](scripts/get-thread-for-comment) -- Map a comment node ID to its parent thread (for targeted mode)
- [scripts/reply-to-pr-thread](scripts/reply-to-pr-thread) -- GraphQL mutation to reply within a review thread
- [scripts/resolve-pr-thread](scripts/resolve-pr-thread) -- GraphQL mutation to resolve a thread by ID

## Success Criteria

- All unresolved review threads evaluated
- Valid fixes committed and pushed
- Each thread replied to with quoted context
- Threads resolved via GraphQL (except `needs-human`)
- Empty result from get-pr-comments on verify (minus intentionally-open threads)
