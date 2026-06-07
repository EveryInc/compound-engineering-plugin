---
name: ce-subagent-driven
description: "Execute a plan or multi-task change by dispatching one fresh subagent per task and auditing each result before the next starts. Use when a plan, checklist, or multi-step change has tasks that can be delegated, or when the user asks for subagent-driven or delegated execution."
argument-hint: "[Plan doc path, task list, or description of the multi-task work]"
---

# Subagent-Driven Execution

Run multi-task work as a chain of delegated subagents. Each task gets a fresh worker with a self-contained brief; an adversarial reviewer audits the result before the next task starts. The audit is the completion gate: a task is done only when its verifier passes and the audit clears.

Use this when work decomposes into tasks with clean boundaries. For a single atomic change, edit directly. For the surrounding shipping pipeline (plan, execute, review, commit), this runs inside `ce-work`.

## Core loop

For each task, in order:

1. **Decompose.** Split the work into tasks with explicit boundaries: which files each touches, what it depends on, what "done" means. One concern per task. Two tasks that edit the same file are not independent; sequence them or merge them.
2. **Dispatch one fresh worker.** Spawn a new subagent via the platform's subagent primitive (`Agent`/`Task` in Claude Code, `spawn_agent` in Codex, `subagent` in Pi via the `pi-subagents` extension) with a self-contained brief (see below). Fresh per task: no carried-over context, no resumed worker.
3. **Worker implements and verifies.** The worker makes the change and runs the verification command from its brief. A worker that cannot make the verifier pass reports the failure rather than weakening the check.
4. **Audit before proceeding.** Dispatch `ce-adversarial-reviewer` against the worker's diff. The audit checks scope (only the task's files changed), correctness (the change does what the brief asked), contract alignment (matches existing patterns and interfaces), and no stale references (no dangling names, dead imports, or orphaned callers). Worker output is trusted after this audit, not before.
5. **Gate.** Audit clean and verifier green -> commit this task, move to the next. Audit finds a blocker -> dispatch a fixer worker, then re-audit. Do not start the next task on an unaudited or suspect result. If the audit cannot be cleared, abort the chain rather than building on it.

## Dispatch brief

Each worker brief is self-contained. The worker reads only what the brief points to; it does not see this skill or prior workers' context.

- **Goal**: one sentence on what this task changes and why.
- **Files**: the paths to edit, passed as paths not contents. Name files the worker must not touch.
- **Constraints**: patterns to follow, interfaces to preserve, what is out of scope.
- **Verification**: the exact command that proves the task works (test, typecheck, build, lint). The worker runs it before reporting done.
- **Commit**: one concern, one commit. Give the conventional prefix and scope.

Pass file paths over file contents so the worker reads only what it needs. Keep static material under ~50 lines inline; point to everything larger.

## Rules

- One concern per task, one commit per task. A task that needs two commits was two tasks.
- Trust worker output only after the audit clears. A passing verifier is not an audit; it proves the worker's own check ran, not that the change is correct or in scope.
- Never let two workers edit shared files concurrently. Shared-file tasks run sequentially. Concurrent edits to one file corrupt each other's diffs.
- Read back claimed edits when the change is high-risk: deletions, public-interface changes, anything the verifier does not fully cover. Confirm the edit landed where the worker said.
- A worker that dies mid-task leaves a dirty tree. Inspect it first (`git status`, `git diff`) and revert only the changes that worker made: discard its file edits and remove the stray files it created, leaving any pre-existing uncommitted work untouched. Never blanket-reset or `git clean` the whole tree, that destroys user work outside the task. Once the tree is back to the last good commit for the task's files, re-dispatch fresh. Never resume a dead worker onto a dirty tree, and never build the next task on uncommitted partial work.

## Parallel dispatch

Tasks with no shared files and no ordering dependency can run as parallel workers. Respect the platform's active-subagent limit, queue overflow, and treat spawn errors as backpressure (slow down, do not drop the task).

Parallel workers may implement at once, but git state is not parallel-safe in a single checkout: serialize the audit-and-commit step so one result lands at a time, or give each parallel worker its own worktree (`ce-worktree`) or clone so their commits never race on a shared index or HEAD. Audit each parallel result independently before its commit. On platforms without parallel dispatch, run the same tasks sequentially.

## Validation gates

| Gate | Check |
|------|-------|
| Brief completeness | Every brief has goal, files, constraints, verification command, commit instruction before dispatch |
| Audit between tasks | `ce-adversarial-reviewer` clears each result before the next task starts; no task builds on an unaudited result |
| Atomic commits | One concern per task, one commit per task; no multi-concern commits |
| Tree-clean recovery | Worker death triggers tree cleanup and fresh re-dispatch; never resume onto a dirty tree |

## On completion

Report which tasks landed, which audits flagged issues and how they resolved, and whether the chain aborted early. If the chain aborted, name the task that blocked and leave the tree at the last clean commit.
