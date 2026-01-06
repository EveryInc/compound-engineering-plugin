---
name: file-todos
description: This skill should be used when managing file-based todos in the todos/ directory. Triggers on "create a todo", "add todo", "triage todos", "list pending items", "manage work items", "track technical debt", or requests to create, complete, or manage development tasks using markdown-based todo files.
license: MIT
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# File-Based Todo Tracking Skill

## Contents

- [Overview](#overview)
- [File Naming Convention](#file-naming-convention)
- [File Structure](#file-structure)
- [Common Workflows](#common-workflows)
- [Key Distinctions](#key-distinctions)
- [References](#references)

## Overview

The `todos/` directory contains a file-based tracking system for managing code review feedback, technical debt, feature requests, and work items. Each todo is a markdown file with YAML frontmatter and structured sections.

**Use when:**
- Creating new todos from findings or feedback
- Managing todo lifecycle (pending → ready → complete)
- Triaging pending items for approval
- Checking or managing dependencies
- Converting PR comments or code findings into tracked work

## File Naming Convention

```
{issue_id}-{status}-{priority}-{description}.md
```

| Component | Values | Example |
|-----------|--------|---------|
| issue_id | Sequential (001, 002...) | 003 |
| status | pending, ready, complete | ready |
| priority | p1 (critical), p2 (important), p3 (nice-to-have) | p1 |
| description | kebab-case brief description | fix-n-plus-1 |

**Examples:**
```
001-pending-p1-mailer-test.md
002-ready-p1-fix-n-plus-1.md
005-complete-p2-refactor-csv.md
```

## File Structure

Use the template at [todo-template.md](./assets/todo-template.md) when creating new todos.

**Required sections:** Problem Statement, Findings, Proposed Solutions, Recommended Action, Acceptance Criteria, Work Log

**Optional sections:** Technical Details, Resources, Notes

**YAML frontmatter:**
```yaml
---
status: ready              # pending | ready | complete
priority: p1              # p1 | p2 | p3
issue_id: "002"
tags: [rails, performance, database]
dependencies: ["001"]     # Issue IDs this is blocked by
---
```

## Common Workflows

### Creating a Todo

1. Get next ID: `ls todos/ | grep -o '^[0-9]\+' | sort -n | tail -1 | awk '{printf "%03d", $1+1}'`
2. Copy template: `cp assets/todo-template.md todos/{ID}-pending-{priority}-{desc}.md`
3. Fill required sections per [todo-template.md](./assets/todo-template.md)
4. Set status: `pending` (needs triage) or `ready` (pre-approved)

**Create a todo when:** work > 15 min, needs planning, has dependencies, or requires approval.
**Act immediately when:** work < 15 min, context is complete, no approval needed.

### Triaging Pending Items

1. List pending: `ls todos/*-pending-*.md`
2. Review Problem Statement, Findings, Proposed Solutions
3. Approve: rename `pending` → `ready`, update frontmatter, fill Recommended Action
4. Defer: leave as `pending`

**Use slash command:** `/triage` for interactive approval workflow

### Completing a Todo

1. Verify all acceptance criteria checked
2. Add final Work Log entry with results
3. Rename: `mv {file}-ready-{pri}-{desc}.md {file}-complete-{pri}-{desc}.md`
4. Update frontmatter: `status: complete`
5. Check for unblocked work: `grep -l 'dependencies:.*"002"' todos/*-ready-*.md`
6. Commit: `feat: resolve issue 002`

## Key Distinctions

| System | Purpose | Location |
|--------|---------|----------|
| **File-todos** (this skill) | Development/project tracking | `todos/` directory |
| **Rails Todo model** | User-facing feature | `app/models/todo.rb` |
| **TodoWrite tool** | In-memory session tracking | Not persisted |

## References

| File | Purpose |
|------|---------|
| [todo-template.md](./assets/todo-template.md) | Template for new todos |
| [dependency-management.md](./references/dependency-management.md) | Blocking/unblocking work |
| [quick-commands.md](./references/quick-commands.md) | Shell one-liners for common tasks |
| [integration-workflows.md](./references/integration-workflows.md) | Connecting with /triage, /resolve_pr_parallel |
