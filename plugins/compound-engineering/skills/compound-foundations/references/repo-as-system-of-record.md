# Repo as System of Record

## Overview

If knowledge is not in the repo, agents cannot reliably use it.
Conversations and memory are not durable interfaces.

## Principle

Store operational, architectural, and product knowledge in versioned files.
Prefer stable paths and explicit links.

## What Belongs in the Repo

- Architecture boundaries and data flow.
- Conventions and coding policies.
- Known debt and quality status.
- Incident solutions and prevention notes.
- Active plans and execution status.
- Product specs that influence code behavior.

## Recommended Doc Topology

```text
docs/
  ARCHITECTURE.md
  CONVENTIONS.md
  TECH_DEBT.md
  QUALITY_SCORE.md
  design-docs/
  plans/
  solutions/
```

## Decision Capture Standard

For important technical decisions, record:

- Decision statement.
- Context.
- Alternatives considered.
- Why this path was chosen.
- Consequences/tradeoffs.

Store in `docs/design-docs/`.

## Solution Capture Standard

For resolved incidents, store in `docs/solutions/` with:

- Frontmatter metadata.
- Symptoms.
- Root cause.
- Working fix.
- Prevention guidance.

## Plan Capture Standard

Plan files should include status frontmatter:

- `status: active` while in progress.
- `status: completed` when shipped.

This enables simple grep-based filtering.

## Required Links

- `CLAUDE.md` -> core docs.
- Conventions -> source solution docs.
- Debt entries -> source solution docs.
- Changelog entries -> major doc artifacts when relevant.

## Update Discipline

When behavior changes:

1. Update code.
2. Update conventions if rule changed.
3. Update architecture map if boundaries changed.
4. Update debt/quality artifacts as needed.

## Review Checks

Before merge, ask:

- Are new operational assumptions documented?
- Are behavior-changing rules reflected in conventions?
- Are new incident patterns captured for future lookup?

## Anti-Patterns

- "We'll remember this" with no doc update.
- Architecture only in slide decks.
- Conventions only in reviewer comments.
- Multiple conflicting source-of-truth files.

## Minimal vs Complete

Start minimal with core docs.
Expand only as complexity grows.
Do not create empty docs just for checkbox compliance.

## Traceability Benefits

A repo system-of-record gives:

- Repeatable onboarding.
- Faster incident resolution.
- Better agent performance.
- Auditability of technical decisions.

## Migration Strategy

If docs are scattered:

1. Pick canonical paths.
2. Move/merge duplicates.
3. Add redirects or links from old locations.
4. Remove dead docs.

## Example Canonical Paths

- `docs/CONVENTIONS.md`
- `docs/TECH_DEBT.md`
- `docs/ARCHITECTURE.md`
- `docs/solutions/`

## Practical Commands

```bash
# List core docs and timestamps
ls -lah docs/CONVENTIONS.md docs/TECH_DEBT.md docs/ARCHITECTURE.md

# Find docs missing source links
rg -n "Source:" docs/CONVENTIONS.md docs/TECH_DEBT.md
```

## Success Criteria

- Key engineering knowledge is versioned and discoverable.
- No critical process depends on tribal memory.
- Agents can resolve common tasks from repo context alone.
