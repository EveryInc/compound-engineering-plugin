# Architecture Docs

## Overview

Architecture docs should answer:

- Where does behavior live?
- Which boundaries matter?
- What must never happen?

Keep architecture docs concise and operational.

## Codemap, Not Atlas

A codemap highlights navigation and invariants.
It is not a full narrative of every module.

Good architecture docs help agents find the right place quickly.

## Recommended Structure

1. Bird's-eye overview
2. Codemap by module
3. Data flow summary
4. Invariants
5. Cross-cutting concerns

## Bird's-Eye Overview

Describe the system in a few paragraphs:

- Domain purpose
- Core execution paths
- Main integration boundaries

Avoid implementation trivia here.

## Codemap Section

For each module, capture:

- Path
- Responsibility
- Key types/functions
- Allowed dependencies

Example entry:

```markdown
- `src/boundaries/payments/`
  - Purpose: Parse and validate external payment events.
  - Key types: `PaymentEvent`, `ParsedPayment`.
  - Depends on: `src/lib/schema`, `src/domain/payments`.
```

## Data Flow Section

Describe major flows in simple steps.

Example:

1. Inbound webhook enters boundary parser.
2. Parsed event becomes domain command.
3. Domain service updates state.
4. Outbound projection updates read model.

## Invariants Section

Capture critical "must always" and "must never" rules.

Examples:

- Must always parse untrusted input at boundary layer.
- Must never call external APIs from domain entities.
- Must always include source link for new conventions.

## Absence Invariants

Document what does not exist by design.
This prevents accidental reintroduction.

Examples:

- No business logic in controllers.
- No cross-module imports from UI into domain.
- No schema-less payloads crossing boundaries.

## Cross-Cutting Concerns

Cover shared concerns once:

- Observability
- Security boundaries
- Background jobs
- Caching
- Error handling conventions

## Drift Signals

Architecture docs are stale when:

- Module names changed but codemap did not.
- New boundaries are unlisted.
- Invariants conflict with current code.

## Update Trigger Rules

Update architecture docs when:

- New top-level module appears.
- Dependency direction changes.
- Domain boundary changes.
- New cross-cutting concern is introduced.

## Anti-Patterns

- 100-page architecture novels.
- Diagrams with no corresponding code paths.
- Vague terms like "service layer" with no files.
- No invariants section.

## Review Questions

- Can a new engineer find the right module in under one minute?
- Are dependency directions explicit?
- Are forbidden patterns documented?
- Are examples tied to real paths?

## Example Skeleton

```markdown
# ARCHITECTURE

## Bird's-Eye
[summary]

## Codemap
- [module entries]

## Data Flow
- [flow steps]

## Invariants
- [must/must-not list]

## Cross-Cutting Concerns
- [shared concerns]
```

## Success Criteria

- Architecture doc is short, navigable, and actionable.
- Invariants are explicit and testable.
- Engineers and agents can route work correctly on first pass.
