---
title: "Colon-namespaced skill names break filesystem paths on Windows"
date: 2026-03-26
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

Skill names containing colons (e.g., `ce:brainstorm`, `ce:plan`) were used directly as directory names in all target writers and sync paths. Colons are illegal in Windows filenames, causing `ENOTDIR` errors during `bun convert` or `bun install`.

## Symptoms

```
{ [Error: ENOTDIR: not a directory, mkdir '.config\opencode\skills\ce:brainstorm']
  code: 'ENOTDIR',
  path: '.config\\opencode\\skills\\ce:brainstorm',
  syscall: 'mkdir',
  errno: -20 }
```

This affected every target (OpenCode, Codex, Copilot, Gemini, Kiro, Droid, Pi, and others present at the time) because all used `skill.name` directly in `path.join()` calls.

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

Currently applied in `src/targets/{opencode,codex,gemini,kiro,pi,managed-artifacts}.ts`. (When this fix was first written, a separate `src/sync/` directory also held path-construction logic that needed the same treatment. That layer has since been consolidated into target writers.)

### Layer 2: Converter dedupe sets and manifests

Sanitizing paths in writers created a secondary bug: converter dedupe logic used unsanitized names, so a pass-through skill `ce:plan` and a generated skill normalizing to `ce-plan` wouldn't detect the collision — both would write to `skills/ce-plan/` on disk.

Fixed in converters that maintain dedupe sets — currently `src/converters/claude-to-copilot.ts`:

- `usedSkillNames.add(sanitizePathName(skill.name))` instead of raw `skill.name`

Any future converter that maintains a name-collision set or emits a manifest must apply the same sanitization so the in-memory set matches the on-disk paths.

## Why This Works

The core issue was a mismatch between the logical name domain (colons as namespace separators) and the filesystem domain (colons illegal on Windows). The fix sanitizes at the boundary — names keep colons in data structures and frontmatter, but paths use hyphens. This matches the source directory convention (`skills/ce-brainstorm/` with frontmatter `name: ce:brainstorm`).

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

Always use `sanitizePathName()` when constructing output paths from skill, agent, or component names. Never pass `skill.name` or `agent.name` directly to `path.join()` in target writers or sync files.

### 3. When building dedupe sets in converters

If a converter reserves names for collision detection, the reserved names must be sanitized to match what the writer will produce on disk. Raw names in the set + normalized names from generators = missed collisions.

### 4. Inconsistency with `resolveCommandPath`

Note that `resolveCommandPath` (used for commands) converts colons to nested directories (`ce:plan` -> `ce/plan.md`), while `sanitizePathName` (used for skills/agents) converts to hyphens (`ce:plan` -> `ce-plan`). This is intentional — commands and skills are different surfaces with different resolution patterns. If a new component type is added, decide which pattern fits and document the choice.
