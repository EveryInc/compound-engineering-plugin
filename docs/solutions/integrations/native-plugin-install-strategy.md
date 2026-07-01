---
title: "Native plugin install strategy for supported harnesses"
date: 2026-06-19
last_updated: 2026-06-30
category: integrations
module: installer
problem_type: integration_decision
component: installer
symptoms:
  - "Formal standalone agent definitions are unevenly supported across coding-agent harnesses"
  - "Custom Bun installs create extra update and cleanup behavior for users"
  - "OpenCode and Pi can load skills directly from a git-backed package/plugin shape"
root_cause: evolving_platform_install_surfaces
resolution_type: install_strategy
severity: medium
tags:
  - install-strategy
  - native-plugins
  - cursor
  - codex
  - copilot
  - droid
  - qwen
  - kimi
  - antigravity
  - opencode
  - pi
  - cline
---

# Native Plugin Install Strategy

Last verified: 2026-06-20

Compound Engineering now treats the plugin as a self-contained skills package. Specialist reviewer and researcher behavior lives in skill-local prompt assets under `references/agents/` or `references/personas/`, and skills seed generic subagents with those files when the current harness exposes a subagent primitive. There are no formal standalone CE agents in the plugin surface.

The install strategy follows from that: prefer each harness's native plugin/package mechanism, avoid generated agent installs, and keep the Bun converter as repo tooling rather than the user-facing installer.

## Summary

| Harness | Current install path | Bun CLI needed? | Notes |
| --- | --- | --- | --- |
| Claude Code | Native plugin marketplace using `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` | No | Claude remains the source plugin format. |
| Codex | Native Codex plugin install from a custom marketplace pointing at this repository root | No | Codex App users add the marketplace manually with no sparse path; Codex CLI users register the repo and install through `/plugins`. Skill-local personas avoid the old custom-agent copy step. |
| Cursor | Native Cursor Plugin Marketplace using `.cursor-plugin/marketplace.json` and `.cursor-plugin/plugin.json` | No | Users install from Cursor Agent chat with `/add-plugin compound-engineering` or marketplace search. |
| GitHub Copilot CLI | Native plugin marketplace using the existing Claude plugin metadata | No | Copilot translates the Claude plugin metadata itself. |
| Factory Droid | Native plugin marketplace pointed at the CE GitHub repository | No | Droid translates Claude Code plugins automatically. |
| Qwen Code | Native extension install from the CE GitHub repository and existing Claude plugin metadata | No | Qwen translates Claude Code extensions automatically. |
| Kimi Code CLI | Native plugin install from this repository using `.kimi-plugin/plugin.json` | No | Kimi can install directly from the GitHub repo and can browse the committed `.kimi-plugin/marketplace.json` custom catalog. |
| OpenCode | Git-backed OpenCode plugin entry in `opencode.json` | No | `.opencode/plugins/compound-engineering.js` registers the CE skills directory directly. |
| Pi | Git-backed Pi package install from this repository | No | Root `package.json` exposes `.pi/extensions/compound-engineering.ts` and the CE skills directory. `pi-ask-user` is a recommended companion for richer prompts. |
| Antigravity CLI | Native plugin install from root `plugin.json` + `skills/`, or bundled `.agy/` entry point | No | `agy plugin install https://github.com/EveryInc/compound-engineering-plugin` for one-command remote install. `.agy/plugin.json` symlinks to the root manifest; `.agy/skills` symlinks to `skills/`. |
| Cline | Native skills install via `.cline/scripts/install-skills.sh` | No | Symlinks invocable CE skills into `~/.cline/skills/` or `.cline/skills/`, skipping manual-only skills (`disable-model-invocation: true`). Enable Skills in the Cline extension settings. |

Kiro is no longer a documented CE install target. Historical converter and cleanup code may remain for regression coverage or old artifact handling, but user-facing install docs should not advertise Kiro.

## OpenCode

OpenCode can load plugins from git package entries in `opencode.json`. CE ships `.opencode/plugins/compound-engineering.js`, which resolves the repository's `skills` directory and appends it to OpenCode's skill paths.

