# Skill Creator Skill

Create and update Claude Code Skills with specialized knowledge, workflows, and tool integrations following best practices.

## What This Skill Does

This skill guides the creation of effective Claude Code Skills:

- **Template generation** - Initialize skills with proper structure
- **YAML frontmatter** - Ensure correct metadata format
- **Progressive disclosure** - Organize content efficiently
- **Bundled resources** - Add scripts, references, and assets
- **Validation** - Check skills against the specification
- **Packaging** - Prepare skills for distribution

## Common Workflows

### 1. Initialize a New Skill
Create a skill template with proper structure.

```bash
scripts/init_skill.py my-new-skill --path ./skills/
```

### 2. Plan Skill Contents
Gather examples before writing.

```markdown
# Ask:
# - "What functionality should this skill support?"
# - "What would a user say that should trigger this skill?"
# - "Can you give examples of how this skill would be used?"
```

### 3. Add Reference Documentation
Move detailed content to references for token efficiency.

```markdown
# In SKILL.md, link to references:
See [detailed-guide.md](./references/detailed-guide.md) for full documentation.
```

### 4. Validate Skill Structure
Check a skill against the specification.

```bash
scripts/quick_validate.py ./skills/my-skill/
```

### 5. Package for Distribution
Prepare a skill for sharing.

```bash
scripts/package_skill.py ./skills/my-skill/ ./dist/
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
skilz install skill-creator --agent claude-code
```

#### Option 2: Install for OpenCode

```bash
skilz install skill-creator --agent opencode
```

#### Option 3: Install for Gemini CLI

```bash
skilz install skill-creator --agent gemini
```

#### Option 4: Install for OpenAI Codex

```bash
skilz install skill-creator --agent codex
```

### Install from SkillzWave Marketplace

Visit [SkillzWave.ai](https://skillzwave.ai) to browse and install skills with one click.

## License

Complete terms in LICENSE.txt
