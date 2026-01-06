# File-Based Todo Tracking Skill

Manage file-based todos in the `todos/` directory with YAML frontmatter for status, priority, and dependency tracking.

## What This Skill Does

This skill provides a structured system for tracking development work items:

- **Todo creation** - Convert findings, feedback, or ideas into tracked work items
- **Status management** - Move items through pending → ready → complete lifecycle
- **Dependency tracking** - Block and unblock work based on prerequisites
- **Triage workflows** - Review and approve pending items
- **Code review integration** - Convert PR comments into actionable todos

## Common Workflows

### 1. Create a Todo from Code Review
Convert PR feedback into a tracked work item with priority and acceptance criteria.

```bash
# Get next ID
ls todos/ | grep -o '^[0-9]\+' | sort -n | tail -1 | awk '{printf "%03d", $1+1}'

# Create todo file
cp assets/todo-template.md todos/003-pending-p2-fix-validation.md
```

### 2. Triage Pending Items
Review pending todos and approve them for work.

```bash
# List pending items
ls todos/*-pending-*.md

# Approve by renaming pending → ready
mv todos/003-pending-p2-fix-validation.md todos/003-ready-p2-fix-validation.md
```

### 3. Complete a Todo
Mark work as done and update status.

```bash
# Rename ready → complete
mv todos/003-ready-p2-fix-validation.md todos/003-complete-p2-fix-validation.md
```

### 4. Check Dependencies
Find items blocked by a specific todo.

```bash
grep -l 'dependencies:.*"002"' todos/*-ready-*.md
```

### 5. Use Interactive Triage
Run the `/triage` slash command for a guided approval workflow.

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
skilz install file-todos --agent claude-code
```

#### Option 2: Install for OpenCode

```bash
skilz install file-todos --agent opencode
```

#### Option 3: Install for Gemini CLI

```bash
skilz install file-todos --agent gemini
```

#### Option 4: Install for OpenAI Codex

```bash
skilz install file-todos --agent codex
```

### Install from SkillzWave Marketplace

Visit [SkillzWave.ai](https://skillzwave.ai) to browse and install skills with one click.

## License

MIT
