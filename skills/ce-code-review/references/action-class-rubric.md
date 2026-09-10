# `autofix_class` rubric (personas)

`autofix_class` describes the **shape** of the follow-up work a finding needs — it is information, **not a check that permits or blocks applying a fix**. In report-only runs the user or caller interprets findings and decides what to apply; when local apply was explicitly authorized, Stage 5c (Act on findings) still uses judgment. Either way the class informs *what to do first* and *what to flag* — it does not mechanically decide what gets applied.

| `autofix_class` | Meaning |
|-----------------|---------|
| `gated_auto` | A concrete change is proposed in `suggested_fix`. Callers may apply after their own judgment. |
| `manual` | Actionable work that needs design input or a decision before code changes. Include `suggested_fix` when you can propose a defensible default. |
| `advisory` | Report-only — learnings, residual risk, rollout notes. |

## Persona guidance

- Prefer `gated_auto` when you can write a defensible `suggested_fix` for a localized change.
- Use `manual` when the right fix depends on product intent, architecture, or cross-cutting refactors.
- Use `advisory` when nothing breaks if left unfixed but the observation has value.
- Do **not** emit `safe_auto` — callers decide what to apply; reviewers classify and propose.

## Owner field

| `owner` | Meaning |
|---------|---------|
| `downstream-resolver` | Caller or human should act after review. |
| `human` | Judgment required before implementation. |
| `release` | Operational / rollout follow-up. |

Do not use `review-fixer`.

## Severity Scale

The merge bar is the one from Google's Code Review Developer Guide: the change must improve overall code health, not be perfect. Severity ranks by that bar — functionality and design defects outrank style and taste, and a finding whose only claim is "could be better" never blocks.

All reviewers use P0-P3:

| Level | Meaning | Action |
|-------|---------|--------|
| **P0** | Critical breakage, exploitable vulnerability, data loss/corruption | Must fix before merge |
| **P1** | High-impact defect likely hit in normal usage, breaking contract | Should fix |
| **P2** | Moderate issue with meaningful downside (edge case, perf regression, maintainability trap) | Fix if straightforward |
| **P3** | Low-impact, narrow scope, minor improvement | User's discretion |

## Action Routing

Severity answers **urgency**. `autofix_class` and `owner` are **information** describing the shape of follow-up work for callers; this metadata does not grant apply permission. Apply authority is separate, explicit, and checked before Stage 5c. The persona guidance for choosing a class is at the top of this reference.

| `autofix_class` | Default owner | Meaning |
|-----------------|---------------|---------|
| `gated_auto` | `downstream-resolver` or `human` | Concrete `suggested_fix` proposed; caller applies after judgment |
| `manual` | `downstream-resolver` or `human` | Actionable work needing design input or handoff |
| `advisory` | `human` or `release` | Report-only — learnings, rollout notes, residual risk |

Routing rules:

- **Synthesis (Stage 5, Merge findings) makes the final routing decision.** Persona-provided routing metadata is input, not the last word.
- **Choose the more conservative route on disagreement.** A merged finding may move from `gated_auto` to `manual`, but never widen without stronger evidence.
- **Reject `safe_auto` and `review-fixer` if present** — drop the finding or remap to `gated_auto` / `downstream-resolver` during synthesis.
- **`requires_verification: true` means any caller-applied fix needs targeted tests or follow-up validation.**
