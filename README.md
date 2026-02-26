# Compound Marketplace

[![Build Status](https://github.com/EveryInc/compound-engineering-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/EveryInc/compound-engineering-plugin/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@every-env/compound-plugin)](https://www.npmjs.com/package/@every-env/compound-plugin)

A Claude Code plugin marketplace featuring the **Compound Engineering Plugin** — tools that make each unit of engineering work easier than the last.

## Claude Code Install

```bash
/plugin marketplace add https://github.com/EveryInc/compound-engineering-plugin
/plugin install compound-engineering
```

## Cursor Install

```text
/add-plugin compound-engineering
```

## OpenCode, Codex, Droid, Pi, Gemini, Copilot, Kiro & Windsurf (experimental) Install

This repo includes a Bun/TypeScript CLI that converts Claude Code plugins to OpenCode, Codex, Factory Droid, Pi, Gemini CLI, GitHub Copilot, Kiro CLI, and Windsurf.

```bash
# convert the compound-engineering plugin into OpenCode format
bunx @every-env/compound-plugin install compound-engineering --to opencode

# convert to Codex format
bunx @every-env/compound-plugin install compound-engineering --to codex

# convert to Factory Droid format
bunx @every-env/compound-plugin install compound-engineering --to droid

# convert to Pi format
bunx @every-env/compound-plugin install compound-engineering --to pi

# convert to Gemini CLI format
bunx @every-env/compound-plugin install compound-engineering --to gemini

# convert to GitHub Copilot format
bunx @every-env/compound-plugin install compound-engineering --to copilot

# convert to Kiro CLI format
bunx @every-env/compound-plugin install compound-engineering --to kiro

# convert to Windsurf format (global scope by default)
bunx @every-env/compound-plugin install compound-engineering --to windsurf

# convert to Windsurf workspace scope
bunx @every-env/compound-plugin install compound-engineering --to windsurf --scope workspace
```

Local dev:

```bash
bun run src/index.ts install ./plugins/compound-engineering --to opencode
```

OpenCode output is written to `~/.config/opencode` by default. Command are written as individual `.md` files to `~/.config/opencode/commands/<name>.md`. Agent, skills, and plugins are written to the corresponding subdirectory alongside. `opencode.json` (MCP servers) is deep-merged into any existing file -- user keys such as `model`, `theme`, and `provider` are preserved, and user values win on conflicts. Command files are backed up before being overwritten.
Codex output is written to `~/.codex/prompts` and `~/.codex/skills`, with each Claude command converted into both a prompt and a skill (the prompt instructs Codex to load the corresponding skill). Generated Codex skill descriptions are truncated to 1024 characters (Codex limit).
Droid output is written to `~/.factory/` with commands, droids (agents), and skills. Claude tool names are mapped to Factory equivalents (`Bash` → `Execute`, `Write` → `Create`, etc.) and namespace prefixes are stripped from commands.
Pi output is written to `~/.pi/agent/` by default with prompts, skills, extensions, and `compound-engineering/mcporter.json` for MCPorter interoperability.
Gemini output is written to `.gemini/` with skills (from agents), commands (`.toml`), and `settings.json` (MCP servers). Namespaced commands create directory structure (`workflows:plan` → `commands/workflows/plan.toml`). Skills use the identical SKILL.md standard and pass through unchanged.
Copilot output is written to `.github/` with agents (`.agent.md`), skills (`SKILL.md`), and `copilot-mcp-config.json`. Agents get Copilot frontmatter (`description`, `tools: ["*"]`, `infer: true`), commands are converted to agent skills, and MCP server env vars are prefixed with `COPILOT_MCP_`.
Kiro output is written to `.kiro/` with custom agents (`.json` configs + prompt `.md` files), skills (from commands), pass-through skills, steering files (from CLAUDE.md), and `mcp.json`. Agents get `includeMcpJson: true` for MCP server access. Only stdio MCP servers are supported (HTTP servers are skipped with a warning).
Windsurf output defaults to global scope (`~/.codeium/windsurf/`). Claude agents become Windsurf skills (`skills/{name}/SKILL.md`), commands become flat workflows (`workflows/{name}.md`), and pass-through skills copy unchanged. MCP servers write to `mcp_config.json` (machine-readable, merged with existing config). Use `--scope workspace` for project-level output (`.windsurf/`). Env vars including secrets are included in `mcp_config.json` with a console warning for sensitive keys. The `--scope` flag is generic — Windsurf is the first target to support it.

All provider targets are experimental and may change as the formats evolve.

## Sync Personal Config

Sync your personal Claude Code config (`~/.claude/`) to other AI coding tools:

```bash
# Sync skills and MCP servers to OpenCode
bunx @every-env/compound-plugin sync --target opencode

# Sync to Codex
bunx @every-env/compound-plugin sync --target codex

# Sync to Pi
bunx @every-env/compound-plugin sync --target pi

# Sync to Droid (skills only)
bunx @every-env/compound-plugin sync --target droid

# Sync to GitHub Copilot (skills + MCP servers)
bunx @every-env/compound-plugin sync --target copilot
```

This syncs:
- Personal skills from `~/.claude/skills/` (as symlinks)
- MCP servers from `~/.claude/settings.json`

Skills are symlinked (not copied) so changes in Claude Code are reflected immediately.

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
