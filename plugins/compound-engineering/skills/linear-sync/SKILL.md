---
name: linear-sync
description: Bidirectional sync between file-based todos and Linear. Use when setting up Linear integration, syncing todo state, or troubleshooting sync issues.
---

# Linear Sync Skill

## Overview

This skill documents the bidirectional sync between the file-based todo system (`todos/` directory) and Linear project management. Changes flow both ways: file mutations push to Linear, and Linear changes (state, priority, comments, new issues) pull back into files.

## Architecture

```
Claude Code Commands          CLI Layer                        Linear API
(thin markdown)          (compound-plugin linear)          (GraphQL + API key)

/linear:sync    ──────>  compound-plugin linear sync   <─────> Linear (push + pull)
/linear:status  ──────>  compound-plugin linear status ──────> Linear (read)
/linear:import  ──────>  compound-plugin linear import <────── Linear (pull)
/linear:pull    ──────>  compound-plugin linear pull   <────── Linear (pull)
```

The CLI owns all Linear API communication. Commands shell out to it. All operations gracefully skip when `LINEAR_API_KEY` is not set.

## Configuration

### Required Environment Variable

```bash
export LINEAR_API_KEY="lin_api_..."  # From Linear Settings → API → Personal API keys
```

### Optional Configuration

Set in `compound-engineering.local.md` frontmatter or environment variables:

```yaml
---
linear_team_id: "abc-123"      # Or set LINEAR_TEAM_ID env var
linear_team_key: "ENG"         # Or set LINEAR_TEAM_KEY env var
linear_project_id: "def-456"   # Or set LINEAR_PROJECT_ID env var
---
```

If only one team exists in the workspace, it auto-detects. Run `compound-plugin linear config` to verify.

## Status/Priority Mappings

| File Status | Linear State |
|---|---|
| `pending` | Triage / Backlog |
| `ready` | Todo |
| (in progress) | In Progress |
| `complete` | Done |
| (deleted/skipped) | Cancelled |

| File Priority | Linear Priority |
|---|---|
| `p1` | 1 (Urgent) |
| `p2` | 2 (High) |
| `p3` | 3 (Normal) |

## Frontmatter Fields

Todo files gain two optional fields for tracking sync state:

```yaml
---
status: ready
priority: p1
issue_id: "042"
tags: [rails, performance]
dependencies: ["041"]
linear_id: "ENG-142"                     # Linear issue identifier
linear_synced_at: "2026-02-24T14:30:00Z" # Last bidirectional sync timestamp
---
```

Plan files gain similar fields:

```yaml
---
title: feat: Add API rate limiting
type: feat
status: active
date: 2026-02-24
linear_issue: "ENG-140"                  # Parent issue for spawned todos
linear_synced_at: "2026-02-24T14:30:00Z" # Last sync timestamp
---
```

## Sync Direction Details

### Push (File → Linear)

Triggered by lifecycle commands and `compound-plugin linear sync`:

- File created without `linear_id` → create Linear issue, write `linear_id` back
- File status/priority changed since last sync → update Linear issue state/priority
- File dependencies changed → update Linear relations

### Pull (Linear → File)

Triggered by `compound-plugin linear sync` and `compound-plugin linear pull`:

- Linear issue state changed → update file status, rename file to match
- Linear issue priority changed → update file priority, rename file
- Linear issue has new comments → append to file Work Log section
- New Linear issue in project (no local file) → create todo file
- Linear issue cancelled/archived → mark file as complete

### Conflict Resolution

When both file and Linear changed since `linear_synced_at`:

1. Compare timestamps: Linear `updatedAt` vs file modification time
2. Most recent wins — the other side gets overwritten
3. All conflicts logged to stdout with before/after values
4. `--dry-run` flag shows what would change without applying

## CLI Commands

```bash
# Full bidirectional sync
compound-plugin linear sync --todos-dir ./todos [--dry-run]

# Push local changes to Linear
compound-plugin linear push --todos-dir ./todos [--file <path>]

# Pull Linear changes into local files
compound-plugin linear pull --todos-dir ./todos

# Show sync status dashboard
compound-plugin linear status --todos-dir ./todos

# Import a specific Linear issue as a todo file
compound-plugin linear import ENG-123 --todos-dir ./todos

# Create a Linear issue from a file
compound-plugin linear create <file-path> [--parent ENG-140]

# Cancel a Linear issue
compound-plugin linear cancel ENG-123 [--comment "reason"]

# Show resolved configuration
compound-plugin linear config
```

## Workflow Integration

The Linear sync integrates with the existing todo lifecycle:

| Workflow Step | Linear Action |
|---|---|
| `/workflows:review` creates todos | `compound-plugin linear create <file>` for each |
| `/triage` approves todo | `compound-plugin linear push --file <path>` |
| `/triage` skips todo | `compound-plugin linear cancel <linear-id>` |
| `/resolve_todo_parallel` starts | `compound-plugin linear push --file <path>` |
| `/resolve_todo_parallel` completes | `compound-plugin linear push --file <path>` |
| `/workflows:plan` creates plan | `compound-plugin linear create <plan-path>` |
| `/workflows:work` starts | `compound-plugin linear pull` then push |

## Graceful Degradation

When `LINEAR_API_KEY` is not set, all Linear operations exit 0 with an informative skip message. The file-based todo system continues to work exactly as before. No workflow is broken by the absence of Linear integration.

## Parent/Sub-Issue Hierarchy

Plans map to parent Linear issues. Todos spawned from a plan become sub-issues:

```bash
# Create parent issue from plan
compound-plugin linear create docs/plans/2026-02-24-feat-api-rate-limiting-plan.md

# Create sub-issue linked to parent
compound-plugin linear create todos/042-ready-p1-rate-limiter.md --parent ENG-140
```
