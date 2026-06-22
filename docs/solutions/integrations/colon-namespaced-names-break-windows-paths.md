---
title: "Colon-namespaced skill names break filesystem paths on Windows"
date: 2026-03-26
last_refreshed: 2026-06-20
category: integration-issues
module: cli-converter
problem_type: integration_issue
component: tooling
symptoms:
  - "ENOTDIR error when running bun convert on Windows"
  - "mkdir fails with '.config\\opencode\\skills\\ce:brainstorm'"
  - "All target writers (opencode, codex, copilot, etc.) produce colon paths"
root_cause: config_error
resolution_type: code_fix
severity: high
related_issues:
  - "https://github.com/EveryInc/compound-engineering-plugin/issues/366"
related_components:
  - targets
  - sync
  - converters
tags:
  - windows
  - cross-platform
  - path-sanitization
  - skill-names
  - colons
---

# Colon-namespaced skill names break filesystem paths on Windows

## Problem

Earlier plugin versions allowed skill names containing colons (e.g., `ce:brainstorm`, `ce:plan`) to flow directly into target writer paths. Colons are illegal in Windows filenames, causing `ENOTDIR` errors during `bun convert` or `bun install`.

## Symptoms

```
{ [Error: ENOTDIR: not a directory, mkdir '.config\opencode\skills\ce:brainstorm']
  code: 'ENOTDIR',
  path: '.config\\opencode\\skills\\ce:brainstorm',
  syscall: 'mkdir',
  errno: -20 }
```

This affected every target present at the time because all used `skill.name` directly in `path.join()` calls. Current CE source skills are hyphenated (`ce-brainstorm`, `ce-plan`), but the sanitizer still matters for compatibility fixtures, imported third-party plugins, and legacy artifact cleanup.

## What Didn't Work

Using `/` (forward slash) as the replacement character was initially considered — turning `ce:brainstorm` into nested directories `ce/brainstorm/`. This was rejected because:

1. It introduces unnecessary directory nesting for what's fundamentally a character-replacement problem
2. The `isValidSkillName` and `validatePathSafe` functions reject `/` and `\`, so sanitized names would fail existing validation
3. The source directories already use hyphens (`skills/ce-brainstorm/`), so the output should match

## Solution

Added `sanitizePathName()` in `src/utils/files.ts` that replaces colons with hyphens:

```typescript
export function sanitizePathName(name: string): string {
  return name.replace(/:/g, "-")
}
```

Applied across two layers:

### Layer 1: Target writers

Every target writer wraps skill/agent names with `sanitizePathName()` when constructing output paths:

```typescript
// Before
await copyDir(skill.sourceDir, path.join(skillsRoot, skill.name))

// After
await copyDir(skill.sourceDir, path.join(skillsRoot, sanitizePathName(skill.name)))
```

Currently applied in the maintained target writers and managed-artifact cleanup path. When this fix was first written, a separate `src/sync/` directory also held path-construction logic that needed the same treatment; that layer has since been consolidated into target writers.

### Layer 2: Converter dedupe sets and manifests

Sanitizing paths in writers created a secondary bug: converter dedupe logic used unsanitized names, so a pass-through skill `ce:plan` and a generated skill normalizing to `ce-plan` wouldn't detect the collision — both would write to `skills/ce-plan/` on disk.

Fixed in converters that maintain dedupe sets — currently `src/converters/claude-to-copilot.ts`:

- `usedSkillNames.add(sanitizePathName(skill.name))` instead of raw `skill.name`

Any future converter that maintains a name-collision set or emits a manifest must apply the same sanitization so the in-memory set matches the on-disk paths.

## Why This Works

The core issue was a mismatch between the logical name domain (where older plugin data used colons as namespace separators) and the filesystem domain (where colons are illegal on Windows). The fix sanitizes at the boundary: legacy/imported names can keep colons in data structures, but paths use hyphens. Current CE source directories and frontmatter use hyphenated names directly (`skills/ce-brainstorm/`, `name: ce-brainstorm`), so the sanitizer is now primarily a compatibility guard.

## Prevention

### 1. Collision detection test

A test in `tests/path-sanitization.test.ts` loads the real compound-engineering plugin and verifies no two skill or agent names collide after sanitization:

```typescript
test("no two skill names collide after sanitization", async () => {
  const plugin = await loadClaudePlugin(pluginRoot)
  const sanitized = plugin.skills.map((skill) => sanitizePathName(skill.name))
  const unique = new Set(sanitized)
  expect(unique.size).toBe(sanitized.length)
})
```

### 2. When adding names to filesystem paths

Always use `sanitizePathName()` when constructing output paths from skill, agent, or component names. Never pass `skill.name` or `agent.name` directly to `path.join()` in target writers or managed artifact paths.

### 3. When building dedupe sets in converters

If a converter reserves names for collision detection, the reserved names must be sanitized to match what the writer will produce on disk. Raw names in the set + normalized names from generators = missed collisions.

### 4. Inconsistency with `resolveCommandPath`

Note that `resolveCommandPath` (used for commands) converts colons to nested directories (`ce:plan` -> `ce/plan.md`), while `sanitizePathName` (used for skills/agents and compatibility artifact paths) converts to hyphens (`ce:plan` -> `ce-plan`). This is intentional — commands and skills are different surfaces with different resolution patterns. If a new component type is added, decide which pattern fits and document the choice.
