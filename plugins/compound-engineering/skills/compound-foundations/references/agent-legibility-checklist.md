# Agent Legibility Checklist

## Overview

Agent-legible repos are easy to search, easy to navigate, and easy to modify safely.
This checklist focuses on concrete, observable repo characteristics.

Use it during setup, refactors, and post-incident cleanups.

## Core Principle

Design for reliable agent execution, not only human aesthetics.
A neat codebase that is hard to grep is still expensive for agents.

## Quick Audit

- [ ] File and directory names are literal and domain-specific.
- [ ] Errors explain what failed and what to do next.
- [ ] Domain docs exist under `docs/` with stable paths.
- [ ] Entry docs link to deeper docs in at most two hops.
- [ ] Conventions are written and easy to find.

## Technology Choices

Prefer boring, well-known tools unless there is a strong reason otherwise.

### Preferred

- Stable frameworks with large documentation footprints.
- Tools with deterministic CLI behavior.
- Libraries with predictable versioning and changelogs.
- Data formats that are machine-parseable and human-readable.

### Risky

- Opaque wrappers around core workflows.
- Frameworks with weak documentation or frequent breaking changes.
- Custom DSLs for common tasks that hide runtime behavior.

## Code Layout

### Good patterns

- One responsibility per module.
- Explicit boundaries between domain, infra, and UI.
- Small helper modules near the caller.
- Consistent naming for service objects and adapters.
- File names matching exported types/classes.

### Anti-patterns

- Buckets named `misc`, `utils2`, `helpers_old`.
- Huge files combining parsing, IO, and business rules.
- Hidden side effects in initializers.
- Generic names like `manager` or `processor` with no context.

## Naming Conventions

Names should answer "what does this do" without opening the file.

### Use

- `invoice_reconciliation_runner.ts`
- `user_session_boundary.rb`
- `email_thread_indexer.py`

### Avoid

- `runner.ts`
- `stuff.rb`
- `handler.py`

## Error Messages That Teach

Error text should include:

- What failed.
- What input triggered it.
- One likely fix.

Example:

```text
Invalid stage "deploying" in plan frontmatter.
Allowed values: active, completed, archived.
Fix: set `status: active` or `status: completed`.
```

## Grepability Standards

- Keep key terms stable across docs, code, and commands.
- Prefer explicit literals over magic constants.
- Include domain nouns in function names.
- Use consistent table headers in markdown artifacts.

## Documentation Standards

- `CLAUDE.md` maps the repo.
- `docs/ARCHITECTURE.md` explains module boundaries.
- `docs/CONVENTIONS.md` defines coding rules.
- `docs/TECH_DEBT.md` tracks recurring issues.
- `docs/QUALITY_SCORE.md` tracks drift and review state.

## Testing for Legibility

Create lightweight checks:

- Lint for ambiguous directory names.
- Check `CLAUDE.md` line count and required sections.
- Validate required markdown tables in debt/quality docs.
- Fail CI when docs are missing after feature templates are generated.

## Review Checklist

Run this list when reviewing PRs:

- [ ] Can a new agent find the right file in under two searches?
- [ ] Are new modules named by domain behavior?
- [ ] Do new errors include remediation hints?
- [ ] Are conventions updated for new patterns?
- [ ] Are new docs cross-linked from existing maps?

## Promotion Signals

Promote a rule from guidance to convention if:

- It appears in 3+ review comments.
- It caused a production issue.
- It is easy to enforce mechanically.

Promote from convention to enforcement if:

- Violations keep recurring after documentation.
- The rule has low false positive risk.
- The fix can be auto-suggested in lint output.

## Example: Before and After

### Before

- Failure messages: "invalid input"
- No conventions doc
- Mixed naming style

### After

- Failure messages include allowed values and next action
- `docs/CONVENTIONS.md` contains naming and boundary rules
- Linter enforces naming and boundary imports

## Practical Command Snippets

```bash
# Check map size
wc -l CLAUDE.md

# Find ambiguous files
rg -n "utils|misc|helper" app lib src

# Verify required docs exist
for f in docs/CONVENTIONS.md docs/TECH_DEBT.md docs/ARCHITECTURE.md; do test -f "$f" || echo "missing: $f"; done
```

## Success Criteria

- Search is predictable.
- Docs point to the right depth quickly.
- Repeated mistakes are documented and enforced.
- A new agent can contribute safely in one session.
