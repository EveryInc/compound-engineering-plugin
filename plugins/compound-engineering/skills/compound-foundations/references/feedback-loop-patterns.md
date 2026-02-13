# Feedback Loop Patterns

## Overview

Compounding quality depends on promotion loops.
A good loop captures one lesson once, then applies it everywhere.

## The Promotion Ladder

Use this escalation path:

1. Review comment
2. Solution doc
3. Convention entry
4. Mechanical enforcement

Each step increases reliability and lowers repeated review load.

## When to Promote

Promote when any of these are true:

- Same issue appears 3+ times.
- Fix required senior reviewer intervention.
- Rule can be stated clearly and checked consistently.

## Promotion Heuristics

### Promote to convention

- Rule is stable across modules.
- Violations are frequent but not always machine-detectable.
- Context/rationale matters to engineers.

### Promote to enforcement

- Rule is objective.
- Violation detection is deterministic.
- Auto-fix or actionable message is possible.

## Pattern: Review Comment -> Doc

Capture the failure as a single issue file in `docs/solutions/`.
Use exact symptoms, root cause, and code-level fix.

Include:

- Trigger condition.
- Example failure.
- Working remediation.
- Prevention guidance.

## Pattern: Doc -> Convention

Add a concise rule to `docs/CONVENTIONS.md`.
Structure every entry with:

- Rule.
- Why it exists.
- Source link to the solution doc.

## Pattern: Convention -> Enforcement

Codify only after convention drift repeats.

Possible mechanisms:

- ESLint custom rule.
- RuboCop cop.
- Static analyzer query.
- CI script validating file structure.

## Language Examples

### TypeScript

Recurring issue: untyped `any` in API boundaries.

- Convention: "Boundary parsing must return typed DTOs."
- Enforcement: ESLint rule blocking `any` in `src/boundaries/**`.

### Ruby

Recurring issue: business logic in controllers.

- Convention: "Controllers orchestrate, domain logic lives in models/services."
- Enforcement: custom RuboCop cop for controller complexity thresholds.

### Python

Recurring issue: ad-hoc dict payloads crossing module boundaries.

- Convention: "Use dataclasses or typed models at boundaries."
- Enforcement: mypy strict mode for boundary packages.

### Go

Recurring issue: ignored errors.

- Convention: "No ignored `err`; return or wrap with context."
- Enforcement: `errcheck` in CI with package allowlist exceptions.

## Decision Matrix

| Signal | Action |
|---|---|
| First occurrence | Keep in review feedback |
| Second occurrence | Add solution documentation |
| Third occurrence | Promote to convention |
| Repeats after convention | Add mechanical enforcement |

## Quality of a Good Convention Entry

- Specific scope.
- One clear rule.
- One concise rationale.
- One source link.
- One example if needed.

Avoid long essays in conventions.
Push detailed narrative into solution docs.

## Common Anti-Patterns

- Skipping documentation and jumping straight to lint rules.
- Conventions with no source evidence.
- Enforcement rules with many false positives.
- Stale conventions that no one follows.

## Maintenance Cadence

Weekly:

- Review new solution docs.
- Identify candidates with recurring tags.

Monthly:

- Review conventions with low adoption.
- Archive obsolete conventions.

Quarterly:

- Evaluate enforcement opportunities.
- Remove noisy lint checks.

## Suggested Workflow Integration

In `/workflows:compound`:

- Always show option to promote to convention.
- Mark it as suggested when 3+ similar findings exist.
- Offer tech debt tracking when issue is known but not yet codified.

## Example Convention Entry

```markdown
### Error Handling

- Rule: Boundary parsers must return typed errors with remediation hints.
- Rationale: Opaque errors caused repeated debugging delays.
- Source: docs/solutions/runtime-errors/boundary-parser-missing-context-20260213.md
```

## Example Enforcement Rule Summary

```text
Rule: no-untyped-boundary-parse
Scope: src/boundaries/**
Message: Parse external input into typed DTOs before crossing domain boundary.
Fix: Use parseIncomingX() helper with schema validation.
```

## Success Criteria

- Repeated findings graduate out of review comments.
- Convention docs stay concise and evidence-backed.
- Enforcement is targeted and low-noise.
- Teams spend less time re-learning the same lesson.
