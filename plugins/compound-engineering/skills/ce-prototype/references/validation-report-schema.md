# Validation Report Schema

Canonical frontmatter fields for prototype validation reports in `docs/prototypes/`.

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Descriptive title: "[Topic] Prototype Validation" |
| `date` | string (YYYY-MM-DD) | Date the validation was completed |
| `topic` | string (kebab-case) | Topic slug matching the prototype directory name |
| `status` | enum: `complete`, `partial` | Whether all validation goals were tested |
| `goals_proved` | integer | Count of goals with "Proved" status |
| `goals_disproved` | integer | Count of goals with "Disproved" status |
| `goals_inconclusive` | integer | Count of goals with "Inconclusive" status |

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `origin` | string (repo-relative path) | Path to the upstream requirements document, if any |
| `tags` | array[string] | Search keywords, lowercase and hyphen-separated. Always include `prototype` and `validation`. Max 8 tags. |
| `prototype_preserved` | boolean | Whether the prototype code was kept (default: false) |
| `prototype_path` | string | Path to preserved prototype (e.g., `prototypes/<topic-slug>/`), if `prototype_preserved: true` |
| `effort_minutes` | integer | Approximate time spent on the prototype |
| `iterations` | integer | Number of build-feedback iterations before final validation (typically 1-3) |

## Validation Goal Statuses

| Status | Meaning | Planning Impact |
|--------|---------|----------------|
| **Proved** | Assumption confirmed with evidence | Proceed with confidence — incorporate as validated constraint |
| **Disproved** | Assumption was wrong | Requirements or approach needs revision before planning |
| **Inconclusive** | Could not determine — needs more testing or different approach | Consider a focused second prototype round, or flag as a risk in the plan |

## Naming Convention

File: `docs/prototypes/<topic-slug>-validation-<YYYY-MM-DD>.md`

If a report with the same name already exists (e.g., multiple prototype rounds on the same day), append the next available sequence number: `-002`, `-003`, etc.

Examples:
- `docs/prototypes/stripe-refund-webhooks-validation-2026-04-04.md`
- `docs/prototypes/stripe-refund-webhooks-validation-2026-04-04-002.md` (second round, same day)
- `docs/prototypes/payment-api-validation-2026-03-15.md`
- `docs/prototypes/image-recognition-validation-2026-04-01.md`

## Relationship to Other Compound Artifacts

```
docs/brainstorms/*-requirements.md  (upstream — defines what to build)
        |
        v
docs/prototypes/*-validation-*.md   (this — validates assumptions)
        |
        v
docs/plans/*-plan.md                (downstream — references validation results)
        |
        v
docs/solutions/                     (post-implementation — documents learnings)
```

The validation report is referenced by `/ce:plan` the same way `/ce:plan` references requirements documents — as an origin input that grounds planning decisions in evidence rather than assumptions.
