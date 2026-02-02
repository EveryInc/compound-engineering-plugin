# Implementation Plan: /swarm-status Command

**Date:** 2026-01-25
**Feature:** Add a `/swarm-status` command that shows the current status of any active swarm teams

## Overview

Create a simple read-and-display command that shows the status of active swarm teams by reading team configuration files from `~/.claude/teams/` and task files from `~/.claude/tasks/`.

## Implementation

### File to Create

`plugins/compound-engineering/commands/swarm-status.md`

### Command Structure

```yaml
---
name: swarm-status
description: Show the current status of active swarm teams, including members and task progress
argument-hint: "[optional: team-name]"
---
```

### Command Behavior

1. **Discover Active Teams**
   - Read all directories in `~/.claude/teams/`
   - For each team, read `config.json` to get team metadata

2. **Display Team Information**
   - Team name and description
   - Creation date
   - Team lead
   - List of members with their role/color

3. **Display Task Progress**
   - Read task files from `~/.claude/tasks/{team-name}/`
   - Show task summary: completed/total
   - List tasks with their status and owner

4. **Optional: Filter by Team Name**
   - If `$ARGUMENTS` provided, show only that specific team

### Output Format

```markdown
## Active Swarm Teams

### Team: slfg-20260125-193700
**Description:** Swarm for: Add /swarm-status command
**Created:** 2026-01-25 19:37:00
**Lead:** team-lead

#### Members (3)
| Name | Role | Color |
|------|------|-------|
| team-lead | team-lead | - |
| planner | - | blue |
| researcher | - | green |

#### Tasks (2/8 complete)
| ID | Subject | Status | Owner |
|----|---------|--------|-------|
| 1 | Create implementation plan | in_progress | planner |
| 2 | Research best practices | in_progress | researcher |
| 3 | Implement the approved plan | pending | - |
...

---

**Total Teams:** 1 | **Total Active Agents:** 3
```

### Command Implementation Steps

1. Use bash to list `~/.claude/teams/*/config.json`
2. Parse each config.json with jq or read tool
3. For each team, read task files from `~/.claude/tasks/{team-name}/`
4. Format output as markdown table
5. If no teams found, display "No active swarm teams"

### Error Handling

- If `~/.claude/teams/` doesn't exist: "No active swarm teams"
- If specific team not found: "Team '{name}' not found"
- If task directory missing: Show team info without tasks

## Checklist

- [ ] Create `plugins/compound-engineering/commands/swarm-status.md`
- [ ] Update plugin.json description with new command count
- [ ] Update marketplace.json description with new command count
- [ ] Update README.md command list
- [ ] Update CHANGELOG.md
- [ ] Run `/release-docs` to update documentation site

## Estimated Complexity

**Low** - This is a straightforward read-and-display command with no complex logic. Similar to how other status-reporting commands work in the codebase.
