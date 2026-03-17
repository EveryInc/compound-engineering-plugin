---
name: resolve-todos-fully
description: Resolve todos in parallel, compound on lessons learned, then clean up completed todos. Use after code review to close the resolve-learn-cleanup loop.
argument-hint: "[optional: specific todo ID or pattern]"
disable-model-invocation: true
---

Orchestrate the full todo lifecycle: resolve in parallel, document lessons learned, then delete completed todos.

## Workflow

CRITICAL: Execute every step below IN ORDER. Do not skip any step.

### 1. Resolve Todos

Run `/compound-engineering:resolve_todo_parallel $ARGUMENTS`

Wait for all todos to be resolved and committed before proceeding.

GATE: STOP. Verify that todos have been resolved and changes committed. Do NOT proceed to step 2 if no todos were resolved.

### 2. Compound on Lessons Learned

Run `/ce:compound` to document what was learned from resolving the todos.

The todo resolutions often surface patterns, recurring issues, or architectural insights worth capturing. This step ensures that knowledge compounds rather than being lost.

GATE: STOP. Verify that `/ce:compound` produced a solution document in `docs/solutions/`. If no document was created (user declined or no non-trivial learnings), continue to step 3.

### 3. Clean Up Completed Todos

Delete all todos with `done` or `resolved` status. Use the TaskList tool to identify completed todos, then remove them to keep the todo list clean and actionable.

After cleanup, output a summary:

```
Todos resolved: [count]
Lessons documented: [path to solution doc, or "skipped"]
Todos cleaned up: [count deleted]
```

## Routes To

- `resolve_todo_parallel` skill (step 1)
- `ce:compound` skill (step 2)
