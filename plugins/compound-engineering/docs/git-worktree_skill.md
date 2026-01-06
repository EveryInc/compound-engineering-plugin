# Git Worktree Manager Skill

Manage Git worktrees for isolated parallel development, code review workflows, and safe feature development.

## What This Skill Does

This skill provides a complete toolkit for Git worktree management:

- **Parallel development** - Work on multiple features simultaneously in isolated directories
- **Code review isolation** - Review PRs without switching branches or losing work
- **Branch safety** - Create, switch, and cleanup worktrees with proper env file handling
- **Automatic setup** - Copies .env files and manages .gitignore entries
- **Workflow integration** - Works with /workflows:review and /workflows:work commands

## Common Workflows

### 1. Isolated PR Review
Create a worktree for reviewing a PR without affecting current work.

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh create pr-123-feature-name
cd .worktrees/pr-123-feature-name
# Review code, run tests
cd ../..
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh cleanup
```

### 2. Parallel Feature Development
Work on two features simultaneously without branch switching.

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh create feature-login
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh create feature-dashboard
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh list
```

### 3. Switch Between Worktrees
Navigate between active worktrees.

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh switch feature-login
```

### 4. Copy Environment Files
Ensure a worktree has all necessary env files.

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh copy-env feature-login
```

### 5. Cleanup After Completion
Remove completed worktrees and clean up.

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh cleanup
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
skilz install git-worktree --agent claude-code
```

#### Option 2: Install for OpenCode

```bash
skilz install git-worktree --agent opencode
```

#### Option 3: Install for Gemini CLI

```bash
skilz install git-worktree --agent gemini
```

#### Option 4: Install for OpenAI Codex

```bash
skilz install git-worktree --agent codex
```

### Install from SkillzWave Marketplace

Visit [SkillzWave.ai](https://skillzwave.ai) to browse and install skills with one click.

## Requirements

- Git 2.5+ (worktree support)
- Bash shell

## License

MIT
