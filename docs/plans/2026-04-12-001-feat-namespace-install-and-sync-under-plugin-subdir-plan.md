---
title: "feat: Namespace install output under a compound-engineering subdirectory"
type: feat
status: completed
date: 2026-04-12
---

> **Implementation note (2026-04-12):** Shipped with narrower scope than originally drafted. Only install/convert skill directories are namespaced on shared roots. Sync output stays flat. Agents, commands, prompts, steering files, and MCP config stay in their existing locations.

# feat: Namespace Install Output Under a `compound-engineering/` Subdirectory

## Overview

`compound-plugin install --to <target>` used to place plugin skill directories directly in each target's top-level skills root. Sync is unchanged: it mirrors your personal `~/.claude` skills and writes flat under each target's skills root (no namespace subdirectory). With 47 skills, a user scanning `~/.codex/skills/` would see compound-engineering content intermixed with their own skills, host-provided defaults (like Codex's `.system/`), and anything installed by other tools. There was no filesystem-level grouping to distinguish plugin-managed content from user-authored content.

This change groups **install** managed skill directories under a namespace subdirectory:

```text
<skills-root>/compound-engineering/<skill-name>/SKILL.md
```

The goal is simple filesystem organization. It is not a migration or removal feature.

### Why subdirectories work

Target tools that support skills use recursive directory scanning for `SKILL.md` discovery. For example, Codex's loader (`codex-rs/core-skills/src/loader.rs`) walks up to `MAX_SCAN_DEPTH = 6` levels and already ships its own namespaced skills under `~/.codex/skills/.system/`. The same recursive pattern holds for the other targets.

## Scope

- Namespaced skill directories for targets that use a shared skills root (install/convert only).
- No changes outside skill placement.
- `convert` command output is unchanged (no namespace applied to one-shot conversions).
- Sync output is unchanged — sync writes user-owned content flat, without namespacing.

### Multi-plugin namespacing

The repo ships two plugins: `compound-engineering` and `coding-tutor`. Each surface handles this differently:

- **Install/convert:** Already multi-plugin-aware. Every converter sets `pluginName: plugin.manifest.name` on the bundle, and every target writer uses `bundle.pluginName ?? DEFAULT_PLUGIN_NAMESPACE`. Installing `coding-tutor` places skills under `skills/coding-tutor/` with no additional work.
- **Sync:** Mirrors the user's personal `~/.claude` home config, not plugin content. It writes flat (no namespace subdirectory) because user-authored skills should not be grouped under a plugin name.
- **Cleanup:** Scans all known plugin namespaces (`KNOWN_PLUGIN_NAMESPACES`) so stale flat skills are detected regardless of which plugin installed them.

## Target Behavior

### Shared-root targets

Targets with a shared `skills/` directory now install compound-engineering content under a namespaced subdirectory. Examples:

```text
~/.codex/skills/compound-engineering/<skill>/
~/.github/skills/compound-engineering/<skill>/
~/.gemini/skills/compound-engineering/<skill>/
~/.pi/agent/skills/compound-engineering/<skill>/
```

### OpenClaw

OpenClaw install/convert is different because its resolved output root is already the plugin package directory:

```text
~/.openclaw/extensions/<plugin-name>/
```

Inside that package, skills remain flat at:

```text
~/.openclaw/extensions/<plugin-name>/skills/<skill>/
```

OpenClaw sync writes user-owned home content into `~/.openclaw/skills/`. Sync does not namespace — see the "Sync does not namespace" note below.

> **Sync does not namespace:** During triage it became clear that sync is mirroring the user's personal `~/.claude/skills/` content, which is user-owned rather than plugin-owned. Wrapping it under a `compound-engineering/` subdir would semantically mislabel user-authored skills as plugin-managed. Install/convert still namespaces because install writes plugin content to a shared root; sync does not. As a consequence, cleanup does not scan OpenClaw's skills root at all — OpenClaw install writes into an isolated `~/.openclaw/extensions/<plugin>/skills/` package that cleanup never touches, and sync never contributes legacy state to cleanup.

## Design Decisions

- **Manifest-driven for install.** Install and convert derive `pluginName` from `plugin.manifest.name`, so each plugin gets its own namespace subdirectory under the shared skills root. Sync does not apply that namespace — it writes flat. Cleanup iterates `KNOWN_PLUGIN_NAMESPACES` to cover both plugins.
- **Skills only.** Agents, commands, prompts, steering files, and MCP config stay in their existing flat locations. Only install-side skill directories (the highest-volume artifact type) are namespaced on shared roots.
- **Legacy cleanup is opt-in via a dedicated command.** Installs do NOT touch the user's existing flat-layout skill directories. A new `compound-plugin cleanup` command scans each target's shared skills root for flat entries whose names match a namespaced plugin skill and removes them on `--execute` after an interactive `y/N` confirmation (or explicit `--yes` for non-interactive use). Cleanup matches by directory name only, so a `--skip name1,name2` flag is provided to protect user-authored skills whose names happen to collide with plugin skills. Dry-run is the default. See the "Cleanup Legacy Flat Skills" section of the README for full usage.

## Implementation Summary

- `src/utils/plugin-namespace.ts` provides the namespace constant, path helper, and `KNOWN_PLUGIN_NAMESPACES` array used by cleanup.
- Target writers for Codex, OpenCode, Copilot, Gemini, Pi, Droid, Kiro, Windsurf, and Qwen write copied/generated skills beneath the namespaced skills directory.
- Shared sync helpers write symlinked skills and generated command-backed skills flat into the target skills root (no namespace).
- OpenClaw install/convert keeps flat package-internal skill paths because the package root already provides isolation.
- `src/cleanup/legacy-skills.ts` and `src/commands/cleanup.ts` implement the opt-in cleanup command. `removeStaleFlatSkills` supports dry-run, a `skip` set, and returns both stale and protected entries so the CLI can report them distinctly. The CLI prints a disclaimer on every run, prompts for `y/N` on TTY, and refuses to run `--execute` non-interactively without `--yes`.

## Verification

- Writer tests cover namespaced skill output for the affected targets.
- Sync tests verify skills are written flat (no namespace subdirectory).
- OpenClaw tests continue to treat package installs separately from shared-root sync behavior.
- Cleanup tests cover dry-run reporting, execute deletion, the `skip` list, symlink-target matching, and multi-plugin namespace iteration. The registry test asserts that `resolveSyncSkillsRoot` returns a path for every namespaced install target and null for `openclaw` (which has no shared-root legacy state).
