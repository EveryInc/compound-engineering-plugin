<div align="center">

<img src="assets/logo.png" alt="Compound Engineering" width="120">

# Compound Engineering

**AI skills that make each unit of engineering work easier than the last.**

[![Build Status](https://github.com/EveryInc/compound-engineering-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/EveryInc/compound-engineering-plugin/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Skills](https://img.shields.io/badge/skills-34-black.svg)](skills/guides/README.md)

</div>

Compound Engineering is a plugin of 34 skills for AI coding agents. It structures the work around a loop — brainstorm, plan, build, review, then **capture what you learned** — so the knowledge from each change is written down where the next change can read it.

It runs on 14 agent hosts, including Claude Code, Cursor, and Codex.

## Install

### Claude Code

```text
/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install compound-engineering
```

> [!IMPORTANT]
> **Already have Compound Engineering installed?** Refresh the marketplace *before* updating — see [Upgrading](docs/install/upgrading.md). Running `/plugin update` alone keeps you on the old version.

### Cursor

In Cursor Agent chat, install from the plugin marketplace:

```text
/add-plugin compound-engineering
```

Or search for "compound engineering" in the plugin marketplace.

### Grok Bot

Grok Bot is its own app, but it uses your Cursor account and plugin library. There is no separate Grok Bot login. Install Compound Engineering once on that account and Grok Bot agents can load it.

In Cursor Agent chat:

```text
/add-plugin compound-engineering
```

Or search for "compound engineering" in the Cursor plugin marketplace. Do not run `/add-plugin` in the Grok Bot chat, and do not clone this repository onto the Grok Bot computer.

### Codex App

Compound Engineering is not listed in Codex's built-in plugin marketplace yet. Add it as a custom marketplace:

1. In the Codex app, open **Plugins** from the sidebar.
2. Click the arrow next to **Create**, then select **Add marketplace**.
3. Enter:

   | Field | Value |
   | --- | --- |
   | Source | `EveryInc/compound-engineering-plugin` |
   | Git ref | `main` |
   | Sparse paths | leave blank |

4. Click **Add marketplace**.
5. Search for **Compound Engineering**, install **compound-engineering-plugin**, then restart Codex.

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

**Another editor or CLI?** Kimi Code CLI, Cline, Grok Build CLI, Devin CLI, GitHub Copilot, Factory Droid, Qwen Code, OpenCode, Pi, oh-my-pi (omp), and Antigravity CLI are all supported — see [More install options](#more-install-options).

---

## Philosophy

**Each unit of engineering work should make subsequent units easier -- not harder.**

Invocation syntax: this README uses `/skill-name` examples for slash-skill hosts. In Codex, invoke installed skills with `$skill-name` (for example, `$ce-plan` and `$lfg`). In oh-my-pi (omp), these prompts can model-route to visible skills; use the native deterministic `/skill:<name>` form for manual-only or hidden skills (for example, `/skill:ce-polish`). `/goal` remains a Codex built-in command.

Traditional development accumulates technical debt. Every feature adds complexity. Every bug fix leaves behind a little more local knowledge that someone has to rediscover later. The codebase gets larger, the context gets harder to hold, and the next change becomes slower.

Compound engineering inverts this. 80% is in planning and review, 20% is in execution:

- Plan thoroughly before writing code with `/ce-brainstorm` and `/ce-plan` using one readiness-based plan artifact
- Review to catch issues and calibrate judgment with `/ce-code-review` and `/ce-doc-review`
- Codify knowledge so it is reusable with `/ce-compound`
- Keep quality high so future changes are easy

The point is not ceremony. The point is leverage. A good brainstorm makes the plan sharper. A good plan makes execution smaller. A good review catches the pattern, not just the bug. A good compound note means the next agent does not have to learn the same lesson from scratch.

## The loop

The core loop is six steps: **brainstorm** the requirements, **plan** the implementation, **work** through the plan, **simplify** what you wrote, **review** the result, then **compound** the learning -- and repeat with better context.

| Skill | Purpose |
|-------|---------|
| [`/ce-brainstorm`](skills/guides/ce-brainstorm.md) | Interactive Q&A to think through a feature or problem and write a requirements-only unified plan before planning |
| [`/ce-plan`](skills/guides/ce-plan.md) | Enrich feature ideas or requirements-only plans into implementation-ready plans |
| [`/ce-work`](skills/guides/ce-work.md) | Execute implementation-ready plans natively or through a qualified cross-model author while retaining host verification, commits, and shipping |
| [`/ce-simplify-code`](skills/guides/ce-simplify-code.md) | Refine the freshly written code for clarity and reuse before review |
| [`/ce-code-review`](skills/guides/ce-code-review.md) | Report-only multi-agent review against the plan before merging; local apply is explicit |
| [`/ce-compound`](skills/guides/ce-compound.md) | Capture the learning into `docs/solutions/` so the next loop starts smarter |

Each cycle compounds: `/ce-compound` writes learnings that the next `/ce-brainstorm` and `/ce-plan` read as grounding -- brainstorms sharpen plans, plans inform future plans, reviews catch more issues, patterns get documented. That return arrow is the whole point.

<img src="assets/demo/compound-loop.gif" alt="A ce-compound run writes a learning about an env-var trap; 18 days later, on unrelated work, a ce-plan run finds that learning and carries its constraints into the new plan" width="100%">

**Run one teaches it. Run two remembers.**

<sub>Replayed from a real pair of sessions 18 days apart, with names and paths anonymized and the six-minute run compressed to about 30 seconds. Nothing shown is behavior the skills don't have — see <a href="assets/demo/README.md">assets/demo</a> for the source and the substitutions.</sub>

> Artifact folders like `docs/solutions/` and `docs/plans/` are the **defaults**. A project whose `docs/` is tracked content can relocate every CE artifact folder under one repo-relative root via the `docs_root` setting -- see [configuration](skills/guides/configuration.md#artifact-root).

## Try it

After installing, run `/ce-setup` in any project. It reports optional tool capabilities, creates repo `.compound-engineering/config.yaml` when missing, refreshes the committed example, and gitignores an existing local override.

**The standard loop** -- turn a rough idea into shipped, reviewed code:

```text
/ce-brainstorm make background job retries safer
/ce-plan
/ce-work
/ce-simplify-code
/ce-code-review
/ce-compound
```

**Autonomous** -- hand off a feature and let the agent run the whole pipeline:

```text
/ce-brainstorm describe the feature
/lfg
```

`/lfg` runs the loop hands-off: it plans, works through the plan, simplifies, runs code review and applies the fixes, runs browser tests, then commits. When a git remote exists it pushes, opens a PR, and watches CI with a bounded repair loop (it does not merge, and it can finish with leftovers if the repair budget is hit). With no remote it stops at local commits. Start it after `/ce-brainstorm` so it plans against real requirements rather than a one-line prompt.

Starting from a bug instead of a feature? Use [`/ce-debug`](skills/guides/ce-debug.md). Not sure what to build yet? Start with [`/ce-ideate`](skills/guides/ce-ideate.md).

## Skills at a glance

34 skills, grouped by what they are for. The full catalog, with a page per skill and how each one chains into the others, is in **[skills/guides](skills/guides/README.md)**.

| Group | Skills | What it covers |
|-------|--------|----------------|
| [Core loop](skills/guides/README.md#the-core-loop) | `ce-brainstorm` `ce-plan` `ce-work` `ce-simplify-code` `ce-code-review` `ce-compound` | The six steps of every iteration |
| [Around the loop](skills/guides/README.md#around-the-loop) | `ce-strategy` `ce-product-pulse` `ce-sweep` `ce-compound-refresh` | Anchors and feeds that keep the loop grounded |
| [On demand](skills/guides/README.md#on-demand) | `ce-ideate` `ce-pov` `ce-debug` `ce-explain` `ce-doc-review` `ce-optimize` `ce-prototype` `ce-security-audit` | Reached for when a specific need arises |
| [Git workflow](skills/guides/README.md#git-workflow) | `ce-commit` `ce-commit-push-pr` `ce-babysit-pr` `ce-resolve-pr-feedback` `ce-worktree` | Committing, shipping, and shepherding PRs |
| [Autonomous](skills/guides/README.md#autonomous-pipeline) | `lfg` | The whole pipeline, hands-off |
| [Testing & design](skills/guides/README.md#frontend-design) | `ce-test-browser` `ce-test-xcode` `ce-polish` `ce-dogfood` | Verifying and polishing what you built |
| [Collaboration](skills/guides/README.md#collaboration) | `ce-proof` `ce-handoff` `ce-promote` | Sharing work and handing it off |
| [Utilities](skills/guides/README.md#workflow-utilities) | `ce-setup` `ce-retune` `ce-riffrec-feedback-analysis` | Setup and maintenance |

**Learn more**

- [Skill documentation catalog](skills/guides/README.md)
- [Compound engineering: how Every codes with agents](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents)
- [The story behind compounding engineering](https://every.to/source-code/my-ai-had-already-fixed-the-code-before-i-saw-it)

---

## More Install Options

[Claude Code, Cursor, and Codex](#install) are at the top. Everything here is equally supported.

### Kimi Code CLI

Kimi Code CLI can install Compound Engineering directly from this repository because the repo ships a native `.kimi-plugin/plugin.json` manifest:

```text
/plugins install https://github.com/EveryInc/compound-engineering-plugin
```

You can also browse it through Kimi's custom marketplace flow:

```text
/plugins marketplace https://raw.githubusercontent.com/EveryInc/compound-engineering-plugin/main/.kimi-plugin/marketplace.json
```

After installing or updating, run `/reload` or start a new Kimi session so the plugin skills are loaded.

### Cline

Cline loads CE skills from on-demand `SKILL.md` directories. Enable **Settings -> Features -> Enable Skills** in the Cline extension, then link this repository's skills globally or per project:

```bash
git clone https://github.com/EveryInc/compound-engineering-plugin
./compound-engineering-plugin/.cline/scripts/install-skills.sh --global
```

Per-project install from a checkout:

```bash
./compound-engineering-plugin/.cline/scripts/install-skills.sh --project
```

Start a new Cline task after installing or updating skills. See [`.cline/INSTALL.md`](.cline/INSTALL.md) for pinning, local development, and uninstall steps.

### Grok Build CLI (`grok`)

xAI's [Grok Build CLI](https://x.ai/cli) (`grok`) installs Compound Engineering directly from this repository — the repo root is a valid Grok plugin (`grok` reads the existing Claude-compatible manifests, and the repo also ships a native `.grok-plugin/plugin.json`):

```bash
grok plugin install EveryInc/compound-engineering-plugin
```

This tracks the repository; run `grok plugin update` to pull the latest. To browse it as a marketplace source instead, the repo ships a native `.grok-plugin/marketplace.json`:

```bash
grok plugin marketplace add EveryInc/compound-engineering-plugin
grok plugin install compound-engineering
```

Both paths track the repository directly (no commit pin). Add `--trust` to skip the install confirmation. `grok` stores config under `~/.grok`; start a new session after installing so the skills load.

Compound Engineering is also being submitted to the official [xAI plugin marketplace](https://github.com/xai-org/plugin-marketplace); see [`docs/grok-marketplace-submission.md`](docs/grok-marketplace-submission.md) for the maintainer runbook.

### Devin CLI

Devin CLI can install Compound Engineering directly from GitHub because the repo ships a native `.devin-plugin/plugin.json` manifest:

```bash
devin plugins install EveryInc/compound-engineering-plugin
```

Verify the install and inspect the skills:

```bash
devin plugins list
devin plugins info compound-engineering
```

Update to the latest version with `devin plugins update compound-engineering`. Plugins load at session start, so start a new Devin session after installing or updating for the skills to appear (as `/compound-engineering:<skill>` slash commands).

A few skills declare Claude-style `allowed-tools` names that Devin does not map (for example `Bash`); those skills still work, but some of their actions ask for permission instead of running auto-approved. See [`docs/specs/devin.md`](docs/specs/devin.md) for details.

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

Copilot CLI reads the existing Claude-compatible plugin manifests directly.

### Factory Droid

From a shell with the `droid` binary:

```bash
droid plugin marketplace add https://github.com/EveryInc/compound-engineering-plugin
droid plugin install compound-engineering@compound-engineering-plugin
```

Droid uses `plugin@marketplace` plugin IDs; here `compound-engineering` is the plugin and `compound-engineering-plugin` is the marketplace name. Droid installs the existing Claude Code-compatible plugin and translates the format automatically.

### Qwen Code

```bash
qwen extensions install EveryInc/compound-engineering-plugin:compound-engineering
```

Qwen Code installs Claude Code-compatible plugins directly from GitHub and converts the plugin format during install.

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

### oh-my-pi (omp)

oh-my-pi (omp) installs Compound Engineering through its marketplace flow. The repo ships a native `.omp-plugin/marketplace.json` catalog whose plugin entry carries a release-managed `version`, so omp's update checker can see each new CE release:

```text
omp plugin marketplace add EveryInc/compound-engineering-plugin
omp plugin install compound-engineering@compound-engineering-plugin
```

To stay current automatically, enable auto-update:

```bash
omp config set marketplace.autoUpdate auto
```

The default `notify` mode only writes update availability to the debug log — it does not prompt — so without `auto` you will not hear about new releases. To upgrade by hand instead, run `omp plugin upgrade compound-engineering@compound-engineering-plugin`.

<details>
<summary>Other install paths (pin-style and contributor development)</summary>

`omp install https://github.com/EveryInc/compound-engineering-plugin` installs the repository as an npm-style plugin. That path has **no update mechanism** — treat it as pinning a snapshot, not as the recommended install.

For local development from a checkout, use a live symlink instead:

```bash
omp plugin link "$PWD"
```

</details>

Run `/reload-plugins` or start a new omp session after installing so the skills load. omp's native deterministic command is `/skill:<name>` (for example, `/skill:ce-plan`); ordinary `/skill-name` prompts can also model-route to visible skills, but manual-only or hidden skills require the native form. See [`docs/specs/omp.md`](docs/specs/omp.md) for details.

### Antigravity CLI (`agy`)

Google has replaced the consumer Gemini CLI with [Antigravity CLI](https://antigravity.google) (`agy`), which still runs on Gemini models. Install Compound Engineering directly from GitHub — no clone step required:

```bash
agy plugin install https://github.com/EveryInc/compound-engineering-plugin
```

Verify with `agy plugin list`. The repository root is the plugin package (`plugin.json` plus `skills/`).

For a local checkout or pinned release:

```bash
git clone https://github.com/EveryInc/compound-engineering-plugin
agy plugin install ./compound-engineering-plugin
```

The bundled `.agy/` directory remains a compatibility entry point (`agy plugin install ./compound-engineering-plugin/.agy`). `agy` also loads `GEMINI.md` workspace context from the checkout.

See [`.agy/INSTALL.md`](.agy/INSTALL.md) for pinning, local development, uninstall, and legacy Gemini import.

---

## Upgrading an existing install

Compound Engineering moved to a root-native, skills-only layout. If you installed before that move, refresh the cached marketplace **before** updating the plugin — order matters, and `/plugin update` alone keeps you on the old version.

See **[docs/install/upgrading.md](docs/install/upgrading.md)** for the per-host refresh commands, and for removing the obsolete Codex tool-map block left behind by pre-native Bun installs.

## Limitations

OpenCode, Pi, and oh-my-pi (omp) use native package/plugin loading from this repository. The Bun CLI remains for repository development and converter maintenance, not normal installation.

Release versions are owned by release automation. Routine feature PRs should not hand-bump plugin or marketplace manifest versions.

## FAQ

### Do I need Bun to install Compound Engineering?

No. Bun is only needed for repo development tasks and converter maintenance.

### Where do I see all available skills?

The grouped overview is [above](#skills-at-a-glance); the full catalog with a page per skill is [`skills/guides/README.md`](skills/guides/README.md). Each skill's authoritative runtime spec lives in `skills/<skill>/SKILL.md`.

### Where is release history?

GitHub Releases are the canonical release-notes surface. The root [`CHANGELOG.md`](CHANGELOG.md) points to that history.

### How do I work on the plugin itself?

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, and [`docs/development.md`](docs/development.md) for loading a local checkout into each harness.

## Documentation

| | |
|---|---|
| [Skill catalog](skills/guides/README.md) | A page per skill, and how they chain together |
| [Configuration](skills/guides/configuration.md) | `.compound-engineering/config.yaml` options |
| [Installing](#install) · [Upgrading](docs/install/upgrading.md) | Per-host install and refresh |
| [Contributing](CONTRIBUTING.md) · [Development](docs/development.md) | Working on the plugin itself |
| [Security](SECURITY.md) · [Privacy](PRIVACY.md) | Reporting and data handling |

## Contributing

Contributions are welcome. Issues, bug reports, and pull requests all help make this better, and we genuinely appreciate them — bug reports especially. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md), which covers setup and what to do before opening a PR.

A note on what to expect: Compound Engineering is opinionated by design. It's maintained by [@kieranklaassen](https://github.com/kieranklaassen) and [@tmchow](https://github.com/tmchow), and its direction reflects a specific point of view about how AI-assisted engineering should work. So while we welcome help, we can't promise to accept every change — some proposals won't fit that vision even when they're good ideas on their own.

Open an issue or send a PR, and we'll fold in what moves the plugin in the right direction. We just want to be upfront that not everything will land.

## License

[MIT](LICENSE)
