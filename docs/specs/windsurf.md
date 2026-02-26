# Windsurf Editor Global Configuration Guide

> **Purpose**: Technical reference for programmatically creating and managing Windsurf's global Skills, Workflows, and Rules.
>
> **Source**: Official Windsurf documentation at [docs.windsurf.com](https://docs.windsurf.com) + local file analysis.
>
> **Last Updated**: February 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Base Directory Structure](#base-directory-structure)
3. [Skills](#skills)
4. [Workflows](#workflows)
5. [Rules](#rules)
6. [Memories](#memories)
7. [System-Level Configuration (Enterprise)](#system-level-configuration-enterprise)
8. [Programmatic Creation Reference](#programmatic-creation-reference)
9. [Best Practices](#best-practices)

---

## Overview

Windsurf provides three main customization mechanisms:

| Feature | Purpose | Invocation |
|---------|---------|------------|
| **Skills** | Complex multi-step tasks with supporting resources | Automatic (progressive disclosure) or `@skill-name` |
| **Workflows** | Reusable step-by-step procedures | Slash command `/workflow-name` |
| **Rules** | Behavioral guidelines and preferences | Trigger-based (always-on, glob, manual, or model decision) |

All three support both **workspace-level** (project-specific) and **global** (user-wide) scopes.

---

## Base Directory Structure

### Global Configuration Root

| OS | Path |
|----|------|
| **Windows** | `C:\Users\{USERNAME}\.codeium\windsurf\` |
| **macOS** | `~/.codeium/windsurf/` |
| **Linux** | `~/.codeium/windsurf/` |

### Directory Layout

```
~/.codeium/windsurf/
├── skills/                    # Global skills (directories)
│   └── {skill-name}/
│       └── SKILL.md
├── global_workflows/           # Global workflows (flat .md files)
│   └── {workflow-name}.md
├── rules/                     # Global rules (flat .md files)  
│   └── {rule-name}.md
├── memories/
│   ├── global_rules.md        # Always-on global rules (plain text)
│   └── *.pb                   # Auto-generated memories (protobuf)
├── mcp_config.json            # MCP server configuration
└── user_settings.pb           # User settings (protobuf)
```

---

## Skills

Skills bundle instructions with supporting resources for complex, multi-step tasks. Cascade uses **progressive disclosure** to automatically invoke skills when relevant.

### Storage Locations

| Scope | Location |
|-------|----------|
| **Global** | `~/.codeium/windsurf/skills/{skill-name}/SKILL.md` |
| **Workspace** | `.windsurf/skills/{skill-name}/SKILL.md` |

### Directory Structure

Each skill is a **directory** (not a single file) containing:

```
{skill-name}/
├── SKILL.md              # Required: Main skill definition
├── references/           # Optional: Reference documentation
├── assets/               # Optional: Images, diagrams, etc.
├── scripts/              # Optional: Helper scripts
└── {any-other-files}     # Optional: Templates, configs, etc.
```

### SKILL.md Format

```markdown
---
name: skill-name
description: Brief description shown to model to help it decide when to invoke the skill
---

# Skill Title

Instructions for the skill go here in markdown format.

## Section 1
Step-by-step guidance...

## Section 2
Reference supporting files using relative paths:
- See [deployment-checklist.md](./deployment-checklist.md)
- Run script: [deploy.sh](./scripts/deploy.sh)
```

### Required YAML Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | **Yes** | Unique identifier (lowercase letters, numbers, hyphens only). Must match directory name. |
| `description` | **Yes** | Explains what the skill does and when to use it. Critical for automatic invocation. |

### Naming Convention

- Use **lowercase-kebab-case**: `deploy-to-staging`, `code-review`, `setup-dev-environment`
- Name must match the directory name exactly

### Invocation Methods

1. **Automatic**: Cascade automatically invokes when request matches skill description
2. **Manual**: Type `@skill-name` in Cascade input

### Example: Complete Skill

```
~/.codeium/windsurf/skills/deploy-to-production/
├── SKILL.md
├── deployment-checklist.md
├── rollback-procedure.md
└── config-template.yaml
```

**SKILL.md:**
```markdown
---
name: deploy-to-production
description: Guides the deployment process to production with safety checks. Use when deploying to prod, releasing, or pushing to production environment.
---

## Pre-deployment Checklist
1. Run all tests
2. Check for uncommitted changes
3. Verify environment variables

## Deployment Steps
Follow these steps to deploy safely...

See [deployment-checklist.md](./deployment-checklist.md) for full checklist.
See [rollback-procedure.md](./rollback-procedure.md) if issues occur.
```

---

## Workflows

Workflows define step-by-step procedures invoked via slash commands. They guide Cascade through repetitive tasks.

### Storage Locations

| Scope | Location |
|-------|----------|
| **Global** | `~/.codeium/windsurf/global_workflows/{workflow-name}.md` |
| **Workspace** | `.windsurf/workflows/{workflow-name}.md` |

### File Format

Workflows are **single markdown files** (not directories):

```markdown
---
description: Short description of what the workflow does
---

# Workflow Title

> Arguments: [optional arguments description]

Step-by-step instructions in markdown.

1. First step
2. Second step
3. Third step
```

### Required YAML Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `description` | **Yes** | Short title/description shown in UI |

### Invocation

- Slash command: `/workflow-name`
- Filename becomes the command (e.g., `deploy.md` → `/deploy`)

### Constraints

- **Character limit**: 12,000 characters per workflow file
- Workflows can call other workflows: Include instructions like "Call `/other-workflow`"

### Example: Complete Workflow

**File**: `~/.codeium/windsurf/global_workflows/address-pr-comments.md`

```markdown
---
description: Address all PR review comments systematically
---

# Address PR Comments

> Arguments: [PR number]

1. Check out the PR branch: `gh pr checkout [id]`

2. Get comments on PR:
   ```bash
   gh api --paginate repos/[owner]/[repo]/pulls/[id]/comments | jq '.[] | {user: .user.login, body, path, line}'
   ```

3. For EACH comment:
   a. Print: "(index). From [user] on [file]:[lines] — [body]"
   b. Analyze the file and line range
   c. If unclear, ask for clarification
   d. Make the change before moving to next comment

4. Summarize what was done and which comments need attention
```

---

## Rules

Rules provide persistent behavioral guidelines that influence how Cascade responds.

### Storage Locations

| Scope | Location |
|-------|----------|
| **Global** | `~/.codeium/windsurf/rules/{rule-name}.md` |
| **Workspace** | `.windsurf/rules/{rule-name}.md` |

### File Format

Rules are **single markdown files**:

```markdown
---
description: When to use this rule
trigger: activation_mode
globs: ["*.py", "src/**/*.ts"]
---

Rule instructions in markdown format.

- Guideline 1
- Guideline 2
- Guideline 3
```

### YAML Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `description` | **Yes** | Describes when to use the rule |
| `trigger` | Optional | Activation mode (see below) |
| `globs` | Optional | File patterns for glob trigger |

### Activation Modes (trigger field)

| Mode | Value | Description |
|------|-------|-------------|
| **Manual** | `manual` | Activated via `@mention` in Cascade input |
| **Always On** | `always` | Always applied to every conversation |
| **Model Decision** | `model_decision` | Model decides based on description |
| **Glob** | `glob` | Applied when working with files matching pattern |

### Constraints

- **Character limit**: 12,000 characters per rule file

### Example: Complete Rule

**File**: `~/.codeium/windsurf/rules/python-style.md`

```markdown
---
description: Python coding standards and style guidelines. Use when writing or reviewing Python code.
trigger: glob
globs: ["*.py", "**/*.py"]
---

# Python Coding Guidelines

- Use type hints for all function parameters and return values
- Follow PEP 8 style guide
- Use early returns when possible
- Always add docstrings to public functions and classes
- Prefer f-strings over .format() or % formatting
- Use pathlib instead of os.path for file operations
```

---

## Memories

### Global Rules (Always-On)

**Location**: `~/.codeium/windsurf/memories/global_rules.md`

This is a special file for rules that **always apply** to all conversations. Unlike rules in the `rules/` directory, this file:

- Does **not** require YAML frontmatter
- Is plain text/markdown
- Is always active (no trigger configuration)

**Format:**
```markdown
Plain text rules that always apply to all conversations.

- Rule 1
- Rule 2
- Rule 3
```

### Auto-Generated Memories

Cascade automatically creates memories during conversations, stored as `.pb` (protobuf) files in `~/.codeium/windsurf/memories/`. These are managed by Windsurf and should not be manually edited.

---

## System-Level Configuration (Enterprise)

Enterprise organizations can deploy system-level configurations that apply globally and cannot be modified by end users.

### System-Level Paths

| Type | Windows | macOS | Linux/WSL |
|------|---------|-------|-----------|
| **Rules** | `C:\ProgramData\Windsurf\rules\*.md` | `/Library/Application Support/Windsurf/rules/*.md` | `/etc/windsurf/rules/*.md` |
| **Workflows** | `C:\ProgramData\Windsurf\workflows\*.md` | `/Library/Application Support/Windsurf/workflows/*.md` | `/etc/windsurf/workflows/*.md` |

### Precedence Order

When items with the same name exist at multiple levels:

1. **System** (highest priority) - Organization-wide, deployed by IT
2. **Workspace** - Project-specific in `.windsurf/`
3. **Global** - User-defined in `~/.codeium/windsurf/`
4. **Built-in** - Default items provided by Windsurf

---

## Programmatic Creation Reference

### Quick Reference Table

| Type | Path Pattern | Format | Key Fields |
|------|--------------|--------|------------|
| **Skill** | `skills/{name}/SKILL.md` | YAML frontmatter + markdown | `name`, `description` |
| **Workflow** | `global_workflows/{name}.md` (global) or `workflows/{name}.md` (workspace) | YAML frontmatter + markdown | `description` |
| **Rule** | `rules/{name}.md` | YAML frontmatter + markdown | `description`, `trigger`, `globs` |
| **Global Rules** | `memories/global_rules.md` | Plain text/markdown | None |

### Minimal Templates

#### Skill (SKILL.md)
```markdown
---
name: my-skill
description: What this skill does and when to use it
---

Instructions here.
```

#### Workflow
```markdown
---
description: What this workflow does
---

1. Step one
2. Step two
```

#### Rule
```markdown
---
description: When this rule applies
trigger: model_decision
---

- Guideline one
- Guideline two
```

### Validation Checklist

When programmatically creating items:

- [ ] **Skills**: Directory exists with `SKILL.md` inside
- [ ] **Skills**: `name` field matches directory name exactly
- [ ] **Skills**: Name uses only lowercase letters, numbers, hyphens
- [ ] **Workflows/Rules**: File is `.md` extension
- [ ] **All**: YAML frontmatter uses `---` delimiters
- [ ] **All**: `description` field is present and meaningful
- [ ] **All**: File size under 12,000 characters (workflows/rules)

---

## Best Practices

### Writing Effective Descriptions

The `description` field is critical for automatic invocation. Be specific:

**Good:**
```yaml
description: Guides deployment to staging environment with pre-flight checks. Use when deploying to staging, testing releases, or preparing for production.
```

**Bad:**
```yaml
description: Deployment stuff
```

### Formatting Guidelines

- Use bullet points and numbered lists (easier for Cascade to follow)
- Use markdown headers to organize sections
- Keep rules concise and specific
- Avoid generic rules like "write good code" (already built-in)

### XML Tags for Grouping

XML tags can effectively group related rules:

```markdown
<coding_guidelines>
- Use early returns when possible
- Always add documentation for new functions
- Prefer composition over inheritance
</coding_guidelines>

<testing_requirements>
- Write unit tests for all public methods
- Maintain 80% code coverage
</testing_requirements>
```

### Skills vs Rules vs Workflows

| Use Case | Recommended |
|----------|-------------|
| Multi-step procedure with supporting files | **Skill** |
| Repeatable CLI/automation sequence | **Workflow** |
| Coding style preferences | **Rule** |
| Project conventions | **Rule** |
| Deployment procedure | **Skill** or **Workflow** |
| Code review checklist | **Skill** |

---

## Additional Resources

- **Official Documentation**: [docs.windsurf.com](https://docs.windsurf.com)
- **Skills Specification**: [agentskills.io](https://agentskills.io/home)
- **Rule Templates**: [windsurf.com/editor/directory](https://windsurf.com/editor/directory)
