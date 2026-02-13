# Plans as Artifacts

## Overview

Plans should be durable files with execution state.
Treat planning output as code-adjacent artifacts.

## Principle

A plan is not complete when written.
A plan is complete when it records execution and outcomes.

## Required Frontmatter

Use a minimal, stable schema:

```yaml
---
title: "feat: ..."
status: active
date: YYYY-MM-DD
---
```

Recommended optional fields:

- `type`
- `shaping`
- `owner`
- `links`

## Status Lifecycle

- `active`: work in progress.
- `completed`: shipped.
- `archived`: historical reference.

Keep transitions explicit.

## Execution Tracking

Use markdown checkboxes for acceptance criteria.
Mark tasks complete as work lands.

Rules:

- Do not batch-update at the end.
- Keep plan and implementation synchronized.
- Add notes when scope changes.

## Decision Log Pattern

Include short decision entries:

- Decision taken.
- Why it was taken.
- Tradeoff accepted.
- Date.

This prevents repeated debates and confusion.

## Linkage Pattern

Each plan should link to:

- Shaping doc or originating spec.
- Affected modules.
- Related solution docs.
- Resulting PR.

## Plan Granularity

Good plan tasks are:

- Observable.
- Testable.
- Single logical unit.

Avoid "do everything" task entries.

## Integration with Workflows

During `/workflows:work`:

- Read the plan first.
- Track task status in a TODO artifact.
- Update plan checkboxes as units complete.
- Update frontmatter status at ship phase.

## Anti-Patterns

- Plans with no acceptance criteria.
- No status field.
- Status never updated after shipping.
- Decisions captured only in chat.

## Example Task Block

```markdown
## Acceptance Criteria

- [ ] Add foundations audit step to setup skill
- [ ] Add promotion options to compound decision gate
- [ ] Add tech debt tracking template and workflow
```

## Example Decision Log

```markdown
## Decision Log

- 2026-02-13: Keep Option 2 and Option 8 separate.
  Reason: Required Reading and Convention serve different goals.
```

## Quality Check for Plan Files

- [ ] Frontmatter present and valid
- [ ] Status reflects reality
- [ ] Checkboxes match shipped work
- [ ] Links to artifacts and source docs included

## Automation Ideas

- Script to validate required frontmatter keys.
- Script to flag `status: active` plans older than N days.
- Script to verify no unchecked boxes in completed plans.

## Command Snippets

```bash
# Find active plans
rg -n "status: active" plans

# Find completed plans with unchecked tasks
rg -n "status: completed|\- \[ \]" plans
```

## Success Criteria

- Plans are searchable and current.
- Execution state is visible at a glance.
- Decisions and outcomes are preserved in-repo.
