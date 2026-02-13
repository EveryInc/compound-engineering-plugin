# Visibility and Tooling

## Overview

You cannot steer what you cannot see.
Visibility turns quality from intuition into operations.

## Principle

Every important foundation artifact should be observable.
Use lightweight, queryable signals over manual memory.

## What to Make Visible

- Foundation artifact presence.
- Quality score trends.
- Tech debt occurrence counts.
- Convention promotion candidates.
- Active plan status.

## Minimum Visibility Stack

- Markdown artifacts in `docs/`.
- Deterministic scripts to validate shape.
- CI output with clear pass/fail messages.
- Optional dashboard summary for teams.

## Status Summary Pattern

Emit compact status lines such as:

`foundations: 6/8 present | debt: 14 active | promotion candidates: 3`

This can be shown in CI logs or local CLI output.

## Structured Log Pattern

For automation, emit machine-parseable records:

```json
{"event":"foundation_check","artifact":"docs/CONVENTIONS.md","status":"present"}
{"event":"tech_debt","issue":"missing boundary parser","occurrences":3}
```

## Worktree Isolation

When running multiple efforts in parallel:

- Use separate worktrees.
- Keep logs and temporary outputs per worktree.
- Avoid shared mutable state in scripts.

## Dashboard Metrics

Useful metrics:

- Number of active debt items.
- Number of unresolved high-severity debt items.
- Average module grade from QUALITY_SCORE.
- Count of recurring patterns above threshold.

## Alert Thresholds

Set simple thresholds:

- Occurrences >= 3 -> suggest convention promotion.
- High severity debt older than N days -> escalate.
- Missing core artifact -> fail setup audit.

## Tooling Hooks

- Pre-merge check: foundation artifact validation.
- Weekly cron: stale docs and debt trend report.
- Monthly report: promotion candidates and enforcement opportunities.

## Command Examples

```bash
# Core artifact check
for f in docs/CONVENTIONS.md docs/TECH_DEBT.md docs/ARCHITECTURE.md; do
  test -f "$f" || echo "missing:$f"
done

# Count active debt items (table rows)
rg -n "\| .* \| [0-9]+ \|" docs/TECH_DEBT.md | wc -l
```

## Anti-Patterns

- Relying on ad-hoc verbal status updates.
- Non-deterministic scripts with vague output.
- Dashboards with no link to source docs.

## Human-Friendly + Machine-Friendly

Aim for both:

- Human-friendly markdown for context.
- Machine-friendly tables and consistent headers for parsing.

## Security and Privacy

When exposing visibility data:

- Avoid secrets in logs.
- Avoid customer-sensitive payloads in examples.
- Keep source links internal when needed.

## Success Criteria

- Team can assess foundation health in one minute.
- Promotion candidates are surfaced automatically.
- Drift signals are caught before major incidents.
