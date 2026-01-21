# Compound Marketplace

A Claude Code plugin marketplace featuring the **Compound Engineering Plugin** — tools that make each unit of engineering work easier than the last.

## Install

### Option 1: SkillKit (Multi-Agent Support)

Use [skillkit](https://github.com/rohitg00/skillkit) to install across multiple AI agents:

```bash
# Install compound engineering skills
npx skillkit install EveryInc/compound-engineering-plugin

# Install to multiple agents at once
npx skillkit install EveryInc/compound-engineering-plugin --agent cursor --agent claude-code --agent windsurf
```

**Why SkillKit?**
- **Multi-agent sync**: Install and sync skills across 17+ AI agents (Claude Code, Cursor, Codex, Gemini CLI, Windsurf, Goose, Amp, and more)
- **Auto-detection**: Automatically detects which AI agent you're using
- **Global or project-level**: Install skills globally (`--global`) or per-project

### Option 2: Claude Code Plugin

```bash
/plugin marketplace add https://github.com/kieranklaassen/compound-engineering-plugin
/plugin install compound-engineering
```

## Workflow

```
Plan → Work → Review → Compound → Repeat
```

| Command | Purpose |
|---------|---------|
| `/workflows:plan` | Turn feature ideas into detailed implementation plans |
| `/workflows:work` | Execute plans with worktrees and task tracking |
| `/workflows:review` | Multi-agent code review before merging |
| `/workflows:compound` | Document learnings to make future work easier |

Each cycle compounds: plans inform future plans, reviews catch more issues, patterns get documented.

## Philosophy

**Each unit of engineering work should make subsequent units easier—not harder.**

Traditional development accumulates technical debt. Every feature adds complexity. The codebase becomes harder to work with over time.

Compound engineering inverts this. 80% is in planning and review, 20% is in execution:
- Plan thoroughly before writing code
- Review to catch issues and capture learnings
- Codify knowledge so it's reusable
- Keep quality high so future changes are easy

## Learn More

- [Full component reference](plugins/compound-engineering/README.md) - all agents, commands, skills
- [Compound engineering: how Every codes with agents](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents)
- [The story behind compounding engineering](https://every.to/source-code/my-ai-had-already-fixed-the-code-before-i-saw-it)
