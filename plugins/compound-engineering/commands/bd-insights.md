---
name: bd-insights
description: Deep graph analysis using bv for project structure insights
argument-hint: "[--recommendations]"
---

# bd Graph Insights

Perform deep analysis of the issue dependency graph using bv (beads_viewer).

## Workflow

### 1. Get Graph Metrics

```bash
bv --robot-insights
```

Parse and present:

#### PageRank (Blocking Power)

Issues that block the most other work:

| Rank | ID | Title | Score |
|------|-----|-------|-------|
| 1 | bd-xxx | ... | 0.15 |
| 2 | bd-yyy | ... | 0.12 |

High PageRank = Fundamental dependency. Prioritize these.

#### Betweenness (Bottleneck Status)

Issues that connect disparate clusters:

| ID | Title | Betweenness |
|----|-------|-------------|
| bd-xxx | ... | 0.35 |

High betweenness = Resolving this unblocks multiple work streams.

#### Critical Path Score

Issues blocking long chains of work:

| ID | Title | Path Length |
|----|-------|-------------|
| bd-xxx | ... | 5 |

High score = Deep dependency chain. Address early.

#### Cycles (Unhealthy State)

```bash
bv --robot-insights | jq '.cycles'
```

If cycles exist:
- List all issues in the cycle
- Recommend which dependency to break
- This is a health issue that should be fixed

### 2. Priority Recommendations (if $ARGUMENTS contains --recommendations)

```bash
bv --robot-priority
```

Present recommendations:

| ID | Current | Suggested | Confidence | Reasoning |
|----|---------|-----------|------------|-----------|
| bd-xxx | P2 | P1 | 0.85 | High PageRank, blocks 3 issues |

### 3. Execution Plan

```bash
bv --robot-plan
```

Show parallel tracks:

```markdown
## Execution Plan

**Track 1 (Independent):**
- bd-aaa: Task A
- bd-bbb: Task B (after bd-aaa)

**Track 2 (Independent):**
- bd-ccc: Task C
- bd-ddd: Task D (after bd-ccc)

Tracks 1 and 2 can be worked in parallel.
```

### 4. Summary

```markdown
## Graph Analysis Summary

**Health:** Good / Warning / Critical
**Top Blocker:** [issue] - blocks [N] issues
**Recommended Focus:** [issue] - highest impact
**Parallelism:** [N] independent tracks available

### Action Items
1. [Based on analysis]
2. [Priority adjustments]
3. [Cycle fixes if any]
```

## Metrics Explained

| Metric | What It Measures | Action |
|--------|------------------|--------|
| PageRank | How much this blocks | Prioritize high-rank issues |
| Betweenness | Bottleneck severity | These are chokepoints |
| Critical Path | Chain depth | Long chains = risk |
| Hubs | Issues depending on many | May need splitting |
| Authorities | Issues many depend on | Core infrastructure |
