# Entropy Management

## Overview

All repos drift.
Without active gardening, drift compounds into friction.
Entropy management keeps the system usable over time.

## Principle

Treat maintenance as a continuous, scheduled activity.
Do not wait for cleanup until the repo feels painful.

## Observable Entropy Signals

- Repeated fixes for the same issue.
- Growing TODO and FIXME comments.
- Stale docs with broken links.
- Decreasing confidence in conventions.
- Increasing review time for simple changes.

## Core Artifacts

- `docs/TECH_DEBT.md` for debt inventory.
- `docs/QUALITY_SCORE.md` for module health.
- `docs/CONVENTIONS.md` for current rules.
- `docs/solutions/` for solved incidents.

## Debt Tracking Standard

Use a normalized table with consistent columns:

`Issue | Occurrences | Severity | Status | Source`

This allows easy parsing and trend analysis.

## Debt Lifecycle

1. Capture issue.
2. Track occurrence count.
3. Prioritize severity.
4. Decide: fix now, schedule, or promote.
5. Promote to convention after 3+ occurrences.

## Quality Score Pattern

Assign grades per module (A-D) based on:

- Test confidence.
- Incident frequency.
- Code clarity.
- Architectural alignment.

Update grades with date and reviewer.

## Weekly Gardening Ritual

- Review new solution docs.
- Increment debt occurrences.
- Regrade modules touched this week.
- Identify one debt item to retire.

## Monthly Gardening Ritual

- Archive obsolete debt items.
- Promote recurring debt to conventions.
- Add enforcement for repeat convention violations.

## Drift Detection Ideas

- Check for docs changed >90 days ago with active modules.
- Flag conventions with no source links.
- Flag debt entries without status owner.

## Operational Queries

```bash
# Find stale docs
find docs -name '*.md' -mtime +90

# Count TODO hotspots
rg -n "TODO|FIXME" app lib src

# Spot repeated problem tags
rg -n "tags:" docs/solutions | sort
```

## Anti-Patterns

- Treating debt as a parking lot with no follow-up.
- Recording debt without source links.
- Grading quality once and never updating.
- Mixing debt and feature roadmap in one doc.

## Decision Framework

### Fix immediately when:

- Customer impact is ongoing.
- Security or data integrity is involved.
- The fix is small and low-risk.

### Schedule when:

- Impact is moderate.
- Work needs coordination across teams.
- There is a clear owner and date.

### Promote when:

- Pattern repeats 3+ times.
- Root cause is process or convention gap.
- Rule can prevent future repeats.

## Example Entry

```markdown
| Missing boundary parser for inbound webhook payloads | 3 | high | active | docs/solutions/integration-issues/webhook-parser-gap-20260213.md |
```

## Governance Guidance

- Keep debt reviews short and regular.
- Make status explicit: active, scheduled, resolved.
- Link every entry to evidence.

## Success Criteria

- Debt is visible and actionable.
- Repeated patterns are promoted.
- Quality scores improve in high-change modules.
- Drift is addressed before it becomes crisis work.
