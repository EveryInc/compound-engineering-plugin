---
title: "Status-gated todo resolution: making pending/ready distinction load-bearing"
category: workflow
date: "2026-03-24"
tags:
  - todo-system
  - status-lifecycle
  - review-pipeline
  - triage
  - safety-gate
related_components:
  - plugins/compound-engineering/skills/todo-resolve/
  - plugins/compound-engineering/skills/ce-review/
  - plugins/compound-engineering/skills/ce-review-beta/
  - plugins/compound-engineering/skills/todo-triage/
  - plugins/compound-engineering/skills/todo-create/
problem_type: correctness-gap
---

# Status-Gated Todo Resolution

## Problem

The todo system defines a three-state lifecycle (`pending` -> `ready` -> `complete`) across three skills (`todo-create`, `todo-triage`, `todo-resolve`). Two review skills create todos with different status assumptions:

| Source | Status created | Reasoning |
|--------|---------------|-----------|
| `ce:review` | `pending` | Dumps all findings, expects separate `/todo-triage` |
| `ce:review-beta` | `ready` | Built-in triage: confidence gating (>0.60), merge/dedup across 8 personas, owner routing. Only creates todos for `downstream-resolver` findings |
| `todo-create` (manual) | `pending` (default) | Template default |
| `test-browser`, `test-xcode` | via `todo-create` | Inherit default |

`todo-resolve` was resolving ALL todos regardless of status. This meant untriaged, potentially ambiguous findings could be auto-implemented without human review. The `pending`/`ready` distinction was purely cosmetic -- dead metadata that nothing branched on.

## Root Cause

The status field was defined in the schema but never enforced at the resolve boundary. `todo-resolve` loaded every non-complete todo and attempted to fix it, collapsing the intended `pending -> triage -> ready -> resolve` pipeline into a flat "resolve everything" approach.

## Solution

Updated `todo-resolve` to partition todos by status in its Analyze step:

- **`ready`** (status field or `-ready-` in filename): resolve these
- **`pending`**: skip entirely, report at end with hint to run `/todo-triage`
- **`complete`**: ignore

This is a single-file change scoped to `todo-resolve/SKILL.md`. No schema changes, no new fields, no changes to `todo-create` or `todo-triage` -- just enforcement of the existing contract at the resolve boundary.

## Key Insight: Review-Beta Promotion Eliminates Automated `pending`

Once `ce:review-beta` is promoted to stable (replacing `ce:review`), no automated source creates `pending` todos. The `pending` status becomes exclusively a human-authored state for manually created work items that need triage before action.

The safety model becomes:
- **`ready`** = autofix-eligible. Triage already happened upstream (either built into the review pipeline or via explicit `/todo-triage`).
- **`pending`** = needs human judgment. Either manually created or from a legacy review path.

This makes auto-resolve safe by design: the quality gate is upstream (in the review), not at the resolve boundary.

## Prevention Strategies

### Make State Transitions Load-Bearing, Not Advisory

If a state field exists, at least one downstream consumer must branch on it. If nothing branches on the value, the field is dead metadata.

- **Gate on state at consumption boundaries.** Any skill that reads todos must partition by status before processing.
- **Require explicit skip-and-report.** Silent skipping is indistinguishable from silent acceptance. When a skill filters by state, it reports what it filtered out.
- **Default-deny for new statuses.** If a new status value is added, existing consumers should skip unknown statuses rather than process everything.

### Dead-Metadata Detection

When reviewing a skill that defines a state field, ask: "What would change if this field were always the same value?" If the answer is "nothing," the field is dead metadata and either needs enforcement or removal. This is the exact scenario that produced the original issue.

### Producer Declares Consumer Expectations

When a skill creates artifacts for downstream consumption, it should state which downstream skill processes them and what state precondition that skill requires. The inverse should also hold: consuming skills should state what upstream flows produce items in the expected state.

## Cross-References

- [review-skill-promotion-orchestration-contract.md](../skill-design/review-skill-promotion-orchestration-contract.md) -- promotion hazard: if mode flags are dropped during promotion, the wrong artifacts are produced upstream
- [compound-refresh-skill-improvements.md](../skill-design/compound-refresh-skill-improvements.md) -- "conservative confidence in autonomous mode" principle that motivates status enforcement
- [claude-permissions-optimizer-classification-fix.md](../skill-design/claude-permissions-optimizer-classification-fix.md) -- "pipeline ordering is an architectural invariant" pattern; the same concept applies to the review -> triage -> resolve pipeline
