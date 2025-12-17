---
name: bd-status
description: Show bd project status with ready work and graph insights
argument-hint: "[--detailed]"
---

# bd Project Status

Show project status including ready work, issue counts, and graph health.

## Workflow

### 1. Database Overview

Run bd status for high-level overview:

```bash
bd status
```

### 2. Ready Work

Get actionable issues (no blockers):

```bash
bd ready --json
```

Present ready work sorted by priority:

| Priority | ID | Title | Type |
|----------|-----|-------|------|
| P0 | bd-xxx | ... | bug |
| P1 | bd-yyy | ... | feature |

### 3. Issue Counts

```bash
bd count --json
```

Show breakdown:
- **Open:** X issues
- **In Progress:** Y issues
- **Blocked:** Z issues
- **Closed (this week):** N issues

### 4. Graph Health (if $ARGUMENTS contains --detailed)

Run bv insights:

```bash
bv --robot-insights
```

Present:
- **Cycles:** Any circular dependencies (unhealthy)
- **Top Blockers:** Issues with highest PageRank
- **Bottlenecks:** Issues with high betweenness
- **Critical Path:** Longest dependency chain

### 5. Summary

```markdown
## Project Status

**Ready to Work:** X issues
**Highest Priority:** [issue title] (P[N])
**Health:** Good / Warning (cycles) / Critical

### Recommended Next Action
[Based on priority and graph analysis]
```

## Output Format

Present information clearly with:
- Tables for lists
- Emojis for status indicators
- Clear next steps

## Quick Mode (Default)

Without `--detailed`, show only:
1. Ready work count and top 5 items
2. Brief status counts
3. Recommended next action
