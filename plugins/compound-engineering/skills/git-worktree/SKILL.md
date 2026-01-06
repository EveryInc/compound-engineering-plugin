---
name: git-worktree
description: This skill should be used when managing Git worktrees for isolated parallel development. Triggers include code review workflows, parallel feature development, and worktree cleanup after PR completion. It handles creating, listing, switching, and cleaning up worktrees.
license: MIT
allowed-tools:
  - Bash
  - Read
---

# Git Worktree Manager

## Contents

- [Overview](#overview)
- [When to Use](#when-to-use)
- [Commands](#commands)
- [Workflow Examples](#workflow-examples)
- [Integration with Workflows](#integration-with-workflows)
- [References](#references)

## Overview

This skill provides worktree management for isolated PR reviews and parallel feature development.

**Capabilities:**
- Create worktrees from main branch with clear branch names
- List worktrees with current status
- Switch between worktrees for parallel work
- Clean up completed worktrees automatically
- Automatic .gitignore management for worktree directory
- Automatic .env file copying from main repo to new worktrees

## CRITICAL: Always Use the Manager Script

**Never call `git worktree add` directly.** Always use the `worktree-manager.sh` script.

The script handles critical setup that raw git commands do not:
1. Copies `.env`, `.env.local`, `.env.test`, etc. from main repo
2. Ensures `.worktrees` is in `.gitignore`
3. Creates consistent directory structure

```bash
# ✅ CORRECT - Always use the script
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh create feature-name

# ❌ WRONG - Never do this directly
git worktree add .worktrees/feature-name -b feature-name main
```

## When to Use

| Scenario | Trigger |
|----------|---------|
| Code Review (`/workflows:review`) | If NOT already on the PR branch, offer worktree for isolated review |
| Feature Work (`/workflows:work`) | Ask if parallel worktree or live branch work is preferred |
| Parallel Development | When working on multiple features simultaneously |
| Cleanup | After completing work in a worktree |

## Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `create <branch> [from]` | Create new worktree | `... create feature-login` |
| `list` / `ls` | List all worktrees | `... list` |
| `switch <name>` / `go` | Switch to worktree | `... switch feature-login` |
| `copy-env <name>` | Copy .env files | `... copy-env feature-login` |
| `cleanup` / `clean` | Remove inactive worktrees | `... cleanup` |

Full command prefix: `bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh`

### Create Behavior

1. Checks if worktree already exists
2. Updates the base branch from remote
3. Creates new worktree and branch
4. Copies all .env files from main repo
5. Shows path for cd-ing to the worktree

### Cleanup Behavior

1. Lists all inactive worktrees
2. Asks for confirmation
3. Removes selected worktrees
4. Cleans up empty directories

## Workflow Examples

### Code Review with Worktree

```bash
# Claude Code recognizes the current branch differs from the PR branch
# Offers: "Use worktree for isolated review? (y/n)"

# If confirmed, the script runs (copies .env files automatically):
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh create pr-123-feature-name

# The working directory is now the isolated worktree with all env vars
cd .worktrees/pr-123-feature-name

# After review, return to main and cleanup:
cd ../..
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh cleanup
```

### Parallel Feature Development

```bash
# Create first feature worktree (copies .env files):
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh create feature-login

# Create second feature worktree (also copies .env files):
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh create feature-notifications

# List available worktrees:
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh list

# Switch between worktrees:
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh switch feature-login

# Return to main and cleanup when done:
cd .
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh cleanup
```

## Integration with Workflows

### `/workflows:review`

1. Check current branch
2. If ALREADY on PR branch → stay there, no worktree needed
3. If DIFFERENT branch → offer worktree: "Use worktree for isolated review? (y/n)"
   - yes → call git-worktree skill
   - no → proceed with PR diff on current branch

### `/workflows:work`

1. Ask: "How do you want to work?
   1. New branch on current worktree (live work)
   2. Worktree (parallel work)"
2. Choice 1 → create new branch normally
3. Choice 2 → call git-worktree skill to create from main

## Key Principles

- **One manager script** handles all worktree operations
- **Simple commands** with sensible defaults
- **Interactive prompts** prevent accidental operations
- **Worktrees always from main** (unless specified)
- **Worktrees stored in .worktrees/** directory

## References

| File | Purpose |
|------|---------|
| [worktree-manager.sh](./scripts/worktree-manager.sh) | Manager script for all operations |
| [troubleshooting.md](./references/troubleshooting.md) | Common issues and solutions |
| [technical-details.md](./references/technical-details.md) | Directory structure, performance, internals |
