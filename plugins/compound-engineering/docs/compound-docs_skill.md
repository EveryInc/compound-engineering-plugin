# Compound Docs Skill

Document solved problems as categorized knowledge base entries with YAML frontmatter for fast lookup and pattern recognition.

## What This Skill Does

This skill captures and organizes problem solutions to build searchable institutional knowledge:

- **Auto-detection** - Triggers on phrases like "that worked" or "it's fixed"
- **Categorized storage** - Organizes by problem type (performance, configuration, integration, type errors)
- **YAML validation** - Enforces schema compliance before saving
- **Cross-referencing** - Links related issues and detects patterns
- **Decision menu** - Guides next steps after documentation

## Common Workflows

### 1. Document a Fix After Confirmation
When you hear "that worked" or similar confirmation phrases.

```markdown
# The skill auto-invokes and creates:
docs/solutions/performance-issues/n-plus-one-briefs.md
```

### 2. Run Manual Documentation
Use the /doc-fix command for intentional documentation.

```bash
/doc-fix
```

### 3. Search Existing Solutions
Find previously documented solutions.

```bash
grep -l 'root_cause: connection' docs/solutions/**/*.md
```

### 4. Add to Required Reading
Mark critical solutions for team awareness.

```markdown
# After documentation, select option 2:
"Add to Required Reading"
```

### 5. Create a Skill from Pattern
When a solution becomes a recurring pattern.

```markdown
# After documentation, select option 5:
"Create new skill"
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
skilz install compound-docs --agent claude-code
```

#### Option 2: Install for OpenCode

```bash
skilz install compound-docs --agent opencode
```

#### Option 3: Install for Gemini CLI

```bash
skilz install compound-docs --agent gemini
```

#### Option 4: Install for OpenAI Codex

```bash
skilz install compound-docs --agent codex
```

### Install from SkillzWave Marketplace

Visit [SkillzWave.ai](https://skillzwave.ai) to browse and install skills with one click.

## License

MIT
