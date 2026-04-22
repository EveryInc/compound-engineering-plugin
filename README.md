# Compound Engineering

[![Build Status](https://github.com/EveryInc/compound-engineering-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/EveryInc/compound-engineering-plugin/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@every-env/compound-plugin)](https://www.npmjs.com/package/@every-env/compound-plugin)

AI skills and agents that make each unit of engineering work easier than the last.

## Philosophy

**Each unit of engineering work should make subsequent units easier -- not harder.**

Traditional development accumulates technical debt. Every feature adds complexity. Every bug fix leaves behind a little more local knowledge that someone has to rediscover later. The codebase gets larger, the context gets harder to hold, and the next change becomes slower.

Compound engineering inverts this. 80% is in planning and review, 20% is in execution:

- Plan thoroughly before writing code with `/ce-brainstorm` and `/ce-plan`
- Review to catch issues and calibrate judgment with `/ce-code-review` and `/ce-doc-review`
- Codify knowledge so it is reusable with `/ce-compound`
- Keep quality high so future changes are easy

The point is not ceremony. The point is leverage. A good brainstorm makes the plan sharper. A good plan makes execution smaller. A good review catches the pattern, not just the bug. A good compound note means the next agent does not have to learn the same lesson from scratch.

**Learn more**

- [Full component reference](plugins/compound-engineering/README.md) - all agents and skills
- [Compound engineering: how Every codes with agents](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents)
- [The story behind compounding engineering](https://every.to/source-code/my-ai-had-already-fixed-the-code-before-i-saw-it)

## Workflow

The core loop is: brainstorm the requirements, plan the implementation, work through the plan, review the result, compound the learning, then repeat with better context.

Use `/ce-ideate` before the loop when you want the agent to generate and critique bigger ideas before choosing one to brainstorm. It produces a ranked ideation artifact, not requirements, plans, or code.

| Skill | Purpose |
|-------|---------|
| `/ce-ideate` | Optional big-picture ideation: generate and critically evaluate grounded ideas, then route the strongest one into brainstorming |
| `/ce-brainstorm` | Interactive Q&A to think through a feature or problem and write a right-sized requirements doc before planning |
| `/ce-plan` | Turn feature ideas into detailed implementation plans |
| `/ce-work` | Execute plans with worktrees and task tracking |
| `/ce-debug` | Systematically reproduce failures, trace root cause, and implement fixes |
| `/ce-code-review` | Multi-agent code review before merging |
| `/ce-compound` | Document learnings to make future work easier |

Each cycle compounds: brainstorms sharpen plans, plans inform future plans, reviews catch more issues, patterns get documented.

## Quick Example

A typical cycle starts by turning a rough idea into a requirements doc, then planning from that doc before handing execution to `/ce-work`:

```text
/ce-brainstorm "make background job retries safer"
/ce-plan docs/brainstorms/background-job-retry-safety-requirements.md
/ce-work
/ce-code-review
/ce-compound
```

For a focused bug investigation:

```text
/ce-debug "the checkout webhook sometimes creates duplicate invoices"
/ce-code-review
/ce-compound
```

## Getting Started

After installing, run `/ce-setup` in any project. It checks your environment, installs missing tools, and bootstraps project config.

The `compound-engineering` plugin currently ships 36 skills and 51 agents. See the [full component reference](plugins/compound-engineering/README.md) for the complete inventory.

---

## Install

### Claude Code

```text
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

Three steps: register the marketplace, install the agent set, then install the plugin through Codex's TUI.

1. **Register the marketplace with Codex:**

   ```bash
   codex plugin marketplace add EveryInc/compound-engineering-plugin
   ```

2. **Install the Compound Engineering agents** (Codex's plugin spec does not register custom agents yet):

   ```bash
   bunx @every-env/compound-plugin install compound-engineering --to codex
   ```

3. **Install the plugin through Codex's TUI:** launch `codex`, run `/plugins`, find the **Compound Engineering** marketplace, select the **compound-engineering** plugin, and choose **Install**. Restart Codex after install completes. Codex's CLI does not currently have a subcommand for installing a plugin from an added marketplace -- the `/plugins` TUI is the canonical flow.

All three steps are needed. The marketplace registration plus TUI install handles skills; the Bun step adds the review, research, and workflow agents that skills like `$ce-code-review`, `$ce-plan`, and `$ce-work` spawn in Codex. Without the agent step, delegating skills will report missing agents.

> **Heads up:** once Codex's native plugin spec supports custom agents, the Bun agent step goes away. The TUI install alone will be sufficient.

If you previously used the Bun-only Codex install, back up stale CE artifacts before switching:

```bash
bunx @every-env/compound-plugin cleanup --target codex
```

### GitHub Copilot

For **VS Code Copilot Agent Plugins**:

1. Run `Chat: Install Plugin from Source` from the VS Code command palette
2. Use `EveryInc/compound-engineering-plugin` for the repo
3. Select `compound-engineering` when VS Code shows the plugins in this repository

For **Copilot CLI**, use:

Inside Copilot CLI:

```text
/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install compound-engineering@compound-engineering-plugin
```

From a shell with the `copilot` binary:

```bash
copilot plugin marketplace add EveryInc/compound-engineering-plugin
copilot plugin install compound-engineering@compound-engineering-plugin
```

Copilot CLI reads the existing Claude-compatible plugin manifests, so no separate Bun install step is needed.

If you previously used the old Bun Copilot install, back up stale CE artifacts before switching to the native plugin:

```bash
bunx @every-env/compound-plugin cleanup --target copilot
```

### Factory Droid

From a shell with the `droid` binary:

```bash
droid plugin marketplace add https://github.com/EveryInc/compound-engineering-plugin
droid plugin install compound-engineering@compound-engineering-plugin
```

Droid uses `plugin@marketplace` plugin IDs; here `compound-engineering` is the plugin and `compound-engineering-plugin` is the marketplace name. Droid installs the existing Claude Code-compatible plugin and translates the format automatically, so no Bun install step is needed.

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

### OpenCode, Pi, Gemini, and Kiro

This repo includes a Bun/TypeScript installer that converts the Compound Engineering plugin to OpenCode, Pi, Gemini CLI, and Kiro CLI.

```bash
bunx @every-env/compound-plugin install compound-engineering --to opencode
bunx @every-env/compound-plugin install compound-engineering --to pi
bunx @every-env/compound-plugin install compound-engineering --to gemini
bunx @every-env/compound-plugin install compound-engineering --to kiro
```

**Pi prerequisites.** Pi does not ship a native subagent primitive, so the Pi install depends on [nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents) (required) and recommends [edlsh/pi-ask-user](https://github.com/edlsh/pi-ask-user) for richer blocking user questions:

```bash
pi install npm:pi-subagents    # required — provides the `subagent` tool used by skills that dispatch parallel agents
pi install npm:pi-ask-user     # recommended — provides the `ask_user` tool; skills fall back to numbered options in chat when it is missing
```

To auto-detect custom-install targets and install to all:

```bash
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

---

## Local Development

```bash
bun install
bun test
bun run release:validate
```

### From your local checkout

For active development -- edits to the plugin source are reflected immediately.

**Claude Code** -- add a shell alias so your local copy loads alongside your normal plugins:

```bash
alias cce='claude --plugin-dir ~/Code/compound-engineering-plugin/plugins/compound-engineering'
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

> **Unpushed local branches**: If the branch exists only in a local worktree and has not been pushed, point `--plugin-dir` directly at the worktree path instead (e.g. `claude --plugin-dir /path/to/worktree/plugins/compound-engineering`).

**Claude Code** -- use `plugin-path` to get the cached clone path:

```bash
# from the repo root
bun run src/index.ts plugin-path compound-engineering --branch feat/new-agents
# Output:
#   claude --plugin-dir ~/.cache/compound-engineering/branches/compound-engineering-feat~new-agents/plugins/compound-engineering
```

The cache path is deterministic. Re-running updates the checkout to the latest commit on that branch.

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

Add to `~/.zshrc` or `~/.bashrc`. All aliases use the local CLI so there is no dependency on npm publishing. `plugin-path` prints just the path to stdout, so it composes with `$()`.

```bash
CE_REPO=~/Code/compound-engineering-plugin

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

## Troubleshooting

### Codex skills work but review or research delegation fails

Run the agent install step:

```bash
bunx @every-env/compound-plugin install compound-engineering --to codex
```

Native Codex plugin install handles skills. The Bun step installs the custom agents those skills delegate to.

### Codex shows stale or duplicate CE skills

Back up old Bun-installed artifacts before switching to the native Codex plugin flow:

```bash
bunx @every-env/compound-plugin cleanup --target codex
```

### Copilot, Droid, or Qwen loads stale CE skills

Back up old Bun-installed artifacts before using the native plugin path:

```bash
bunx @every-env/compound-plugin cleanup --target copilot
bunx @every-env/compound-plugin cleanup --target droid
bunx @every-env/compound-plugin cleanup --target qwen
```

## Limitations

Codex native plugin install currently handles skills, not custom agents. The documented Bun followup is required until Codex supports agents in its native plugin spec.

OpenCode, Pi, Gemini, and Kiro installs are converter-backed and may change as those target formats evolve.

Release versions are owned by release automation. Routine feature PRs should not hand-bump plugin or marketplace manifest versions.

## FAQ

### Do I need Bun for Claude Code?

No. Claude Code installs directly from the plugin marketplace. Bun is only needed for converter-backed targets, Codex's current agent followup, local development, and cleanup of old converted installs.

### Why does Codex need a separate Bun step?

Codex's native plugin flow installs skills from the Codex plugin manifest. It does not currently install the custom reviewer, researcher, and workflow agents that Compound Engineering skills delegate to. The Bun step fills that gap.

### Where do I see all available skills and agents?

Read the [Compound Engineering plugin README](plugins/compound-engineering/README.md). It lists the current skill and agent inventory.

### Where is release history?

GitHub Releases are the canonical release-notes surface. The root [`CHANGELOG.md`](CHANGELOG.md) points to that history.

## About Contributions

*About Contributions:* Please don't take this the wrong way, but I do not accept outside contributions for any of my projects. I simply don't have the mental bandwidth to review anything, and it's my name on the thing, so I'm responsible for any problems it causes; thus, the risk-reward is highly asymmetric from my perspective. I'd also have to worry about other "stakeholders," which seems unwise for tools I mostly make for myself for free. Feel free to submit issues, and even PRs if you want to illustrate a proposed fix, but know I won't merge them directly. Instead, I'll have Claude or Codex review submissions via `gh` and independently decide whether and how to address them. Bug reports in particular are welcome. Sorry if this offends, but I want to avoid wasted time and hurt feelings. I understand this isn't in sync with the prevailing open-source ethos that seeks community contributions, but it's the only way I can move at this velocity and keep my sanity.

## License

[MIT](LICENSE)
