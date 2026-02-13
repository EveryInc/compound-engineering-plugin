# Progressive Disclosure

## Overview

Progressive disclosure gives agents a clear map first, then detail on demand.
The goal is fast orientation without context overload.

## Principle

`CLAUDE.md` is a map, not a manual.
Keep it compact and point to deeper documents.

## Target Shape

```text
CLAUDE.md
docs/
  ARCHITECTURE.md
  CONVENTIONS.md
  TECH_DEBT.md
  QUALITY_SCORE.md
  design-docs/
  plans/
  solutions/
```

## CLAUDE.md Guidelines

- Target length: around 100 lines.
- Include mission, structure map, and common commands.
- Link to deeper docs.
- Avoid pasting full policies inline.

## What to Put in CLAUDE.md

- Repo purpose and boundaries.
- Directory map with one-line descriptions.
- Where conventions live.
- Where architecture docs live.
- Where active plans live.
- How to run key quality commands.

## What Not to Put in CLAUDE.md

- Full style guide text.
- Long architecture narratives.
- Historical changelog content.
- Large troubleshooting catalogs.

## Two-Hop Navigation Rule

From `CLAUDE.md`, an agent should reach needed depth in two clicks/opens:

- Hop 1: map to the correct document.
- Hop 2: document section with actionable guidance.

## Documentation Layers

### Layer 1: Orientation

- `CLAUDE.md`
- `README.md`

### Layer 2: Operating Rules

- `docs/CONVENTIONS.md`
- `docs/TECH_DEBT.md`
- `docs/QUALITY_SCORE.md`

### Layer 3: Deep Technical Context

- `docs/ARCHITECTURE.md`
- `docs/design-docs/*.md`
- `docs/solutions/**/*.md`

## File Naming Strategy

- Single canonical docs in `SCREAMING_CASE.md`.
- Collections in lowercase directories.
- Stable names preferred over thematic renames.

## Cross-Linking Standard

Every core doc should link to:

- One upstream map.
- One downstream deep reference.

Example:

- `CLAUDE.md` -> `docs/CONVENTIONS.md`
- `docs/CONVENTIONS.md` -> specific solution docs.

## Review Prompts for Disclosure Quality

- Can a new contributor find conventions in <30 seconds?
- Can an agent find architecture boundaries without scanning the full repo?
- Are deep docs discoverable from map docs?

## Anti-Patterns

- Giant CLAUDE files with mixed responsibilities.
- Duplicate policy text across many docs.
- Deep docs with no links from the map.
- Hidden conventions only in old PR comments.

## Migration Strategy

If current docs are monolithic:

1. Extract one map doc.
2. Split policy docs by topic.
3. Add links from map to policy docs.
4. Add links from policy docs to examples.

## Example CLAUDE.md Skeleton

```markdown
# Project Map

## What This Repo Does
[summary]

## Directory Structure
- app/: [purpose]
- docs/: [purpose]

## Conventions
See docs/CONVENTIONS.md

## Architecture
See docs/ARCHITECTURE.md

## Active Plans
See docs/plans/
```

## Quality Signals

Healthy progressive disclosure has:

- Short map docs.
- Explicit links.
- Limited duplication.
- Fast onboarding.

## Operational Check

```bash
wc -l CLAUDE.md
rg -n "docs/CONVENTIONS.md|docs/ARCHITECTURE.md|docs/TECH_DEBT.md" CLAUDE.md
```

## Success Criteria

- Agents start with clear orientation.
- Deep detail is available only when needed.
- Documentation stays maintainable as the repo grows.
