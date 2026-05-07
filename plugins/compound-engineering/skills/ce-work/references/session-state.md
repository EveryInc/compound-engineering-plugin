# Session State Persistence

Load this reference when `/ce-work` detects a `SESSION_STATE.md` file in the project root, or when updating task progress at task boundaries.

## Purpose

Persist live work state across Claude Code sessions. When a session ends mid-work and a new session starts, the engineer can resume from where they left off instead of re-explaining context.

This is NOT a replacement for MEMORY.md (which handles decisions and patterns) or `docs/solutions/` (which handles post-hoc learnings). SESSION_STATE.md captures **live progress** — what branch you're on, what plan you're executing, which tasks are done, and what's next.

## SESSION_STATE.md Template

```markdown
# Session State

**Updated:** 2026-04-21T14:30:00+08:00
**Branch:** feat/OMG-1234-user-auth-flow
**Plan:** docs/plans/2026-04-21-001-feat-user-auth-flow-plan.md

## Task Progress

- [x] Unit 1: Create auth service module
- [x] Unit 2: Add login endpoint
- [ ] Unit 3: Add session persistence ← in progress
- [ ] Unit 4: Add logout
- [ ] Unit 5: Add registration

## Blockers

- Waiting on Descope API key for staging environment (asked Anton 2026-04-21)

## Next Steps

- Complete Unit 3 session persistence
- Then Unit 4 logout (depends on Unit 3)
```

## Read Behavior (Phase 0)

When `/ce-work` starts:

1. Check for `SESSION_STATE.md` in the project root
2. If it does not exist — proceed normally, no action needed
3. If it exists, read it and check the timestamp
4. **Stale check:** If the `Updated` timestamp is older than 7 days, ask: "Found session state from [date] on branch [branch]. This is [N] days old. Resume from this state, or start fresh?" (Note: 7 days is a starting default — teams with longer branch lifetimes may want to adjust.)
5. **Branch check:** If the state references a different branch than the current one, flag: "Session state is from branch [recorded branch] but you're on [current branch]. This state may be outdated."
6. **Fresh state:** If the state is recent and matches the current branch, offer: "Found session state: [N] of [M] tasks complete on [plan name]. Resume from [next incomplete task]?"
7. If the user chooses to resume, load the plan and skip to the first incomplete task
8. If the user chooses to start fresh, proceed normally (the old state file will be overwritten as new tasks complete)

## Write Behavior (Phase 2)

Update `SESSION_STATE.md` at these checkpoints during `/ce-work`:

1. **Task completion:** After marking a task as completed and before dispatching the next task, update the task checklist in SESSION_STATE.md
2. **Blocker encountered:** When a task is blocked (waiting on external input, dependency not met), update the Blockers section
3. **Plan change:** If scope changes during execution (new tasks added, tasks removed), update the Task Progress section

**Critical: Orchestrator-level only.** Never update SESSION_STATE.md from inside a subagent. The orchestrating ce-work session handles all writes. This prevents concurrent write conflicts during parallel subagent execution.

**Token cost:** Each update is one `Write` call with ~10-20 lines of markdown. This is lightweight. The agent uses judgment on frequency — don't update after trivial steps (renaming a variable), do update after meaningful task boundaries.

## File Location and Lifecycle

- **Location:** Project root (alongside `CLAUDE.md`)
- **Git:** Add `SESSION_STATE.md` to `.gitignore` — each developer's state is personal
- **Cleanup:** When all tasks in a plan are complete, the state file can be deleted or left to be overwritten by the next plan execution
- **Format:** Plain markdown, human-readable and editable. An engineer can manually update it if the agent's version gets out of sync
