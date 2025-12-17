---
name: bd-integration
description: Issue tracking with bd (beads) - dependency-aware, git-friendly, agent-optimized. Use when managing issues, todos, work items, or project tracking.
---

# bd (beads) Issue Tracking Skill

## Overview

bd (beads) is a dependency-aware issue tracker designed for AI agents. Issues chain together like beads - each with dependencies, priorities, and status tracking. All state syncs to `.beads/issues.jsonl` for git version control.

**Use this skill when:**
- Creating or managing issues/todos
- Checking what work is ready (unblocked)
- Tracking dependencies between tasks
- Getting graph insights (bottlenecks, critical paths)
- Resolving issues during development

## Quick Start

```bash
# Check ready work (unblocked issues)
bd ready --json

# Create a new issue
bd create "Fix authentication bug" -t bug -p 1 --json

# Claim and work on issue
bd update <id> --status in_progress --json

# Complete issue
bd close <id> --reason "Fixed in commit abc123" --json
```

## Issue Types

| Type | Use For |
|------|---------|
| `bug` | Something broken |
| `feature` | New functionality |
| `task` | Work item (tests, docs, refactoring) |
| `epic` | Large feature with subtasks |
| `chore` | Maintenance (dependencies, tooling) |

## Priority Levels

| Priority | Meaning | Use For |
|----------|---------|---------|
| `0` | Critical | Security, data loss, broken builds |
| `1` | High | Major features, important bugs |
| `2` | Medium | Default, nice-to-have |
| `3` | Low | Polish, optimization |
| `4` | Backlog | Future ideas |

## Core Workflow for AI Agents

### 1. Check Ready Work

```bash
bd ready --json
```

Returns issues with no blockers, sorted by priority.

### 2. Claim Your Task

```bash
bd update <id> --status in_progress --json
```

### 3. Work on It

Implement, test, document the change.

### 4. Discover New Work?

Create linked issue:

```bash
bd create "Found edge case" -t bug -p 2 --deps discovered-from:<parent-id> --json
```

### 5. Complete

```bash
bd close <id> --reason "Implemented and tested" --json
```

### 6. Commit Together

**IMPORTANT:** Always commit `.beads/issues.jsonl` with code changes to keep issue state in sync:

```bash
git add .beads/issues.jsonl
git commit -m "feat: implement feature X"
```

## Creating Issues

### Basic Creation

```bash
bd create "Issue title" -t task -p 2 --json
```

### With Dependencies

```bash
# Issue depends on another
bd create "Implement API" --deps bd-abc123 --json

# Discovered while working on parent
bd create "Edge case" --deps discovered-from:bd-abc123 --json
```

### Hierarchical Subtasks

```bash
# Create subtask under epic
bd create "Subtask" --parent bd-epic-id --json
```

Subtasks get IDs like `bd-epic-id.1`, `bd-epic-id.2`.

## Querying Issues

```bash
# List all open issues
bd list --status open --json

# Show issue details
bd show <id> --json

# Find blocked issues
bd blocked --json

# Search by text
bd search "authentication" --json

# Count by status
bd count --json
```

## Managing Dependencies

```bash
# Add dependency
bd dep add <id> <blocker-id>

# Remove dependency
bd dep remove <id> <blocker-id>

# View what blocks an issue
bd show <id> --json | jq '.dependencies'
```

## bv (beads_viewer) Graph Analysis

Use bv for structural analysis of the issue graph:

```bash
# Execution plan with parallel tracks
bv --robot-plan

# Deep graph metrics (PageRank, bottlenecks, cycles)
bv --robot-insights

# Priority recommendations
bv --robot-priority

# Available view recipes
bv --robot-recipes

# Changes since commit/date
bv --robot-diff --diff-since HEAD~5
```

### Understanding bv Metrics

| Metric | Meaning |
|--------|---------|
| PageRank | Blocking power - high = fundamental dependency |
| Betweenness | Bottleneck status - high = connects clusters |
| CriticalPathScore | Depth - high = blocking long chain |
| Cycles | Circular dependencies (unhealthy) |

## Status Values

| Status | Meaning |
|--------|---------|
| `open` | Not started |
| `in_progress` | Being worked on |
| `blocked` | Has unresolved dependencies |
| `closed` | Completed |

## Integration with Code Review

When `/workflows:review` finds issues:

```bash
# Create P1 (critical) finding
bd create "Security: SQL injection in user_controller.rb:45" \
  -t bug -p 0 \
  --label code-review,security \
  --json

# Create P2 (important) finding
bd create "Performance: N+1 query in posts#index" \
  -t bug -p 1 \
  --label code-review,performance \
  --json
```

## Common Patterns

### Triage Workflow

```bash
# 1. List pending items
bd list --status open --json

# 2. Approve for work (change priority if needed)
bd update <id> --priority 1 --json

# 3. Or close if not relevant
bd close <id> --reason "Won't fix - out of scope" --json
```

### Parallel Resolution

```bash
# 1. Get execution plan
bv --robot-plan

# 2. Work on items from independent tracks in parallel
# Each track can be handled by a separate agent
```

### Sprint Planning

```bash
# See all ready work by priority
bd ready --json | jq 'sort_by(.priority)'

# Check for bottlenecks
bv --robot-insights | jq '.bottlenecks'

# Get priority recommendations
bv --robot-priority
```

## Auto-Sync Behavior

bd automatically syncs with git:

- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed

## Key Distinctions

**bd issues (this skill):**
- CLI-based issue tracking
- Dependency-aware with graph analysis
- Git-synced via JSONL
- Agent-optimized with `--json` output

**TodoWrite tool:**
- In-memory task tracking during agent sessions
- Temporary tracking for single conversation
- Not persisted to disk
- Use for tracking progress within a session

**Rails Todo model:**
- Database model in application code
- User-facing feature
- Different from development tracking

## CLI Help

For any command, use `--help`:

```bash
bd create --help
bd update --help
bd list --help
bv --robot-help
```

## Important Rules

- Always use `--json` flag for programmatic output
- Link discovered work with `discovered-from` dependencies
- Check `bd ready` before asking "what should I work on?"
- Commit `.beads/issues.jsonl` with code changes
- Use bv for graph analysis, not raw JSONL parsing
