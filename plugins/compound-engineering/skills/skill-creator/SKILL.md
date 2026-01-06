---
name: skill-creator
description: This skill should be used when creating a new skill or updating an existing skill that extends Claude's capabilities with specialized knowledge, workflows, or tool integrations.
license: Complete terms in LICENSE.txt
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
metadata:
  version: "1.1.0"
  category: development
  tags: [skills, creation, templates, workflows]
---

# Skill Creator

## Contents

- [Overview](#overview)
- [Skill Anatomy](#skill-anatomy)
- [6-Step Creation Process](#6-step-creation-process)
- [Writing Guidelines](#writing-guidelines)
- [References](#references)

## Overview

Skills are modular, self-contained packages that extend Claude's capabilities by providing specialized knowledge, workflows, and tools. They transform Claude from a general-purpose agent into a specialized agent equipped with procedural knowledge.

**Skills provide:**
- Specialized workflows - Multi-step procedures for specific domains
- Tool integrations - Instructions for working with file formats or APIs
- Domain expertise - Company-specific knowledge, schemas, business logic
- Bundled resources - Scripts, references, and assets for complex tasks

## Skill Anatomy

Every skill consists of a required SKILL.md and optional bundled resources:

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/      - Executable code
    ├── references/   - Documentation loaded as needed
    └── assets/       - Files used in output
```

**Metadata quality:** The `name` and `description` in YAML frontmatter determine when Claude uses the skill. Use third-person: "This skill should be used when..." not "Use this skill when..."

**Full bundled resources guide:** See [bundled-resources.md](./references/bundled-resources.md)

## 6-Step Creation Process

| Step | Action | Skip When |
|------|--------|-----------|
| 1 | Gather concrete usage examples | Already understood |
| 2 | Plan reusable contents | Simple skill |
| 3 | Initialize with `init_skill.py` | Updating existing skill |
| 4 | Edit SKILL.md and resources | N/A |
| 5 | Package with `package_skill.py` | Not distributing |
| 6 | Iterate based on testing | Perfect first time |

### Step 1: Understanding with Examples

Gather concrete examples of skill usage. See [planning-examples.md](./references/planning-examples.md) for detailed guidance.

**Key questions:**
- "What functionality should this skill support?"
- "What would a user say that should trigger this skill?"
- "Can you give examples of how this skill would be used?"

### Step 2: Planning Reusable Contents

For each example, identify:
- **Scripts:** Code that would be rewritten repeatedly
- **References:** Documentation Claude should reference while working
- **Assets:** Templates or files used in output

### Step 3: Initializing the Skill

Run the initialization script to create a template skill:

```bash
scripts/init_skill.py <skill-name> --path <output-directory>
```

The script creates:
- SKILL.md template with proper frontmatter and TODOs
- Example `scripts/`, `references/`, `assets/` directories

### Step 4: Editing the Skill

Focus on information that would be beneficial and non-obvious to Claude.

**Start with:** Reusable resources (`scripts/`, `references/`, `assets/`)
- May require user input (e.g., brand assets, documentation)
- Delete example files not needed for the skill

**Then update SKILL.md answering:**
1. What is the purpose of the skill?
2. When should the skill be used?
3. How should Claude use the skill's resources?

### Step 5: Packaging

Package the skill for distribution:

```bash
scripts/package_skill.py <path/to/skill-folder> [output-dir]
```

The script validates then packages:
- YAML frontmatter format and required fields
- Description completeness and quality
- File organization and resource references
- Creates zip file maintaining directory structure

### Step 6: Iterate

After testing, implement improvements:
1. Use the skill on real tasks
2. Notice struggles or inefficiencies
3. Update SKILL.md or bundled resources
4. Test again

## Writing Guidelines

**Use imperative/infinitive form** (verb-first instructions):
- "To accomplish X, do Y" rather than "You should do X"

**Keep SKILL.md lean:**
- Essential procedural instructions only
- Move detailed reference material to `references/`
- Avoid duplication between SKILL.md and references

## References

### Reference Documentation

| File | Purpose |
|------|---------|
| [bundled-resources.md](./references/bundled-resources.md) | Scripts, references, assets guide |
| [planning-examples.md](./references/planning-examples.md) | Example analysis for skill planning |

### Scripts

| Script | Purpose |
|--------|---------|
| [init_skill.py](./scripts/init_skill.py) | Initialize new skill from template |
| [package_skill.py](./scripts/package_skill.py) | Validate and package skill for distribution |
| [quick_validate.py](./scripts/quick_validate.py) | Quick validation of skill structure |
