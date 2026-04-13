---
title: "feat: Namespace install/sync output under a compound-engineering subdirectory"
type: feat
status: completed
date: 2026-04-12
---

> **Implementation note (2026-04-12):** Shipped with narrower scope than originally drafted. Only skill directories are namespaced. Agents, commands, prompts, steering files, and MCP config stay in their existing locations.

# feat: Namespace Install/Sync Output Under a `compound-engineering/` Subdirectory

## Overview

`compound-plugin install --to <target>` and `compound-plugin sync` used to place skill directories directly in each target's top-level skills root. With 47 skills, a user scanning `~/.codex/skills/` would see compound-engineering content intermixed with their own skills, host-provided defaults (like Codex's `.system/`), and anything installed by other tools. There was no filesystem-level grouping to distinguish plugin-managed content from user-authored content.

This change groups managed skill directories under a namespace subdirectory:

```text
<skills-root>/compound-engineering/<skill-name>/SKILL.md
```

The goal is simple filesystem organization. It is not a migration or removal feature.

### Why subdirectories work

Target tools that support skills use recursive directory scanning for `SKILL.md` discovery. For example, Codex's loader (`codex-rs/core-skills/src/loader.rs`) walks up to `MAX_SCAN_DEPTH = 6` levels and already ships its own namespaced skills under `~/.codex/skills/.system/`. The same recursive pattern holds for the other targets.

## Scope

- Namespaced skill directories for targets that use a shared skills root.
- No changes outside skill placement.
- `convert` command output is unchanged (no namespace applied to one-shot conversions).

### Multi-plugin namespacing

The repo ships two plugins: `compound-engineering` and `coding-tutor`. Each surface handles this differently:

- **Install/convert:** Already multi-plugin-aware. Every converter sets `pluginName: plugin.manifest.name` on the bundle, and every target writer uses `bundle.pluginName ?? DEFAULT_PLUGIN_NAMESPACE`. Installing `coding-tutor` places skills under `skills/coding-tutor/` with no additional work.
- **Sync:** Syncs the user's personal `~/.claude` home config, not a specific plugin. The default namespace (`compound-engineering`) is correct here because the synced content is not owned by either plugin.
- **Cleanup:** Scans all known plugin namespaces (`KNOWN_PLUGIN_NAMESPACES`) so stale flat skills are detected regardless of which plugin installed them.

## Target Behavior

### Shared-root targets

Targets with a shared `skills/` directory now install or sync compound-engineering content under a namespaced subdirectory. Examples:

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

OpenClaw sync is different again because it writes into the shared `~/.openclaw/skills/` root, so it uses the same namespaced layout as the other sync targets.

## Design Decisions

- **Manifest-driven for install, constant for sync.** Install and convert derive `pluginName` from `plugin.manifest.name`, so each plugin gets its own namespace subdirectory. Sync uses a single `DEFAULT_PLUGIN_NAMESPACE` constant because it syncs user home config rather than a specific plugin. Cleanup iterates `KNOWN_PLUGIN_NAMESPACES` to cover both plugins.
- **Skills only.** Agents, commands, prompts, steering files, and MCP config stay in their existing flat locations. Only skill directories (the highest-volume artifact type) are namespaced.
- **Legacy cleanup in writers.** Each target writer and `syncSkills` removes previously-installed flat-layout skill directories whose names match the current bundle, so upgrading from flat to namespaced is automatic. Only names present in the bundle are touched; user-authored siblings are never deleted.

## Implementation Summary

- `src/utils/plugin-namespace.ts` provides the namespace constant, path helper, and `KNOWN_PLUGIN_NAMESPACES` array for cleanup.
- Target writers for Codex, OpenCode, Copilot, Gemini, Pi, Droid, Kiro, Windsurf, and Qwen write copied/generated skills beneath the namespaced skills directory.
- Shared sync helpers write symlinked skills and generated command-backed skills beneath the same namespaced skills directory.
- OpenClaw install/convert keeps flat package-internal skill paths because the package root already provides isolation.

## Verification

- Writer tests cover namespaced skill output for the affected targets.
- Sync tests cover namespaced skill symlinks for the affected targets.
- OpenClaw tests continue to treat package installs separately from shared-root sync behavior.
