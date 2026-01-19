# Coen

A Claude Code plugin that makes each unit of engineering work easier than the last.

> **Attribution:** This is a customized fork of [Compound Engineering Plugin](https://github.com/EveryInc/compound-engineering-plugin) by [Every](https://every.to). The name "Coen" is shorthand for "compound engineering." All credit for the foundational architecture, philosophy, and original implementation goes to the Every team.

## Install

```bash
/plugin marketplace add https://github.com/criztiano/coen-plugin
/plugin install compound-engineering
```

## Workflow

```
Plan → Work → Review → Compound → Repeat
```

| Command | Purpose |
|---------|---------|
| `/workflows:plan` | Turn feature ideas into detailed implementation plans |
| `/workflows:work` | Execute plans with task tracking (commits locally) |
| `/workflows:review` | Multi-agent code review with auto-resolve, then PR creation |
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

## Changes from Upstream

This fork includes the following customizations:

### Framework-Agnostic Refactoring

- **compound-docs skill** - Removed Rails-specific components (`rails_model`, `rails_controller`, etc.) in favor of generic terms (`model`, `controller`, `view`, `service`, `hook`, `component`)
- **Agents renamed** - Persona-based reviewers (e.g., `dhh-rails-reviewer`) replaced with generic senior reviewers (`senior-typescript-reviewer`, `senior-python-reviewer`)
- **Schema updates** - YAML schema and templates now use framework-agnostic terminology

### Workflow Restructuring

- **`/workflows:work`** - Now implements and commits locally only (no PR creation)
- **`/workflows:review`** - Restructured to:
  1. Run language-based conditional agents (core agents always, language/feature agents conditionally)
  2. Auto-resolve P1/P2 findings before PR
  3. Create PR at the end (moved from work)
- **Language-based agent selection** - Review agents organized into tiers:
  - Core (always): `git-history-analyzer`, `security-sentinel`, `architecture-strategist`, `code-simplicity-reviewer`
  - Language (conditional): `senior-typescript-reviewer` for TS/JS, `senior-python-reviewer` for Python
  - Feature (conditional): `frontend-races-reviewer` for React components

### Knowledge Reuse Improvements

- **`/reproduce-bug`** - Added Phase 1.5 for optional grep into `docs/solutions/` when symptoms seem familiar
- **`bug-reproduction-validator`** - Added hint to optionally check past solutions before deep debugging
- **State management** - Added Zustand recommendation for smaller projects (preferred over Redux for simplicity)

### Autoskill: Meta-Learning System

- **New skill: `autoskill`** - Analyzes coding sessions to extract durable preferences and propose skill updates
- **Activation triggers** - Explicit generalizable statements: "we should always...", "from now on...", "respect this pattern"
- **Auto-spawn in `/workflows:compound`** - Runs in parallel after documenting solutions

### Simplified Compound Workflow

- **`/workflows:compound`** - Reduced from 6 parallel subagents to 3:
  - Context Analyzer (merged Category Classifier functionality)
  - Solution Extractor
  - Documentation Writer
- **Removed**: Prevention Strategist, Related Docs Finder (compound-docs skill handles these)

## Learn More

- [Full component reference](plugins/compound-engineering/README.md) - all agents, commands, skills
- [Compound engineering: how Every codes with agents](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents)
- [The story behind compounding engineering](https://every.to/source-code/my-ai-had-already-fixed-the-code-before-i-saw-it)

## License

MIT - Same as the original project.
