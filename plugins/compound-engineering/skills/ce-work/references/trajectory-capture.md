# Trajectory Capture

Load this reference after shipping a feature (Phase 3-4) when the execution involved a non-obvious approach — an initial attempt that failed, an unexpected dependency order, or a workaround for a framework limitation.

## Purpose

Capture execution trajectories as human-readable markdown so future sessions (and future engineers) can learn from what was tried and what worked. This is complementary to `docs/solutions/` (which captures post-hoc learnings about specific problems) — trajectories capture the **execution path**, not just the solution.

## When to Capture

Capture a trajectory when any of these are true:

- The initial approach failed and a different one succeeded
- The execution order mattered (doing X before Y prevented issues)
- A framework limitation required a workaround
- A plan assumption turned out to be wrong, requiring adaptation
- The task took significantly longer than expected due to a non-obvious blocker

Do NOT capture trajectories for routine work where the plan was followed directly with no surprises.

## Format

Write to `docs/solutions/{category}/` using the project's existing solution doc conventions. If the project has no `docs/solutions/` directory, write to the project root as a markdown file and let the engineer decide where to put it.

```markdown
---
date: YYYY-MM-DD
topic: {slug}
category: {developer-experience|integration-issues|build-errors|database-issues}
trajectory: true
---

# {Problem title}

## What we were trying to do
{Plan goal, unit being implemented, and expected approach}

## What we tried first
{Initial approach — what was done and what went wrong}
{Be specific: error messages, unexpected behavior, the moment it became clear this wasn't working}

## What worked
{Final approach with enough detail to reproduce}
{Include file paths, key code patterns, and configuration that mattered}

## Why this order mattered
{If execution sequence was critical, explain the dependency chain}
{Example: "The migration had to run before the seed script because..."}

## Key files
{List the files that were central to the solution}

## Time cost
{Optional: how long the detour took, to calibrate future estimates}
```

## How This Gets Used

- `ce-learnings-researcher.agent.md` searches `docs/solutions/` by frontmatter metadata — the `trajectory: true` field lets it specifically find execution trajectories
- Future `/ce-work` sessions benefit when `ce-learnings-researcher` surfaces a relevant trajectory before implementation starts
- If ruflo-agentdb is available, the trajectory summary is also stored as a pattern for semantic search (see `ruflo-memory-integration.md`)

## Orchestrator Responsibility

The orchestrating `/ce-work` session decides whether to capture a trajectory. Subagents do not write trajectories — they report their outcomes (including failures and pivots) to the orchestrator, which has the full picture of the execution path.
