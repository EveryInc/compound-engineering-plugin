# Corrections Over Waiting

## Overview

Throughput matters.
Excessive waiting creates larger batches and harder reviews.
Prefer short loops with fast corrections.

## Principle

Ship reversible changes quickly.
Reserve hard gates for irreversible actions.

## Why It Works

- Smaller diffs are easier to reason about.
- Bugs are isolated to narrow changes.
- Follow-up fixes are cheaper than delayed merges.

## What to Gate Hard

- Production deploy approval.
- Data migrations with irreversible transforms.
- Security-sensitive config changes.

## What to Keep Fast

- Documentation updates.
- Convention refinements.
- Non-breaking refactors.
- Incremental enforcement improvements.

## PR Size Guidance

- Prefer PRs that can be reviewed in minutes.
- Split backend/frontend shifts into separate units.
- Commit by logical unit, not by file count.

## Incremental Commit Pattern

Commit when a unit is complete and testable.
Do not wait for the full initiative to finish.

Examples:

- Add new skill scaffolding and references.
- Add setup integration.
- Add compound decision-gate integration.

## Handling Regressions

If a quick change regresses behavior:

1. Reproduce immediately.
2. Add follow-up fix quickly.
3. Capture issue in solution docs if non-trivial.
4. Promote rule if repetition appears.

## Anti-Patterns

- Giant "everything" PRs.
- Blocking on subjective polish before merge.
- Delaying harmless fixes until major releases.

## Decision Checklist

Before delaying merge, ask:

- Is the risk irreversible?
- Is the change isolated and testable?
- Can we correct quickly if needed?

If not irreversible, bias toward shipping and correcting.

## Operational Rules

- Keep branch lifetime short.
- Rebase early and often.
- Resolve merge conflicts while context is fresh.
- Prefer additive changes for easier rollback.

## Relationship to Foundations

Fast corrections work best when foundations are strong:

- Conventions reduce review ambiguity.
- Tech debt tracking prevents hidden accumulation.
- Quality score surfaces drift quickly.

## Communication Pattern

When shipping incremental units, include:

- What changed.
- Why now.
- What remains.
- Risk level.

## Example Flow

1. Capture solved issue.
2. Promote to convention when repeated.
3. Add lint rule after convention drift.
4. Ship each step separately.

## Success Criteria

- Work flows continuously with small, reversible units.
- Teams correct quickly instead of waiting for perfect conditions.
- Foundation quality improves without blocking delivery.
