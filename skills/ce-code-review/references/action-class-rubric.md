# `autofix_class` rubric (personas)

`autofix_class` describes the **intrinsic shape** of follow-up work — it is signal, **not an apply gate or permission**. In `mode:agent` the caller interprets findings and owns apply; in default (interactive) mode the review applies safe fixes itself by judgment (SKILL.md Stage 5c). Either way the class informs *what to do first* and *what to flag* — it does not mechanically decide what gets applied.

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
