---
name: compound-docs
description: This skill should be used when documenting solved problems as categorized documentation with YAML frontmatter for fast lookup. Use after confirming a fix works, when hearing phrases like "that worked" or "it's fixed", or when running /doc-fix command.
license: MIT
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
metadata:
  version: "1.1.0"
  category: documentation
  tags: [knowledge-base, solutions, documentation, patterns]
preconditions:
  - Problem has been solved (not in-progress)
  - Solution has been verified working
---

# compound-docs Skill

## Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [7-Step Process Summary](#7-step-process-summary)
- [File Organization](#file-organization)
- [Integration Points](#integration-points)
- [References](#references)

## Overview

This skill captures problem solutions immediately after confirmation, creating structured documentation that serves as a searchable knowledge base for future sessions.

**Purpose:** Automatically document solved problems to build searchable institutional knowledge with category-based organization (enum-validated problem types).

**Organization:** Single-file architecture - each problem documented as one markdown file in its symptom category directory (e.g., `docs/solutions/performance-issues/n-plus-one-briefs.md`).

## Quick Start

**Trigger phrases:** "that worked", "it's fixed", "working now", "problem solved"

**Manual command:** `/doc-fix`

**Document when:**
- Multiple investigation attempts needed
- Tricky debugging that took time
- Non-obvious solution
- Future sessions would benefit

**Skip for:** Simple typos, obvious syntax errors, trivial fixes

## 7-Step Process Summary

| Step | Action | Blocking? |
|------|--------|-----------|
| 1. Detect | Auto-invoke on confirmation phrases | No |
| 2. Gather | Extract context from conversation | Yes (if missing info) |
| 3. Check | Search for similar existing docs | No |
| 4. Filename | Generate sanitized filename | No |
| 5. Validate | Validate YAML against schema | Yes (blocks until valid) |
| 6. Create | Write documentation file | No |
| 7. Cross-ref | Link related issues, detect patterns | No |

**Full process details:** See [7-step-process.md](./references/7-step-process.md)

## File Organization

**Directory structure:**
```
docs/solutions/
├── performance-issues/     # problem_type: performance_issue
├── configuration-errors/   # problem_type: configuration_error
├── integration-problems/   # problem_type: integration_problem
├── type-errors/           # problem_type: type_error
└── patterns/              # Cross-cutting patterns
    └── common-solutions.md
```

**Filename format:** `[sanitized-symptom]-[module]-[YYYYMMDD].md`

**Category mapping:** See [yaml-schema.md](./references/yaml-schema.md) for problem_type → category mapping.

## YAML Validation (CRITICAL)

All documentation requires validated YAML frontmatter. **BLOCK until valid.**

Required fields from [schema.yaml](./schema.yaml):
- `module`, `date`, `problem_type`, `component`
- `symptoms` (array 1-5 items)
- `root_cause`, `severity`, `tags`

Validation errors must be shown and corrected before proceeding.

## Decision Menu

After successful documentation, present:

```
✓ Solution documented

What's next?
1. Continue workflow (recommended)
2. Add to Required Reading
3. Link related issues
4. Add to existing skill
5. Create new skill
6. View documentation
7. Other
```

**Full menu details:** See [decision-menu.md](./references/decision-menu.md)

## Integration Points

**Invoked by:**
- `/compound` command (primary interface)
- Manual invocation after solution confirmed
- Auto-triggered by confirmation phrases

**Invokes:** None (terminal skill)

**Handoff:** All context needed should be present in conversation history.

## References

### Reference Documentation

| File | Purpose |
|------|---------|
| [7-step-process.md](./references/7-step-process.md) | Detailed step-by-step documentation process |
| [yaml-schema.md](./references/yaml-schema.md) | YAML frontmatter schema and category mapping |
| [decision-menu.md](./references/decision-menu.md) | Post-documentation options and handlers |
| [guidelines.md](./references/guidelines.md) | Error handling, quality checklist, success criteria |
| [example-scenario.md](./references/example-scenario.md) | Complete worked example |

### Assets (Templates)

| File | Purpose |
|------|---------|
| [resolution-template.md](./assets/resolution-template.md) | Template for documentation files |
| [critical-pattern-template.md](./assets/critical-pattern-template.md) | Template for Required Reading entries |
| [schema.yaml](./schema.yaml) | YAML validation schema |
