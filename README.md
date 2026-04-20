# Compound Engineering

[![Build Status](https://github.com/EveryInc/compound-engineering-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/EveryInc/compound-engineering-plugin/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@every-env/compound-plugin)](https://www.npmjs.com/package/@every-env/compound-plugin)

A plugin marketplace featuring the [Compound Engineering plugin](plugins/compound-engineering/README.md) — AI skills and agents that make each unit of engineering work easier than the last.

## Philosophy

**Each unit of engineering work should make subsequent units easier—not harder.**

Traditional development accumulates technical debt. Every feature adds complexity. The codebase becomes harder to work with over time.

Compound engineering inverts this. 80% is in planning and review, 20% is in execution:
- Plan thoroughly before writing code
- Review to catch issues and capture learnings
- Codify knowledge so it's reusable
- Keep quality high so future changes are easy

**Learn more**

- [Full component reference](plugins/compound-engineering/README.md) - all agents and skills
- [Compound engineering: how Every codes with agents](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents)
- [The story behind compounding engineering](https://every.to/source-code/my-ai-had-already-fixed-the-code-before-i-saw-it)

## Workflow

```
Brainstorm -> Plan -> Work -> Review -> Compound -> Repeat
    ^
  Ideate (optional -- when you need ideas)
```

| Skill | Purpose |
|---------|---------|
| `/ce-ideate` | Discover high-impact project improvements through divergent ideation and adversarial filtering |
| `/ce-brainstorm` | Explore requirements and approaches before planning |
| `/ce-plan` | Turn feature ideas into detailed implementation plans |
| `/ce-work` | Execute plans with worktrees and task tracking |
| `/ce-code-review` | Multi-agent code review before merging |
| `/ce-compound` | Document learnings to make future work easier |

`/ce-brainstorm` is the main entry point -- it refines ideas into a requirements plan through interactive Q&A, and short-circuits automatically when ceremony isn't needed. `/ce-plan` takes either a requirements doc from brainstorming or a detailed idea and distills it into a technical plan that agents (or humans) can work from.

`/ce-ideate` is used less often but can be a force multiplier -- it proactively surfaces strong improvement ideas based on your codebase, with optional steering from you.

Each cycle compounds: brainstorms sharpen plans, plans inform future plans, reviews catch more issues, patterns get documented.

### Getting started

After installing, run `/ce-setup` in any project. It checks your environment, installs missing tools (agent-browser, gh, jq, vhs, silicon, ffmpeg), and bootstraps project config.

---

## Install

### Claude Code

```bash
/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install compound-engineering
```

### Cursor

In Cursor Agent chat, install from the plugin marketplace:

```text
/add-plugin compound-engineering
```

Or search for "compound engineering" in the plugin marketplace.

### Codex

Inside Codex:

```text
codex plugin marketplace add EveryInc/compound-engineering-plugin
codex plugin install compound-engineering
```

Or from a shell:

```bash
codex plugin marketplace add EveryInc/compound-engineering-plugin
codex plugin install compound-engineering
```

Native install registers compound-engineering's skills. Codex's plugin format does not register custom agents or slash commands — for the full CE experience (including the review, research, and workflow agents that delegating skills spawn via `Task`), run this followup once after the native install completes:

```bash
bunx @every-env/compound-plugin install compound-engineering --to codex
```

The followup writes custom-agent TOML files under `~/.codex/agents/compound-engineering/` that Codex discovers at runtime. Without it, skills that orchestrate other agents (such as `ce-code-review`, `ce-plan`, `ce-work`) will report missing delegates.

If you previously used the Bun-only Codex install, back up stale CE artifacts before the native flow takes over (safe to re-run):

```bash
bunx @every-env/compound-plugin cleanup --target codex
```

The `coding-tutor` plugin is also available — native install registers its skills, but its slash commands still require the Bun converter (same followup command as above, with `coding-tutor` in place of `compound-engineering`).

### GitHub Copilot CLI

Inside Copilot CLI:

```text
/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install compound-engineering@compound-engineering-plugin
```

From a shell:

```bash
copilot plugin marketplace add EveryInc/compound-engineering-plugin
copilot plugin install compound-engineering@compound-engineering-plugin
```

Copilot CLI reads the existing `.claude-plugin/marketplace.json` and plugin manifests, so no separate Bun install step is needed.

If you previously used the old Bun Copilot install, back up stale CE artifacts before switching to the native plugin:

```bash
bunx @every-env/compound-plugin cleanup --target copilot
```

This also backs up CE-owned skills in `~/.agents/skills` that would shadow Copilot's native plugin skills.

### Factory Droid

```bash
droid plugin marketplace add https://github.com/EveryInc/compound-engineering-plugin
droid plugin install compound-engineering@compound-engineering-plugin
```

Droid installs the existing Claude Code-compatible plugin marketplace and translates the plugin format automatically, so no Bun install step is needed.

If you previously used the old Bun Droid install, back up stale CE artifacts before switching to the native plugin:

```bash
bunx @every-env/compound-plugin cleanup --target droid
```

### Qwen Code

```bash
qwen extensions install EveryInc/compound-engineering-plugin:compound-engineering
```

Qwen Code installs Claude Code-compatible plugins directly from GitHub and converts the plugin format during install, so no Bun install step is needed.

If you previously used the old Bun Qwen install, back up stale CE artifacts before switching to the native extension:

```bash
bunx @every-env/compound-plugin cleanup --target qwen
```

### OpenCode, Pi, Gemini & Kiro (experimental)

This repo includes a Bun/TypeScript CLI that converts Claude Code plugins to OpenCode, Pi, Gemini CLI, and Kiro CLI.
Use the native plugin install instructions above for Claude Code, Cursor, Codex, GitHub Copilot CLI, Factory Droid, and Qwen Code.

```bash
# convert the compound-engineering plugin into OpenCode format
bunx @every-env/compound-plugin install compound-engineering --to opencode

# convert to Codex format
bunx @every-env/compound-plugin install compound-engineering --to codex

# convert to Pi format
bunx @every-env/compound-plugin install compound-engineering --to pi

# convert to Gemini CLI format
bunx @every-env/compound-plugin install compound-engineering --to gemini

# convert to Kiro CLI format
bunx @every-env/compound-plugin install compound-engineering --to kiro

# auto-detect custom-install targets and install to all
bunx @every-env/compound-plugin install compound-engineering --to all
```

The custom install targets run CE legacy cleanup during install. To run cleanup manually for a specific target:

```bash
bunx @every-env/compound-plugin cleanup --target codex
bunx @every-env/compound-plugin cleanup --target opencode
bunx @every-env/compound-plugin cleanup --target pi
bunx @every-env/compound-plugin cleanup --target gemini
bunx @every-env/compound-plugin cleanup --target kiro
bunx @every-env/compound-plugin cleanup --target copilot   # old Bun installs only
bunx @every-env/compound-plugin cleanup --target droid     # old Bun installs only
bunx @every-env/compound-plugin cleanup --target qwen      # old Bun installs only
bunx @every-env/compound-plugin cleanup --target windsurf  # deprecated legacy installs only
```

Cleanup moves known CE artifacts into a `compound-engineering/legacy-backup/` directory under the target root.

<details>
<summary>Output format details per target</summary>

| Target | Output path | Notes |
|--------|------------|-------|
| `opencode` | `~/.config/opencode/` | Skills and agents are written to OpenCode discovery roots; `opencode.json` MCP config is deep-merged; source commands, if present, are written as `.md` files |
| `codex` | `~/.codex/prompts` + `~/.codex/skills/<plugin>/` + `~/.codex/agents/<plugin>/` | CE skills install under a namespaced Codex skill root; Claude agents become Codex TOML custom agents; Claude source commands, if present, become prompt + skill pairs; deprecated `workflows:*` aliases are omitted; legacy CE `.agents` symlinks are cleaned up but no new `.agents` files are written |
| `pi` | `~/.pi/agent/` | Prompts, skills, extensions, and `mcporter.json` for MCPorter interoperability |
| `gemini` | `~/.gemini/` | Skills under `skills/` and subagents under `agents/`; source commands, if present, are written as `.toml` |
| `kiro` | `.kiro/` | Agents as JSON configs + prompt `.md` files; only stdio MCP servers supported |

All provider targets are experimental and may change as the formats evolve.

</details>

---

## Local Development

### From your local checkout

For active development -- edits to the plugin source are reflected immediately.

**Claude Code** -- add a shell alias so your local copy loads alongside your normal plugins:

```bash
alias cce='claude --plugin-dir ~/code/compound-engineering-plugin/plugins/compound-engineering'
```

Run `cce` instead of `claude` to test your changes. Your production install stays untouched.

**Codex and other targets** -- run the local CLI against your checkout:

```bash
# from the repo root
bun run src/index.ts install ./plugins/compound-engineering --to codex

# same pattern for other targets
bun run src/index.ts install ./plugins/compound-engineering --to opencode
```

### From a pushed branch

For testing someone else's branch or your own branch from a worktree, without switching checkouts. Uses `--branch` to clone the branch to a deterministic cache directory.

> **Unpushed local branches**: If the branch exists only in a local worktree and hasn't been pushed, point `--plugin-dir` directly at the worktree path instead (e.g. `claude --plugin-dir /path/to/worktree/plugins/compound-engineering`).

**Claude Code** -- use `plugin-path` to get the cached clone path:

```bash
# from the repo root
bun run src/index.ts plugin-path compound-engineering --branch feat/new-agents
# Output:
#   claude --plugin-dir ~/.cache/compound-engineering/branches/compound-engineering-feat~new-agents/plugins/compound-engineering
```

The cache path is deterministic (same branch always maps to the same directory). Re-running updates the checkout to the latest commit on that branch.

**Codex, OpenCode, and other targets** -- pass `--branch` to `install`:

```bash
# from the repo root
bun run src/index.ts install compound-engineering --to codex --branch feat/new-agents

# works with any target
bun run src/index.ts install compound-engineering --to opencode --branch feat/new-agents

# combine with --also for multiple targets
bun run src/index.ts install compound-engineering --to codex --also opencode --branch feat/new-agents
```

Both features use the `COMPOUND_PLUGIN_GITHUB_SOURCE` env var to resolve the repository, defaulting to `https://github.com/EveryInc/compound-engineering-plugin`.

### Shell aliases

Add to `~/.zshrc` or `~/.bashrc`. All aliases use the local CLI so there's no dependency on npm publishing. `plugin-path` prints just the path to stdout (progress goes to stderr), so it composes with `$()`.

```bash
CE_REPO=~/code/compound-engineering-plugin

ce-cli() { bun run "$CE_REPO/src/index.ts" "$@"; }

# --- Local checkout (active development) ---
alias cce='claude --plugin-dir $CE_REPO/plugins/compound-engineering'

codex-ce() {
  ce-cli install "$CE_REPO/plugins/compound-engineering" --to codex "$@"
}

# --- Pushed branch (testing PRs, worktree workflows) ---
ccb() {
  claude --plugin-dir "$(ce-cli plugin-path compound-engineering --branch "$1")" "${@:2}"
}

codex-ceb() {
  ce-cli install compound-engineering --to codex --branch "$1" "${@:2}"
}
```

Usage:

```bash
cce                              # local checkout with Claude Code
codex-ce                         # install local checkout to Codex
ccb feat/new-agents              # test a pushed branch with Claude Code
ccb feat/new-agents --verbose    # extra flags forwarded to claude
codex-ceb feat/new-agents        # install a pushed branch to Codex
```

Codex installs keep generated plugin skills isolated under `~/.codex/skills/compound-engineering/` and do not write new files into `~/.agents`. The installer removes old CE-managed `.agents/skills` symlinks when it can prove they point back to CE's Codex-managed store, which prevents stale Codex installs from shadowing Copilot's native plugin install.
