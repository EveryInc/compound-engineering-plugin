---
name: todo-resolve
description: Use when batch-resolving approved todos, especially after code review or triage sessions
argument-hint: "[optional: specific todo ID or pattern]"
---

Resolve approved todos using parallel processing, document lessons learned, then clean up.

## Workflow

### 1. Analyze

Get all unresolved todos from `.context/compound-engineering/todos/*.md` and legacy `todos/*.md`.

Residual actionable work may come from `ce:review-beta mode:autonomous` after its `safe_auto` pass. Treat those todos as normal unresolved items.

If any todo recommends deleting, removing, or gitignoring files in `docs/brainstorms/`, `docs/plans/`, or `docs/solutions/`, skip it and mark as `wont_fix`. These are intentional pipeline artifacts.

### 2. Plan

Create a task list grouped by type (e.g., `TaskCreate` in Claude Code, `update_plan` in Codex). Analyze dependencies -- items that others depend on run first. Output a mermaid diagram showing execution order and parallelism.

### 3. Implement (PARALLEL)

Spawn a `compound-engineering:workflow:pr-comment-resolver` agent per item. Prefer parallel; fall back to sequential respecting dependency order.

**Batching:** 1-4 items: direct parallel returns. 5+ items: batches of 4, each returning only a short status summary (todo handled, files changed, tests run/skipped, blockers).

For large sets, use a scratch directory at `.context/compound-engineering/todo-resolve/<run-id>/` for per-resolver artifacts. Return only completion summaries to parent.

### 4. Commit & Resolve

Commit changes, mark todos resolved, push to remote.

GATE: STOP. Verify todos resolved and changes committed before proceeding.

### 5. Compound on Lessons Learned

Load the `ce:compound` skill to document what was learned. Todo resolutions often surface patterns and architectural insights worth capturing.

GATE: STOP. Verify the compound skill produced a solution document in `docs/solutions/`. If none (user declined or no learnings), continue.

### 6. Clean Up

Delete completed/resolved todo files from both paths. If a scratch directory was created at `.context/compound-engineering/todo-resolve/<run-id>/`, delete it (unless user asked to inspect).

```
Todos resolved: [count]
Lessons documented: [path to solution doc, or "skipped"]
Todos cleaned up: [count deleted]
```