Recommended config:

```json
{
  "plugin": ["compound-engineering@git+https://github.com/EveryInc/compound-engineering-plugin.git"]
}
```

For local development, point OpenCode at this checkout:

```json
{
  "plugin": ["/path/to/compound-engineering-plugin/.opencode/plugins/compound-engineering.js"]
}
```

This replaces the old custom OpenCode Bun install path for normal CE users. The converter can still exist as development or compatibility tooling, but it is not the primary install story.

## Pi

Pi can install packages from git repositories. CE exposes a Pi package through root `package.json`:

```json
{
  "pi": {
    "extensions": ["./.pi/extensions/compound-engineering.ts"],
    "skills": ["./skills"]
  }
}
```

Install:

```bash
pi install git:github.com/EveryInc/compound-engineering-plugin
```

Recommended companion:

```bash
pi install npm:pi-subagents
pi install npm:pi-ask-user
```

`pi-subagents` is required for CE workflows that dispatch reviewer, research, or implementation subagents. `pi-ask-user` is only for richer blocking question UX.

For local development:

```bash
pi -e /path/to/compound-engineering-plugin
```

## Antigravity CLI

Antigravity installs plugins from a local directory or a remote Git URL when the source root contains `plugin.json` and `skills/`. CE publishes both at the repository root.

Recommended one-command install:

```bash
agy plugin install https://github.com/EveryInc/compound-engineering-plugin
```

Local checkout:

```bash
git clone https://github.com/EveryInc/compound-engineering-plugin
agy plugin install ./compound-engineering-plugin
```

The committed `.agy/` bundle remains for explicit local installs (`agy plugin install ./compound-engineering-plugin/.agy`). Its `plugin.json` symlinks to the root manifest and `skills` symlinks to `../skills`.

`agy` still reads `GEMINI.md` as workspace context. See `.agy/INSTALL.md` for pinning, validation, and uninstall.

## Cline

Cline discovers skills from `~/.cline/skills/` (global) or `.cline/skills/` (project). CE ships `.cline/scripts/install-skills.sh`, which symlinks each directory under this repository's `skills/` into the chosen destination.

Recommended global install:

```bash
git clone https://github.com/EveryInc/compound-engineering-plugin
./compound-engineering-plugin/.cline/scripts/install-skills.sh --global
```

For local development from a checkout:

```bash
/path/to/compound-engineering-plugin/.cline/scripts/install-skills.sh --global
```

Enable **Settings -> Features -> Enable Skills** in the Cline extension, then start a new task. The install script skips manual-only skills marked `disable-model-invocation: true` in frontmatter (for example `lfg`, `ce-dogfood`, `ce-polish`) because Cline auto-activates skills from description matching alone. Pass `--include-manual` to link those skills for slash-command use, accepting that Cline may still auto-activate them. CE does not ship a separate Cline CLI `AgentPlugin` entry point; skills are the install surface.

## Kimi Code CLI

Kimi Code CLI has a native plugin surface, so CE should not maintain a Kimi converter target for normal installation. The root `.kimi-plugin/plugin.json` declares the CE skills directory with `skills: "./skills/"` and carries display metadata through Kimi's `interface` object.

Direct install:

```text
/plugins install https://github.com/EveryInc/compound-engineering-plugin
```

Marketplace install:

```text
/plugins marketplace https://raw.githubusercontent.com/EveryInc/compound-engineering-plugin/main/.kimi-plugin/marketplace.json
```

The Kimi marketplace catalog uses schema version `"2"` and entries with `id` plus `source`. It has no release-owned marketplace version, so release automation bumps only `.kimi-plugin/plugin.json` through the root `compound-engineering` component. `bun run release:validate` enforces Kimi manifest and marketplace parity with the Claude source manifest/catalog.

## Bun Package Posture

The root package remains useful for:

- Repo development scripts and tests.
- OpenCode package metadata (`main`).
- Pi package metadata (`pi` field).
- Shared converter code and regression tests for historical or fixture targets.

It is not a public npm installer. Release automation should not publish `@every-env/compound-plugin`, and README install instructions should not rely on `bunx`.
