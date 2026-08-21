# Compound Engineering

[![Build Status](https://github.com/ethras/compound-engineering-orca/actions/workflows/ci.yml/badge.svg)](https://github.com/ethras/compound-engineering-orca/actions/workflows/ci.yml)

AI skills that make each unit of engineering work easier than the last.

> **CE-Orca fork:** this repository preserves EveryInc's native Compound Engineering workflows and adds an optional Orca execution overlay for Claude and Codex. Upstream remains authoritative for skills and personas; fork-owned compatibility, provenance, and synchronization details live in [`integrations/orca/`](integrations/orca/README.md). Orca is not required for native execution.

## Install

### Claude Code

```text
/plugin marketplace add ethras/compound-engineering-orca
/plugin install compound-engineering
```

> **Already have Compound Engineering installed?** Compound Engineering moved to a root-native layout. You must refresh the marketplace *before* updating — see [Existing Installs](#existing-installs). Running `/plugin update` alone keeps you on the old version.

### Cursor

In Cursor Agent chat, install from the plugin marketplace:

```text
/add-plugin compound-engineering
```

Or search for "compound engineering" in the plugin marketplace.

### Grok Bot

Install Compound Engineering on the Cursor account that Grok Bot uses: in Cursor Agent chat run `/add-plugin compound-engineering`, or search for "compound engineering" in the Cursor plugin marketplace. Grok Bot reads skills from that account plugin cache; do not run Cursor IDE or Claude Code plugin commands on the Grok Bot host.

### Codex App

Compound Engineering is not listed in Codex's built-in plugin marketplace yet. Add it as a custom marketplace:

1. In the Codex app, open **Plugins** from the sidebar.
2. Click the arrow next to **Create**, then select **Add marketplace**.
3. Enter:

   | Field | Value |
   | --- | --- |
   | Source | `ethras/compound-engineering-orca` |
   | Git ref | `main` |
   | Sparse paths | leave blank |

4. Click **Add marketplace**.
5. Search for **Compound Engineering**, install **compound-engineering-plugin**, then restart Codex.

The Codex app install is self-contained for Compound Engineering. Specialist reviewer and research behavior lives inside the skills as local prompt assets; no separate custom-agent install step is required.

### Codex CLI

Register the marketplace, then install the plugin.

1. **Register the marketplace with Codex:**

   ```bash
   codex plugin marketplace add ethras/compound-engineering-orca
   ```

2. **Install the plugin:**

   ```bash
   codex plugin add compound-engineering@compound-engineering-plugin
   ```

   You can also launch `codex`, run `/plugins`, find the **Compound Engineering** marketplace, select the **compound-engineering** plugin, and choose **Install**. Restart Codex after install completes.

The native Codex plugin install is self-contained for Compound Engineering. Specialist reviewer and research behavior lives inside the skills as local prompt assets; no separate custom-agent install step is required.

For a non-default Codex profile, run every Codex-related step against the same `CODEX_HOME`. This example installs CE into a `work` profile:

```bash
CODEX_HOME="$HOME/.codex/profiles/work" codex plugin marketplace add ethras/compound-engineering-orca
CODEX_HOME="$HOME/.codex/profiles/work" codex plugin add compound-engineering@compound-engineering-plugin
```

The marketplace step only makes the plugin available; the plugin install is what activates the native CE skills for that profile.

#### Remove the legacy Codex tool map (pre-native installs)

If you previously installed Compound Engineering with the Bun `convert` / `install --to codex` CLI (before native Codex plugin support), that path may have inserted a managed block into your **global** Codex instructions file:

`<!-- BEGIN COMPOUND CODEX TOOL MAP -->` … `<!-- END COMPOUND CODEX TOOL MAP -->`

in `$CODEX_HOME/AGENTS.md` (default `~/.codex/AGENTS.md`). That Claude-compat tool map is obsolete — CE skills name Codex tools inline — and one of its lines incorrectly told Codex to collapse subagent dispatch onto the main thread. Native plugin install does **not** add this block.

Paste this into Codex (or any agent with access to your home directory) to remove it:

```text
Remove the obsolete Compound Engineering Codex tool-map block from my Codex home AGENTS.md.

1. Check `$CODEX_HOME/AGENTS.md` if CODEX_HOME is set, otherwise `~/.codex/AGENTS.md`. If I use Codex profiles, also check `~/.codex/profiles/*/AGENTS.md`.
2. Look for the exact sentinels `<!-- BEGIN COMPOUND CODEX TOOL MAP -->` and `<!-- END COMPOUND CODEX TOOL MAP -->`.
3. If both are present, delete only the span from the BEGIN line through the END line (inclusive), leaving any other user content untouched. Do not edit project/repo AGENTS.md unless those exact sentinels are present there.
4. If the file is empty after the removal, delete the file.
5. Show a short before/after summary of what you changed (or say the block was already absent). Do not add a replacement tool map.
```

Re-running the Bun convert/install CLI for Codex also strips the block if it is still present; it no longer inserts it.

**Another editor or CLI?** Kimi Code CLI, Cline, Grok Build CLI, Devin CLI, GitHub Copilot, Factory Droid, Qwen Code, OpenCode, Pi, oh-my-pi (omp), and Antigravity CLI are all supported — see [More install options](#more-install-options).

## CE-Orca runtime

The plugin and the orchestration runtime remain separate. Compound Engineering
owns the workflow semantics; the external `orca-orch` command launches and
waits for Orca runs, while orch-console remains an independent local monitor.
From an orch-console checkout, install and verify the stable endpoint:

```bash
pnpm install
pnpm orch:install-cli
orca-orch capabilities --protocol orca.local-protocol/v1
```

If the executable is not on `PATH`, set `CE_ORCA_COMMAND` to its executable
path. The value is passed directly to the process launcher and must not contain
shell arguments.

Each invocation accepts natural-language execution preferences. The controller
turns only explicit preferences into a schema-constrained, run-scoped patch;
ordinary product prose remains unchanged. For example:

```text
/lfg Use Claude Opus with high reasoning for planning, then 3 Codex gpt-5.6-sol workers at xhigh reasoning for implementation. Continue without confirmation.

/ce-doc-review Use Claude Opus with high reasoning for the security-lens reviewer; keep every other reviewer on the defaults.
```

You can also use the explicit JSON grammar in
[`integrations/orca/execution-request.schema.json`](integrations/orca/execution-request.schema.json).
Resolution precedence is built-ins <- `.ce-orca.json` project defaults <- named
private profile <- current prompt. Prompt overrides are never persisted. Saving
a profile requires an explicit `save-profile` action; confirmation is shown
only when the effective request has `confirmation: true`.

Without an override, every built-in CE role uses Codex `gpt-5.6-sol` with
medium reasoning. `parent` and `mid` roles have a 900-second supervision window;
`cheap` roles use 600 seconds. This `budget` controls elapsed supervision time,
not tokens or API spend.

| Requested runtime | `orca-orch` absent | Healthy and compatible | Installed but unhealthy/incompatible |
| --- | --- | --- | --- |
| `auto` (default) | Announced native CE | Orca for integrated stages | Preflight failure |
| `native` | Native CE | Native CE | Native CE |
| `orca` | Preflight failure | Orca for integrated stages | Preflight failure |

There is no mid-run fallback: once an Orca-owned stage starts, failures remain
visible and are not silently repeated by native agents. `/lfg` keeps one CE
controller for planning through shipping and propagates its stage targets to
the four child workflows as private, run-scoped data while preserving the
original user prompt. Strict writing stages require an attested mutation policy
and exact file scope. Codex and Claude can write when their local CLI passes
preflight. Cursor remains catalogued for native CE routing but is not eligible
for Orca-owned read or writer stages because it cannot attest
`orca.read-policy/v1` or the writer policy.

See the [Orca integration guide](integrations/orca/README.md) for project and
profile examples, the immutable `resolve` -> `run --resolved` contract, exact
ownership boundaries, and upstream synchronization.

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

**Learn more**

- [Skill documentation catalog](docs/skills/README.md)
- [Compound engineering: how Every codes with agents](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents)
- [The story behind compounding engineering](https://every.to/source-code/my-ai-had-already-fixed-the-code-before-i-saw-it)

## Workflow

The core loop is six steps: **brainstorm** the requirements, **plan** the implementation, **work** through the plan, **simplify** what you wrote, **review** the result, then **compound** the learning -- and repeat with better context.

| Skill | Purpose |
|-------|---------|
| [`/ce-brainstorm`](docs/skills/ce-brainstorm.md) | Interactive Q&A to think through a feature or problem and write a requirements-only unified plan before planning |
| [`/ce-plan`](docs/skills/ce-plan.md) | Enrich feature ideas or requirements-only plans into implementation-ready plans |
| [`/ce-work`](docs/skills/ce-work.md) | Execute implementation-ready plans natively or through a qualified cross-model author while retaining host verification, commits, and shipping |
| [`/ce-simplify-code`](docs/skills/ce-simplify-code.md) | Refine the freshly written code for clarity and reuse before review |
| [`/ce-code-review`](docs/skills/ce-code-review.md) | Report-only multi-agent review against the plan before merging; local apply is explicit |
| [`/ce-compound`](docs/skills/ce-compound.md) | Capture the learning into `docs/solutions/` so the next loop starts smarter |

Each cycle compounds: `/ce-compound` writes learnings that the next `/ce-brainstorm` and `/ce-plan` read as grounding -- brainstorms sharpen plans, plans inform future plans, reviews catch more issues, patterns get documented. That return arrow is the whole point.

> Artifact folders like `docs/solutions/` and `docs/plans/` are the **defaults**. A project whose `docs/` is tracked content can relocate every CE artifact folder under one repo-relative root via the `docs_root` setting -- see [configuration](docs/skills/configuration.md#artifact-root).

### Additional skills

These sit around the loop or get reached for on demand -- not every cycle needs them.

| Skill | When to reach for it |
|-------|---------|
| [`/ce-ideate`](docs/skills/ce-ideate.md) | *Before the loop*, when you don't yet know what to build -- generates and critically ranks grounded ideas, then routes the strongest one into `/ce-brainstorm` |
| [`/ce-strategy`](docs/skills/ce-strategy.md) | *Upstream anchor* -- creates and maintains `STRATEGY.md`, read as grounding by ideate, brainstorm, and plan so strategy choices flow into every feature |
| [`/ce-product-pulse`](docs/skills/ce-product-pulse.md) | *Outer loop* -- a time-windowed report on what users actually experienced (usage, performance, errors), saved to `docs/pulse-reports/`; its follow-ups feed back into ideation and brainstorming |
| [`/ce-debug`](docs/skills/ce-debug.md) | *Instead of brainstorm -> plan -> work* when the input is a bug rather than a feature -- reproduce, trace root cause, fix, then polish/review before PR handoff when warranted |
| [`/ce-pov`](docs/skills/ce-pov.md) | *On demand, before you commit* -- a decisive, project-grounded adoption verdict, holistic document take, or position on supplied approaches; optionally cross-checked by named peers or `oracle` through a blind initial round and bounded reconciliation |
| [`/ce-explain`](docs/skills/ce-explain.md) | *On demand, to account for the work or understand it* -- turns a concept, a diff, an idea, or "what did I do this week?" into a dense, self-contained visual document built to keep, with an optional check-in (predict-then-reveal for diffs, corrected exercises) when the material is worth retaining |

For the full catalog and how each skill chains together, see [docs/skills](docs/skills/README.md). The complete inventory is [below](#full-skill-inventory).

## Quick Example

**Finding a direction** -- when you don't have a specific idea yet, ideate first, then carry the strongest survivor into the loop:

```text
/ce-ideate new drawing tools
/ce-ideate surprise me
/ce-ideate open issues     # ground ideas in your tracker's open issues (GitHub, Linear, Jira)
```

`/ce-ideate` does the homework first (codebase, past learnings, prior art on the web, optionally your issue tracker), then hands you a ranked set of grounded candidates to take into `/ce-brainstorm`.

**Standard feature loop** -- turn a rough idea into shipped, reviewed code:

```text
/ce-brainstorm make background job retries safer
/ce-plan
/ce-work
/ce-simplify-code
/ce-code-review
/ce-compound
```

**Simplifying code** -- use it after fresh implementation work, or point it at code that keeps slowing changes down:

```text
/ce-simplify-code
/ce-simplify-code simplify the code in my most-churned file
```

The first pass tightens recent branch changes before review. The targeted pass is useful when one file keeps absorbing unrelated fixes, follow-ups, or merge conflicts.

**Debugging a bug** -- when you start from broken behavior instead of a feature:

```text
/ce-debug the checkout webhook sometimes creates duplicate invoices
/ce-code-review
/ce-compound
```

**Autonomous** -- hand off a feature and let the agent run the whole pipeline:

```text
/ce-brainstorm describe the feature
/lfg
```

`/lfg` runs the loop hands-off: it plans, works through the plan, simplifies, runs code review and applies the fixes, runs browser tests, then commits. When a git remote exists it pushes, opens a PR, and watches CI with a bounded repair loop (it does not merge, and it can finish with leftovers if the repair budget is hit). With no remote it stops at local commits. Start it after `/ce-brainstorm` so it plans against real requirements rather than a one-line prompt. It's the autopilot version of the standard loop when you want to step away and come back to an open PR. When an eligible multi-area plan still has unplanned work, `lfg` also recommends and justifies the next separately planned area; only if you accept does it create a `/ce-handoff` for a fresh session and separate plan.

## Getting Started

After installing, run `/ce-setup` in any project. It reports optional tool capabilities, creates repo `.compound-engineering/config.yaml` when missing, refreshes the committed example, and gitignores an existing local override.

The `compound-engineering` plugin currently ships 33 skills. Its core workflows spawn specialist subagents on demand for research, review, planning, and implementation. Each skill seeds generic subagents with its own prompts instead of relying on standalone plugin agents, keeping the workflows portable across harnesses that handle formal agent definitions differently.

### Full Skill Inventory

| Skill | Purpose |
|-------|---------|
| [`/ce-strategy`](docs/skills/ce-strategy.md) | Create or maintain `STRATEGY.md` |
| [`/ce-ideate`](docs/skills/ce-ideate.md) | Generate and critically evaluate grounded ideas |
| [`/ce-pov`](docs/skills/ce-pov.md) | Form a decisive, project-grounded POV on an adoption, document, or approach set |
| [`/ce-explain`](docs/skills/ce-explain.md) | Document a concept, diff, idea, or window of your own work as a visual artifact built to keep |
| [`/ce-brainstorm`](docs/skills/ce-brainstorm.md) | Explore requirements and write a right-sized requirements doc |
| [`/ce-plan`](docs/skills/ce-plan.md) | Create structured implementation plans |
| [`/ce-work`](docs/skills/ce-work.md) | Execute plans with native or cross-model implementation, durable progress, and transactional host-owned integration |
| [`/ce-code-review`](docs/skills/ce-code-review.md) | Review code with skill-local reviewer personas |
| [`/ce-doc-review`](docs/skills/ce-doc-review.md) | Review requirements and plan documents |
| [`/ce-debug`](docs/skills/ce-debug.md) | Reproduce failures, trace root cause, fix bugs, and prepare non-trivial fixes for PR |
| [`/ce-compound`](docs/skills/ce-compound.md) | Document solved problems to compound team knowledge |
| [`/ce-compound-refresh`](docs/skills/ce-compound-refresh.md) | Refresh stale or drifting learnings |
| [`/ce-optimize`](docs/skills/ce-optimize.md) | Run iterative optimization loops |
| [`/ce-retune`](docs/skills/ce-retune.md) | Retune a skill corpus for a new model, measurement-first |
| [`/ce-product-pulse`](docs/skills/ce-product-pulse.md) | Generate time-windowed product pulse reports |
| [`/ce-riffrec-feedback-analysis`](docs/skills/ce-riffrec-feedback-analysis.md) | Convert Riffrec recordings or notes into structured feedback |
| [`/ce-sweep`](docs/skills/ce-sweep.md) | Sweep feedback sources, track item lifecycles, and emit an `/lfg`-ready plan |
| [`/ce-resolve-pr-feedback`](docs/skills/ce-resolve-pr-feedback.md) | Resolve PR review feedback |
| [`/ce-commit`](docs/skills/ce-commit.md) | Create a git commit with a clear message |
| [`/ce-commit-push-pr`](docs/skills/ce-commit-push-pr.md) | Commit, push, and open a PR (or construct/submit an opt-in managed stack) that teaches any concept the change newly introduces |
| [`/ce-babysit-pr`](docs/skills/ce-babysit-pr.md) | Watch an open PR (or confirmed managed stack under posture) and keep it moving toward merge, reacting to review comments and CI as they arrive |
| [`/ce-worktree`](docs/skills/ce-worktree.md) | Ensure work happens in an isolated git worktree |
| [`/ce-promote`](docs/skills/ce-promote.md) | Draft user-facing announcement copy |
| [`/ce-test-browser`](docs/skills/ce-test-browser.md) | Run browser tests on PR-affected pages |
| [`/ce-test-xcode`](docs/skills/ce-test-xcode.md) | Build and test iOS apps on simulator |
| [`/ce-setup`](docs/skills/ce-setup.md) | Diagnose optional tool capabilities and create repo `config.yaml` |
| [`/ce-handoff`](docs/skills/ce-handoff.md) | Create a session handoff at the default temp store or a requested destination, then resume from a selected source |
| [`/ce-simplify-code`](docs/skills/ce-simplify-code.md) | Simplify recent code changes |
| [`/ce-prototype`](docs/skills/ce-prototype.md) | Build a throwaway prototype so someone can experience how the product should work, feel, or read |
| [`/ce-polish`](docs/skills/ce-polish.md) | Start a dev server and iterate on UX polish |
| [`/ce-proof`](docs/skills/ce-proof.md) | Create, edit, and share Proof documents |
| [`/ce-dogfood`](docs/skills/ce-dogfood.md) | Hands-off diff-scoped browser QA of the active branch, with autonomous fixes |
| [`/lfg`](docs/skills/lfg.md) | Full autonomous engineering workflow |

---

## More Install Options

[Claude Code, Cursor, and Codex](#install) are at the top. Everything here is equally supported.

### Kimi Code CLI

Kimi Code CLI can install Compound Engineering directly from this repository because the repo ships a native `.kimi-plugin/plugin.json` manifest:

```text
/plugins install https://github.com/ethras/compound-engineering-orca
```

You can also browse it through Kimi's custom marketplace flow:

```text
/plugins marketplace https://raw.githubusercontent.com/ethras/compound-engineering-orca/main/.kimi-plugin/marketplace.json
```

After installing or updating, run `/reload` or start a new Kimi session so the plugin skills are loaded.

### Cline

Cline loads CE skills from on-demand `SKILL.md` directories. Enable **Settings -> Features -> Enable Skills** in the Cline extension, then link this repository's skills globally or per project:

```bash
git clone https://github.com/ethras/compound-engineering-orca
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
grok plugin install ethras/compound-engineering-orca
```

This tracks the repository; run `grok plugin update` to pull the latest. To browse it as a marketplace source instead, the repo ships a native `.grok-plugin/marketplace.json`:

```bash
grok plugin marketplace add ethras/compound-engineering-orca
grok plugin install compound-engineering
```

Both paths track the repository directly (no commit pin), so no Bun install step is needed. Add `--trust` to skip the install confirmation. `grok` stores config under `~/.grok`; start a new session after installing so the skills load.

Compound Engineering is also being submitted to the official [xAI plugin marketplace](https://github.com/xai-org/plugin-marketplace); see [`docs/grok-marketplace-submission.md`](docs/grok-marketplace-submission.md) for the maintainer runbook.

### Devin CLI

Devin CLI can install Compound Engineering directly from GitHub because the repo ships a native `.devin-plugin/plugin.json` manifest:

```bash
devin plugins install ethras/compound-engineering-orca
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
2. Use `ethras/compound-engineering-orca` for the repo
3. Select `compound-engineering` when VS Code shows the plugins in this repository

For **Copilot CLI**, use:

Inside Copilot CLI:

```text
/plugin marketplace add ethras/compound-engineering-orca
/plugin install compound-engineering@compound-engineering-plugin
```

From a shell with the `copilot` binary:

```bash
copilot plugin marketplace add ethras/compound-engineering-orca
copilot plugin install compound-engineering@compound-engineering-plugin
```

Copilot CLI reads the existing Claude-compatible plugin manifests, so no separate Bun install step is needed.

### Factory Droid

From a shell with the `droid` binary:

```bash
droid plugin marketplace add https://github.com/ethras/compound-engineering-orca
droid plugin install compound-engineering@compound-engineering-plugin
```

Droid uses `plugin@marketplace` plugin IDs; here `compound-engineering` is the plugin and `compound-engineering-plugin` is the marketplace name. Droid installs the existing Claude Code-compatible plugin and translates the format automatically, so no Bun install step is needed.

### Qwen Code

```bash
qwen extensions install ethras/compound-engineering-orca:compound-engineering
```

Qwen Code installs Claude Code-compatible plugins directly from GitHub and converts the plugin format during install, so no Bun install step is needed.

### OpenCode

Add Compound Engineering to the `plugin` array in your global or project `opencode.json`:

```json
{
  "plugin": ["compound-engineering@git+https://github.com/ethras/compound-engineering-orca.git"]
}
```

Restart OpenCode after changing the config. The OpenCode plugin registers the Compound Engineering skills directory directly; no Bun installer or generated skill copy is required. See [`.opencode/INSTALL.md`](.opencode/INSTALL.md) for pinning examples.

### Pi

Install Compound Engineering as a Pi package from this repository:

```bash
pi install git:github.com/ethras/compound-engineering-orca
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
agy plugin install https://github.com/ethras/compound-engineering-orca
```

Verify with `agy plugin list`. The repository root is the plugin package (`plugin.json` plus `skills/`).

For a local checkout or pinned release:

```bash
git clone https://github.com/ethras/compound-engineering-orca
agy plugin install ./compound-engineering-plugin
```

The bundled `.agy/` directory remains a compatibility entry point (`agy plugin install ./compound-engineering-plugin/.agy`). `agy` also loads `GEMINI.md` workspace context from the checkout.

See [`.agy/INSTALL.md`](.agy/INSTALL.md) for pinning, local development, uninstall, and legacy Gemini import.

### Existing Installs

Compound Engineering moved to a root-native, skills-only layout. An existing marketplace install keeps a **cached** marketplace snapshot that still points at the old `plugins/compound-engineering` path, so updating the plugin on its own reads that stale snapshot and leaves you on the previous version. Refresh the cached marketplace **first**, then update the plugin — order matters.

If an existing install still uses the official `EveryInc/compound-engineering-plugin` marketplace, remove that source and add `ethras/compound-engineering-orca` before refreshing so Claude Code and Codex both load the Orca-enabled fork.

**Claude Code**

```text
/plugin marketplace remove compound-engineering-plugin
/plugin marketplace add ethras/compound-engineering-orca
/plugin marketplace update compound-engineering-plugin
/plugin update compound-engineering
```

**Codex CLI**

```bash
codex plugin marketplace remove compound-engineering-plugin
codex plugin marketplace add ethras/compound-engineering-orca
codex plugin marketplace upgrade compound-engineering-plugin
codex plugin add compound-engineering@compound-engineering-plugin
```

There is no `codex plugin update`; re-running `add` reinstalls from the refreshed snapshot. For a non-default profile, run both commands against the same `CODEX_HOME`.

**Codex App**

Refresh the marketplace from the **Plugins** panel. If it still uses the official source, remove it and add a marketplace with source `ethras/compound-engineering-orca`, then reinstall **compound-engineering** and restart Codex.

**Grok Bot**

Refresh or reinstall Compound Engineering on the Cursor account so Grok Bot's account plugin cache picks up the new snapshot. Do not clone this repository onto the Grok Bot computer for normal updates.

If you configured a host with a direct path or sparse path under `plugins/compound-engineering`, edit or reinstall that source so it points at the repository root with no sparse path.

If a previous Bun-installed copy is still shadowing native plugin skills, run the current cleanup command from a checkout of this repository:

```bash
git clone https://github.com/ethras/compound-engineering-orca.git /tmp/compound-engineering-orca-cleanup
cd /tmp/compound-engineering-orca-cleanup
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

**Cursor Agent CLI**

```bash
cursor-agent --plugin-dir "$PWD"
```

**Codex**

For the normal production-like plugin installation, use the [Codex App](#codex-app) or [Codex CLI](#codex-cli) instructions above. The workflow below is only for contributors who need Codex to load unreleased files from an exact checkout or linked worktree.

<details>
<summary><strong>Advanced: test this exact checkout in Codex</strong></summary>

Select the current worktree as the active Codex development source:

```bash
bun run codex:dev -- local
```

This creates one collection symlink at `$CODEX_HOME/skills/compound-engineering-local` (default `~/.codex/skills/compound-engineering-local`) pointing to this worktree's `skills/` directory. It removes installed Compound Engineering plugin variants through the Codex CLI so a cached marketplace plugin cannot shadow or duplicate the local skills. It does not copy skills, change the checkout, pull Git, or touch unrelated entries under `$CODEX_HOME/skills`.

The link exposes exactly what is in the selected worktree, including modified and untracked skills. Ordinary edits therefore need no reinstall, and current Codex versions detect direct skill changes automatically. Start a new session after switching between local and remote installation modes; if an ordinary skill edit does not appear, restart Codex.

Use these commands to inspect and switch modes:

```bash
bun run codex:dev -- status
bun run codex:dev -- refresh
bun run codex:dev -- remote
bun run codex:dev -- remove
```

- `status` reports local, remote, mixed, drifted, or absent state plus the linked checkout, worktree kind, branch, commit SHA, and dirty counts.
- `refresh` is an idempotent alias for `local`; use it to reconcile accidental plugin installs. The live link already reflects file changes.
- `remote` refreshes the official Git marketplace, installs and verifies `compound-engineering@compound-engineering-plugin`, then removes the local link. Use it to simulate the released user experience.
- `remove` removes Compound Engineering plugin variants and the managed link, leaving the checkout and unrelated user skills intact.

The script derives the repository path, so it works from checkouts in any location, including paths with spaces. It inherits the active `CODEX_HOME`; set `CODEX_HOME` on the command when testing an isolated profile. Run every mode against the same `CODEX_HOME` you use to launch Codex.

Do not use `codex plugin marketplace add "$PWD"` for live local development. It installs a cached copy of this checkout, so later edits are not reflected until the plugin is installed again; a matching manifest version also does not prove the cache matches the worktree. The `codex:dev` workflow instead keeps Codex linked to the current skill files.

</details>

**Kimi Code CLI**

Inside Kimi Code CLI:

```text
/plugins install /path/to/compound-engineering-plugin
```

To test the local marketplace catalog instead, pass the catalog path:

```text
/plugins marketplace /path/to/compound-engineering-plugin/.kimi-plugin/marketplace.json
```

**Cline**

```bash
/path/to/compound-engineering-plugin/.cline/scripts/install-skills.sh --global
```

Enable **Settings -> Features -> Enable Skills** in the Cline extension, then start a new task.

**Devin CLI**

```bash
devin plugins install /path/to/compound-engineering-plugin
```

Local installs are linked to the checkout rather than copied, so skill edits apply on the next Devin session without reinstalling.

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

**oh-my-pi (omp)**

```bash
omp plugin link "$PWD"
```

**Antigravity CLI (`agy`)**

```bash
agy plugin install "$PWD"
agy plugin validate "$PWD"
```

Or install the bundled `.agy/` entry point:

```bash
agy plugin install "$PWD/.agy"
```

See [`.agy/INSTALL.md`](.agy/INSTALL.md) for remote install and pinning examples.

## Limitations

OpenCode, Pi, and oh-my-pi (omp) use native package/plugin loading from this repository. The Bun CLI remains for repository development and converter maintenance, not normal installation.

Release versions are owned by release automation. Routine feature PRs should not hand-bump plugin or marketplace manifest versions.

## FAQ

### Do I need Bun to install Compound Engineering?

No. Bun is only needed for repo development tasks and converter maintenance.

### Where do I see all available skills?

The skill inventory is in this README, and the deeper skill catalog is in [`docs/skills/README.md`](docs/skills/README.md). Each skill's authoritative runtime spec lives in `skills/<skill>/SKILL.md`.

### Where is release history?

GitHub Releases are the canonical release-notes surface. The root [`CHANGELOG.md`](CHANGELOG.md) points to that history.

## Contributing

Contributions are welcome. Issues, bug reports, and pull requests all help make this better, and we genuinely appreciate them — bug reports especially.

A note on what to expect: Compound Engineering is opinionated by design. It's maintained by [@kieranklaassen](https://github.com/kieranklaassen) and [@tmchow](https://github.com/tmchow), and its direction reflects a specific point of view about how AI-assisted engineering should work. So while we welcome help, we can't promise to accept every change — some proposals won't fit that vision even when they're good ideas on their own.

Open an issue or send a PR, and we'll fold in what moves the plugin in the right direction. We just want to be upfront that not everything will land.

## License

[MIT](LICENSE)
