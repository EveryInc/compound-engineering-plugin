---
name: swarm-status
description: Show status of active swarm teams, teammates, and tasks
argument-hint: "[team-name or 'all']"
---

# Swarm Status

Display the current status of active swarm teams.

## Usage

```bash
/swarm-status          # Show all active teams
/swarm-status my-team  # Show specific team
```

## Step 1: Find Active Teams

```bash
ls ~/.claude/teams/*/config.json 2>/dev/null
```

If no teams found:
```
No active swarm teams found.

Start a new swarm with: /slfg "your feature description"
```

## Step 2: Display Team Status

For each team, read config and display:

```markdown
## Swarm: {team_name}

**Description:** {description}
**Lead:** {lead_agent_id}

### Teammates ({count})

| Name | Status |
|------|--------|
| team-lead | Running |
| planner | Running |
| worker | Stopped |

### Tasks

| # | Status | Subject | Owner |
|---|--------|---------|-------|
| 1 | Complete | Create plan | planner |
| 2 | In Progress | Implement | worker |
| 3 | Pending | Review | - |

**Progress:** 1/3 complete (33%)
```

## Status Detection

- **Running** - Agent has `backendType: in-process` or active `tmuxPaneId`
- **Stopped** - Otherwise
