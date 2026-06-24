# Compound Engineering

[![Build Status](https://github.com/EveryInc/compound-engineering-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/EveryInc/compound-engineering-plugin/actions/workflows/ci.yml)

AI skills that make each unit of engineering work easier than the last.

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

- [Compound engineering: how Every codes with agents](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents)
- [The story behind compounding engineering](https://every.to/source-code/my-ai-had-already-fixed-the-code-before-i-saw-it)

## Workflow

`/ce-strategy` is upstream of the loop -- it captures the product's target problem, approach, persona, metrics, and tracks as a short durable anchor at `STRATEGY.md`. Ideate, brainstorm, and plan read it as grounding when present, so strategy choices flow into feature conception, prioritization, and spec.

The core loop is: brainstorm the requirements, plan the implementation, work through the plan, review the result, compound the learning, then repeat with better context.

Use `/ce-ideate` before the loop when you want the agent to generate and critique bigger ideas before choosing one to brainstorm. It produces a ranked ideation artifact, not requirements, plans, or code.

| Skill | Purpose |
|-------|---------|
| `/ce-strategy` | Create or maintain `STRATEGY.md` -- the product's target problem, approach, persona, key metrics, and tracks. Read as grounding by ideate, brainstorm, and plan |
| `/ce-ideate` | Optional big-picture ideation: generate and critically evaluate grounded ideas, then route the strongest one into brainstorming |
| `/ce-brainstorm` | Interactive Q&A to think through a feature or problem and write a right-sized requirements doc before planning |
| `/ce-plan` | Turn feature ideas into detailed implementation plans |
| `/ce-work` | Execute plans with worktrees and task tracking |
| `/ce-debug` | Systematically reproduce failures, trace root cause, and implement fixes |
| `/ce-code-review` | Multi-agent code review before merging |
| `/ce-compound` | Document learnings to make future work easier |
| `/ce-product-pulse` | Generate a single-page, time-windowed pulse report on usage, performance, errors, and followups. Saves to `docs/pulse-reports/` |

`/ce-product-pulse` is the read-side companion -- a time-windowed report on what users actually experienced and how the product performed over a given window (24h, 7d, etc.), saved to `docs/pulse-reports/` so past pulses form a browseable timeline of user outcomes. The next strategy update and the next brainstorm get real signal to anchor to.

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

After installing, run `/ce-setup` in any project. It checks repo-local config, reports optional tool capabilities, and helps keep machine-local CE settings safely gitignored.

The `compound-engineering` plugin currently ships 27 skills and 0 standalone agents. Specialist review, research, and workflow behavior lives inside the owning skills as skill-local prompt assets.

### Full Skill Inventory

| Skill | Purpose |
|-------|---------|
| `/ce-strategy` | Create or maintain `STRATEGY.md` |
| `/ce-ideate` | Generate and critically evaluate grounded ideas |
| `/ce-brainstorm` | Explore requirements and write a right-sized requirements doc |
| `/ce-plan` | Create structured implementation plans |
| `/ce-work` | Execute implementation plans systematically |
| `/ce-code-review` | Review code with skill-local reviewer personas |
| `/ce-doc-review` | Review requirements and plan documents |
| `/ce-debug` | Reproduce failures, trace root cause, and fix bugs |
| `/ce-compound` | Document solved problems to compound team knowledge |
| `/ce-compound-refresh` | Refresh stale or drifting learnings |
| `/ce-optimize` | Run iterative optimization loops |
| `/ce-product-pulse` | Generate time-windowed product pulse reports |
| `/ce-riffrec-feedback-analysis` | Convert Riffrec recordings or notes into structured feedback |
| `/ce-resolve-pr-feedback` | Resolve PR review feedback |
| `/ce-commit` | Create a git commit with a clear message |
| `/ce-commit-push-pr` | Commit, push, and open a PR |
| `/ce-worktree` | Ensure work happens in an isolated git worktree |
| `/ce-promote` | Draft user-facing announcement copy |
| `/ce-test-browser` | Run browser tests on PR-affected pages |
| `/ce-test-xcode` | Build and test iOS apps on simulator |
| `/ce-setup` | Diagnose optional tool capabilities and project config |
| `/ce-simplify-code` | Simplify recent code changes |
| `/ce-polish` | Start a dev server and iterate on UX polish |
| `/ce-proof` | Create, edit, and share Proof documents |
| `/ce-dogfood-beta` | Diff-scoped browser QA of the active branch |
| `/ce-work-beta` | Experimental execution workflow with Codex delegation mode |
| `/lfg` | Full autonomous engineering workflow |

---

## Install

### Claude Code

```text
/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install compound-engineering
```

> **Already have Compound Engineering installed?** Compound Engineering moved to a root-native layout. You must refresh the marketplace *before* updating — see [Existing Installs](#existing-installs). Running `/plugin update` alone keeps you on the old version.

### Cursor

In Cursor Agent chat, install from the plugin marketplace:

```text
/add-plugin compound-engineering
```

Or search for "compound engineering" in the plugin marketplace.

### Codex App

Compound Engineering is not listed in Codex's built-in plugin marketplace yet. Add it as a custom marketplace:

1. In the Codex app, open **Plugins** from the sidebar.
2. Click **Add** / **Add plugin marketplace**.
3. Enter:

   | Field | Value |
   | --- | --- |
   | Source | `EveryInc/compound-engineering-plugin` |
   | Git ref | `main` |
   | Sparse paths | leave blank |

4. Click **Add marketplace**.
5. Select **Compound Engineering**, install **compound-engineering**, then restart Codex.

The Codex app install is self-contained for Compound Engineering. Specialist reviewer and research behavior lives inside the skills as local prompt assets; no separate custom-agent install step is required.

### Codex CLI

Register the marketplace, then install the plugin.

1. **Register the marketplace with Codex:**

   ```bash
   codex plugin marketplace add EveryInc/compound-engineering-plugin
   ```

2. **Install the plugin:**

   ```bash
   codex plugin add compound-engineering@compound-engineering-plugin
   ```

   You can also launch `codex`, run `/plugins`, find the **Compound Engineering** marketplace, select the **compound-engineering** plugin, and choose **Install**. Restart Codex after install completes.

The native Codex plugin install is self-contained for Compound Engineering. Specialist reviewer and research behavior lives inside the skills as local prompt assets; no separate custom-agent install step is required.

For a non-default Codex profile, run every Codex-related step against the same `CODEX_HOME`. This example installs CE into a `work` profile:

```bash
CODEX_HOME="$HOME/.codex/profiles/work" codex plugin marketplace add EveryInc/compound-engineering-plugin
CODEX_HOME="$HOME/.codex/profiles/work" codex plugin add compound-engineering@compound-engineering-plugin
```

The marketplace step only makes the plugin available; the plugin install is what activates the native CE skills for that profile.

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

### Factory Droid

From a shell with the `droid` binary:

```bash
droid plugin marketplace add https://github.com/EveryInc/compound-engineering-plugin
droid plugin install compound-engineering@compound-engineering-plugin
```

Droid uses `plugin@marketplace` plugin IDs; here `compound-engineering` is the plugin and `compound-engineering-plugin` is the marketplace name. Droid installs the existing Claude Code-compatible plugin and translates the format automatically, so no Bun install step is needed.

### Qwen Code

```bash
qwen extensions install EveryInc/compound-engineering-plugin:compound-engineering
```

Qwen Code installs Claude Code-compatible plugins directly from GitHub and converts the plugin format during install, so no Bun install step is needed.

### OpenCode

Add Compound Engineering to the `plugin` array in your global or project `opencode.json`:

```json
{
  "plugin": ["compound-engineering@git+https://github.com/EveryInc/compound-engineering-plugin.git"]
}
```

Restart OpenCode after changing the config. The OpenCode plugin registers the Compound Engineering skills directory directly; no Bun installer or generated skill copy is required. See [`.opencode/INSTALL.md`](.opencode/INSTALL.md) for pinning examples.

### Pi

Install Compound Engineering as a Pi package from this repository:

```bash
pi install git:github.com/EveryInc/compound-engineering-plugin
```

Required companion for CE workflows that dispatch reviewer, research, or implementation subagents:

```bash
pi install npm:pi-subagents
```

Recommended companion for richer blocking questions:

```bash
pi install npm:pi-ask-user
```

### Antigravity CLI (`agy`)

Google has replaced the consumer Gemini CLI with [Antigravity CLI](https://antigravity.google) (`agy`), which still runs on Gemini models. Unlike Gemini CLI, `agy` installs plugins from a **local checkout** (not a repository URL), so clone this repository and install the bundled `.agy` plugin directory:

```bash
git clone https://github.com/EveryInc/compound-engineering-plugin
agy plugin install ./compound-engineering-plugin/.agy
```

`agy` also loads `GEMINI.md` workspace context from the checkout.

### Existing Installs

Compound Engineering moved to a root-native, skills-only layout. An existing marketplace install keeps a **cached** marketplace snapshot that still points at the old `plugins/compound-engineering` path, so updating the plugin on its own reads that stale snapshot and leaves you on the previous version. Refresh the cached marketplace **first**, then update the plugin — order matters.

**Claude Code**

```text
/plugin marketplace update compound-engineering-plugin
/plugin update compound-engineering
```

**Codex CLI**

```bash
codex plugin marketplace upgrade compound-engineering-plugin
codex plugin add compound-engineering@compound-engineering-plugin
```

There is no `codex plugin update`; re-running `add` reinstalls from the refreshed snapshot. For a non-default profile, run both commands against the same `CODEX_HOME`.

**Codex App**

Refresh the marketplace from the **Plugins** panel (remove and re-add the `EveryInc/compound-engineering-plugin` marketplace if there is no refresh control), then reinstall **compound-engineering** and restart Codex.

If you configured a host with a direct path or sparse path under `plugins/compound-engineering`, edit or reinstall that source so it points at the repository root with no sparse path.

If a previous Bun-installed copy is still shadowing native plugin skills, run the current cleanup command from a checkout of this repository:

```bash
git clone https://github.com/EveryInc/compound-engineering-plugin.git /tmp/compound-engineering-plugin-cleanup
cd /tmp/compound-engineering-plugin-cleanup
bun install
bun run cleanup --target all
```

---

## Local Development

```bash
bun install
bun test
bun run release:validate
```

### From your local checkout

For active development, load this checkout directly in the harness you want to test.

**Claude Code**

```bash
claude --plugin-dir "$PWD"
```

**Codex App**

In the app's **Add plugin marketplace** form, use this checkout as the source:

| Field | Value |
| --- | --- |
| Source | `/path/to/compound-engineering-plugin` |
| Git ref | current branch, or leave blank for a local folder |
| Sparse paths | leave blank |

**Codex CLI**

```bash
codex plugin marketplace add "$PWD"
codex plugin add compound-engineering@compound-engineering-plugin
```

Use a separate `CODEX_HOME` when you want to keep local testing isolated from your normal Codex profile. The Codex marketplace entry points at the public Git plugin source so root-shaped plugin repos install correctly; use a temporary marketplace catalog with a `source.url` plus `ref` when testing unpublished plugin-content changes end to end.

**OpenCode**

```json
{
  "plugin": ["/path/to/compound-engineering-plugin"]
}
```

Restart OpenCode after changing `opencode.json`.

**Pi**

```bash
pi -e "$PWD"
```

**Antigravity CLI (`agy`)**

```bash
agy plugin install "$PWD/.agy"
```

`agy` installs the bundled `.agy` plugin directory from your checkout and loads `GEMINI.md` workspace context.

## Limitations

OpenCode and Pi use native package/plugin loading from this repository. The Bun CLI remains for repository development and converter maintenance, not normal installation.

Release versions are owned by release automation. Routine feature PRs should not hand-bump plugin or marketplace manifest versions.

## FAQ

### Do I need Bun to install Compound Engineering?

No. Bun is only needed for repo development tasks and converter maintenance.

### Where do I see all available skills?

The skill inventory is in this README. Each skill's authoritative runtime spec lives in `skills/<skill>/SKILL.md`.

### Where is release history?

GitHub Releases are the canonical release-notes surface. The root [`CHANGELOG.md`](CHANGELOG.md) points to that history.

## Contributing

Contributions are welcome. Issues, bug reports, and pull requests all help make this better, and we genuinely appreciate them — bug reports especially.

A note on what to expect: Compound Engineering is opinionated by design. It's maintained by [@kieranklaassen](https://github.com/kieranklaassen) and [@tmchow](https://github.com/tmchow), and its direction reflects a specific point of view about how AI-assisted engineering should work. So while we welcome help, we can't promise to accept every change — some proposals won't fit that vision even when they're good ideas on their own.

Open an issue or send a PR, and we'll fold in what moves the plugin in the right direction. We just want to be upfront that not everything will land.

## License

[MIT](LICENSE)
