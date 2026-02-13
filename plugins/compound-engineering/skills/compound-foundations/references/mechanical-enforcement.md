# Mechanical Enforcement

## Overview

Documentation improves understanding.
Enforcement improves consistency.
Use both, in that order.

## Principle

If a rule is recurring and objective, enforce it mechanically.
Good enforcement prevents drift without adding review burden.

## Enforcement Spectrum

1. Checklist in review template
2. Convention in docs
3. CI check
4. Linter/static rule
5. Build-breaker with remediation hints

## What to Enforce

- Boundary import direction.
- Required docs presence.
- Table schema for tech debt and quality score docs.
- Naming conventions for critical modules.
- Error message shape for boundary failures.

## What Not to Enforce

- Subjective style preferences.
- Rule sets with high false positives.
- Experimental conventions under active debate.

## Language Playbooks

### Ruby

- `Rakefile` tasks for doc checks.
- RuboCop cops for boundary and naming rules.
- `bin/ci` entry point for deterministic CI.

Example:

```ruby
namespace :docs do
  task :verify do
    abort("missing docs/CONVENTIONS.md") unless File.exist?("docs/CONVENTIONS.md")
  end
end
```

### TypeScript

- ESLint custom rules for layer boundaries.
- npm scripts for docs and schema checks.
- tsconfig project references for clear module boundaries.

Example:

```json
{
  "scripts": {
    "check:foundations": "node scripts/check-foundations.mjs"
  }
}
```

### Python

- `pyproject.toml` with ruff + mypy policies.
- pytest structural tests for repo artifacts.
- pre-commit hooks for quick local feedback.

### Go

- `make lint`, `make verify-docs` targets.
- `golangci-lint` for static checks.
- unit tests for config and parser invariants.

## Structural Test Pattern

Treat repo shape as testable:

- Core docs exist.
- Required tables contain expected headers.
- Plan files include `status` frontmatter.

## Error Message Design

Every rule failure should include:

- What failed.
- Why it matters.
- How to fix it.

Bad message:

`invalid conventions`

Good message:

`docs/CONVENTIONS.md missing section "Error Handling". Add the section or run foundation generator.`

## Adoption Strategy

1. Start with non-blocking checks.
2. Measure false positives.
3. Tune messages and scope.
4. Promote to blocking once stable.

## Template: Foundation Check Script

```bash
#!/usr/bin/env bash
set -euo pipefail

required=(
  "docs/CONVENTIONS.md"
  "docs/TECH_DEBT.md"
  "docs/ARCHITECTURE.md"
)

for f in "${required[@]}"; do
  test -f "$f" || { echo "missing: $f"; exit 1; }
done

echo "foundation checks passed"
```

## Anti-Patterns

- Blocking CI on day one with noisy rules.
- Enforcing style that has no impact on reliability.
- Hidden enforcement scripts no one can discover.

## Maintenance

- Review enforcement rules monthly.
- Remove stale checks tied to retired architecture.
- Track top failing checks and improve guidance.

## Success Criteria

- Recurring issues decline over time.
- Lint output teaches rather than punishes.
- Reviews focus on judgment, not repetitive rule checks.
