# Creating Agent Skills Skill

Create, write, and refine Claude Code Skills following Anthropic's official specification and best practices.

## What This Skill Does

This skill teaches how to create effective Claude Code Skills:

- **Structure guidance** - YAML frontmatter and markdown body format
- **Progressive disclosure** - Keep SKILL.md lean, use references
- **Naming conventions** - Gerund form (verb + -ing) patterns
- **Effective descriptions** - Trigger keywords and discovery
- **Audit skills** - Check against best practices rubric
- **Common patterns** - Templates, workflows, conditionals

## Common Workflows

### 1. Create a New Skill
Start with proper YAML frontmatter and structure.

```markdown
---
name: your-skill-name
description: [What it does]. Use when [trigger conditions].
---

# Your Skill Name

## Quick Start
[Immediate actionable example]

## Instructions
[Core guidance]

## Examples
[Input/output pairs]
```

### 2. Write Effective Descriptions
Include what the skill does AND when to use it.

```yaml
# Good:
description: Extracts text and tables from PDF files. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.

# Bad:
description: Helps with documents
```

### 3. Add Reference Files
Move detailed content to separate files for token efficiency.

```markdown
For API reference, see [REFERENCE.md](REFERENCE.md).
For form filling guide, see [FORMS.md](FORMS.md).
```

### 4. Audit an Existing Skill
Check against the best practices rubric.

```markdown
- [ ] Valid YAML frontmatter (name + description)
- [ ] Description includes trigger keywords
- [ ] Uses standard markdown headings
- [ ] SKILL.md under 500 lines
- [ ] Examples are concrete, not abstract
```

### 5. Add a Workflow Pattern
Structure complex multi-step tasks.

```markdown
## Migration Workflow

Copy this checklist:
- [ ] Step 1: Backup database
- [ ] Step 2: Run migration script
- [ ] Step 3: Validate output
```

## Agent Skill Standard

This skill follows the [Agent Skill Standard](https://agentskills.io/), an open standard for portable AI coding agent skills. This means it works across 14+ AI coding agents including:

- Claude Code
- OpenAI Codex
- OpenCode
- Cursor
- Gemini CLI
- GitHub Copilot CLI
- Windsurf
- And more...

## Installing with Skilz (Universal Installer)

The recommended way to install this skill across different AI coding agents is using the **skilz** universal installer.

### Install Skilz

```bash
pip install skilz
```

### Installation Options

#### Option 1: Install for Claude Code

```bash
skilz install create-agent-skills --agent claude-code
```

#### Option 2: Install for OpenCode

```bash
skilz install create-agent-skills --agent opencode
```

#### Option 3: Install for Gemini CLI

```bash
skilz install create-agent-skills --agent gemini
```

#### Option 4: Install for OpenAI Codex

```bash
skilz install create-agent-skills --agent codex
```

### Install from SkillzWave Marketplace

Visit [SkillzWave.ai](https://skillzwave.ai) to browse and install skills with one click.

## License

MIT
