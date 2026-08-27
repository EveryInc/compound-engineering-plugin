# Ruflo Memory Integration (Optional)

Load this reference when `/ce-work` detects that ruflo-agentdb MCP tools are available. This enhances session resume with semantic recall from past sessions and stores task completion trajectories for future retrieval.

This is an **optional enhancement** — if ruflo is not installed or the MCP server is not running, SESSION_STATE.md provides full session state persistence on its own.

## Detection

Before using any ruflo tools, check availability:

1. Check if the tool `mcp__claude-flow__agentdb_health` exists in your available tools
2. If it does not exist, skip all ruflo integration — SESSION_STATE.md is sufficient
3. If it exists, call `mcp__claude-flow__agentdb_health` — if it returns an error, skip ruflo integration

## At Session Start (after reading SESSION_STATE.md)

After the SESSION_STATE.md check in Phase 0, if ruflo-agentdb is available:

1. Extract the plan goal or work description from SESSION_STATE.md (or from the bare prompt if no state file exists)
2. Call `mcp__claude-flow__agentdb_pattern-search` with the goal/description as the query
3. If relevant past patterns are found, present them briefly:
   > "Found [N] related past sessions in AgentDB. Key learnings: [one-line summary per pattern]"
4. Do not block on this — if the search is slow or returns nothing, proceed normally
5. This supplements SESSION_STATE.md, never replaces it. SESSION_STATE.md has the authoritative task progress; agentdb has cross-session context.

## At Task Completion

After updating SESSION_STATE.md at a task boundary, if ruflo-agentdb is available:

1. Store a task summary to agentdb:
   ```
   Tool: mcp__claude-flow__agentdb_hierarchical-store
   Args:
     key: "{branch}/{plan-filename}/{unit-id}"
     value: "Goal: {unit goal}. Approach: {what was done}. Outcome: {success/failure/partial}."
     namespace: "ce-task-completions"
   ```

2. If the task involved a non-obvious solution (unexpected approach, workaround, or recovery from a failed first attempt), also store the pattern:
   ```
   Tool: mcp__claude-flow__agentdb_pattern-store
   Args:
     pattern: "{description of the approach that worked and why}"
     namespace: "ce-patterns"
   ```

3. Keep storage lightweight — one call per task boundary, not per file change.

## What NOT to Store

- Routine task completions where the approach was obvious (followed existing pattern, no surprises)
- File contents or diffs (too large, too noisy)
- Temporary state that SESSION_STATE.md already captures (current task progress, blockers)

## Failure Handling

- If any ruflo MCP call fails, log the failure silently and continue — ruflo is a nice-to-have, not a dependency
- Never block ce-work execution waiting for ruflo
- Never retry failed ruflo calls — move on
