---
title: "Native plugin install strategy for supported harnesses"
date: 2026-06-19
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
  - gemini
  - opencode
  - pi
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
| OpenCode | Git-backed OpenCode plugin entry in `opencode.json` | No | `.opencode/plugins/compound-engineering.js` registers the CE skills directory directly. |
| Pi | Git-backed Pi package install from this repository | No | Root `package.json` exposes `.pi/extensions/compound-engineering.ts` and the CE skills directory. `pi-ask-user` is a recommended companion for richer prompts. |
| Gemini CLI | Native Gemini extension from this repository root | No | Root `gemini-extension.json` lets Gemini install the repository as a single extension. |

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

## Gemini CLI

Gemini can install the root extension directly because `gemini-extension.json` now lives at the repository root:

```bash
gemini extensions install https://github.com/EveryInc/compound-engineering-plugin
```

For local development, point Gemini at the checkout root so the extension sees `gemini-extension.json`, `GEMINI.md`, and `skills/` together.

## Bun Package Posture

The root package remains useful for:

- Repo development scripts and tests.
- OpenCode package metadata (`main`).
- Pi package metadata (`pi` field).
- Shared converter code and regression tests for historical or fixture targets.

It is not a public npm installer. Release automation should not publish `@every-env/compound-plugin`, and README install instructions should not rely on `bunx`.
