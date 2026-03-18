---
title: Auto-detect install targets and add Gemini sync
type: feat
status: completed
date: 2026-02-14
completed_date: 2026-02-14
completed_by: "Claude Opus 4.6"
actual_effort: "Completed in one session"
---

# Auto-detect Install Targets and Add Gemini Sync

## Overview

Two related improvements to the converter CLI:

1. **`install --to all`** — Auto-detect which AI coding tools are installed and convert to all of them in one command
2. **`sync --target gemini`** — Add Gemini CLI as a sync target (currently missing), then add `sync --target all` to sync personal config to every detected tool

## Problem Statement

Users currently must run 6 separate commands to install to all targets:

```bash
bunx @every-env/compound-plugin install compound-engineering --to opencode
bunx @every-env/compound-plugin install compound-engineering --to codex
bunx @every-env/compound-plugin install compound-engineering --to droid
bunx @every-env/compound-plugin install compound-engineering --to cursor
bunx @every-env/compound-plugin install compound-engineering --to pi
bunx @every-env/compound-plugin install compound-engineering --to gemini
```

Similarly, sync requires separate commands per target. And Gemini sync doesn't exist yet.

## Acceptance Criteria

### Auto-detect install

- [x]`install --to all` detects installed tools and installs to each
- [x]Detection checks config directories and/or binaries for each tool
- [x]Prints which tools were detected and which were skipped
- [x]Tools with no detection signal are skipped (not errored)
- [x]`convert --to all` also works (same detection logic)
- [x]Existing `--to <target>` behavior unchanged
- [x]Tests for detection logic and `all` target handling

### Gemini sync

- [x]`sync --target gemini` symlinks skills and writes MCP servers to `.gemini/settings.json`
- [x]MCP servers merged into existing `settings.json` (same pattern as writer)
- [x]`gemini` added to `validTargets` in `sync.ts`
- [x]Tests for Gemini sync

### Sync all

- [x]`sync --target all` syncs to all detected tools
- [x]Reuses same detection logic as install
- [x]Prints summary of what was synced where

## Implementation

### Phase 1: Tool Detection Utility

**Create `src/utils/detect-tools.ts`**

```typescript
import os from "os"
import path from "path"
import { pathExists } from "./files"

export type DetectedTool = {
  name: string
  detected: boolean
  reason: string // e.g. "found ~/.codex/" or "not found"
}

export async function detectInstalledTools(): Promise<DetectedTool[]> {
  const home = os.homedir()
  const cwd = process.cwd()

  const checks: Array<{ name: string; paths: string[] }> = [
    { name: "opencode", paths: [path.join(home, ".config", "opencode"), path.join(cwd, ".opencode")] },
    { name: "codex", paths: [path.join(home, ".codex")] },
    { name: "droid", paths: [path.join(home, ".factory")] },
    { name: "cursor", paths: [path.join(cwd, ".cursor"), path.join(home, ".cursor")] },
    { name: "pi", paths: [path.join(home, ".pi")] },
    { name: "gemini", paths: [path.join(cwd, ".gemini"), path.join(home, ".gemini")] },
  ]

  const results: DetectedTool[] = []
  for (const check of checks) {
    let detected = false
    let reason = "not found"
    for (const p of check.paths) {
      if (await pathExists(p)) {
        detected = true
        reason = `found ${p}`
        break
      }
    }
    results.push({ name: check.name, detected, reason })
  }
  return results
}

export async function getDetectedTargetNames(): Promise<string[]> {
  const tools = await detectInstalledTools()
  return tools.filter((t) => t.detected).map((t) => t.name)
}
```

**Detection heuristics:**

| Tool | Check paths | Notes |
|------|------------|-------|
| OpenCode | `~/.config/opencode/`, `.opencode/` | XDG config or project-local |
| Codex | `~/.codex/` | Global only |
| Droid | `~/.factory/` | Global only |
| Cursor | `.cursor/`, `~/.cursor/` | Project-local or global |
| Pi | `~/.pi/` | Global only |
| Gemini | `.gemini/`, `~/.gemini/` | Project-local or global |

### Phase 2: Gemini Sync

**Create `src/sync/gemini.ts`**

Follow the Cursor sync pattern (`src/sync/cursor.ts`) since both use JSON config with `mcpServers` key:

```typescript
import path from "path"
import { symlinkSkills } from "../utils/symlink"
import { backupFile, pathExists, readJson, writeJson } from "../utils/files"
import type { ClaudeMcpServer } from "../types/claude"

export async function syncToGemini(
  skills: { name: string; sourceDir: string }[],
  mcpServers: Record<string, ClaudeMcpServer>,
  outputRoot: string,
): Promise<void> {
  const geminiDir = path.join(outputRoot, ".gemini")

  // Symlink skills
  if (skills.length > 0) {
    const skillsDir = path.join(geminiDir, "skills")
    await symlinkSkills(skills, skillsDir)
  }

  // Merge MCP servers into settings.json
  if (Object.keys(mcpServers).length > 0) {
    const settingsPath = path.join(geminiDir, "settings.json")
    let existing: Record<string, unknown> = {}
    if (await pathExists(settingsPath)) {
      await backupFile(settingsPath)
      try {
        existing = await readJson<Record<string, unknown>>(settingsPath)
      } catch {
        console.warn("Warning: existing settings.json could not be parsed and will be replaced.")
      }
    }

    const existingMcp = (existing.mcpServers && typeof existing.mcpServers === "object")
      ? existing.mcpServers as Record<string, unknown>
      : {}

    const merged = { ...existing, mcpServers: { ...existingMcp, ...convertMcpServers(mcpServers) } }
    await writeJson(settingsPath, merged)
  }
}

function convertMcpServers(servers: Record<string, ClaudeMcpServer>) {
  const result: Record<string, Record<string, unknown>> = {}
  for (const [name, server] of Object.entries(servers)) {
    const entry: Record<string, unknown> = {}
    if (server.command) {
      entry.command = server.command
      if (server.args?.length) entry.args = server.args
      if (server.env && Object.keys(server.env).length > 0) entry.env = server.env
    } else if (server.url) {
      entry.url = server.url
      if (server.headers && Object.keys(server.headers).length > 0) entry.headers = server.headers
    }
    result[name] = entry
  }
  return result
}
```

**Update `src/commands/sync.ts`:**

- Add `"gemini"` to `validTargets` array
- Import `syncToGemini` from `../sync/gemini`
- Add case in switch for `"gemini"` calling `syncToGemini(skills, mcpServers, outputRoot)`

### Phase 3: Wire `--to all` into Install and Convert

**Modify `src/commands/install.ts`:**

```typescript
import { detectInstalledTools } from "../utils/detect-tools"

// In args definition, update --to description:
to: {
  type: "string",
  default: "opencode",
  description: "Target format (opencode | codex | droid | cursor | pi | gemini | all)",
},

// In run(), before the existing target lookup:
if (targetName === "all") {
  const detected = await detectInstalledTools()
  const activeTargets = detected.filter((t) => t.detected)

  if (activeTargets.length === 0) {
    console.log("No AI coding tools detected. Install at least one tool first.")
    return
  }

  console.log(`Detected ${activeTargets.length} tools:`)
  for (const tool of detected) {
    console.log(`  ${tool.detected ? "✓" : "✗"} ${tool.name} — ${tool.reason}`)
  }

  // Install to each detected target
  for (const tool of activeTargets) {
    const handler = targets[tool.name]
    const bundle = handler.convert(plugin, options)
    if (!bundle) continue
    const root = resolveTargetOutputRoot(tool.name, outputRoot, codexHome, piHome, hasExplicitOutput)
    await handler.write(root, bundle)
    console.log(`Installed ${plugin.manifest.name} to ${tool.name} at ${root}`)
  }

  // Codex post-processing
  if (activeTargets.some((t) => t.name === "codex")) {
    await ensureCodexAgentsFile(codexHome)
  }
  return
}
```

**Same change in `src/commands/convert.ts`** with its version of `resolveTargetOutputRoot`.

### Phase 4: Wire `--target all` into Sync

**Modify `src/commands/sync.ts`:**

```typescript
import { detectInstalledTools } from "../utils/detect-tools"

// Update validTargets:
const validTargets = ["opencode", "codex", "pi", "droid", "cursor", "gemini", "all"] as const

// In run(), handle "all":
if (targetName === "all") {
  const detected = await detectInstalledTools()
  const activeTargets = detected.filter((t) => t.detected).map((t) => t.name)

  if (activeTargets.length === 0) {
    console.log("No AI coding tools detected.")
    return
  }

  console.log(`Syncing to ${activeTargets.length} detected tools...`)
  for (const name of activeTargets) {
    // call existing sync logic for each target
  }
  return
}
```

### Phase 5: Tests

**Create `tests/detect-tools.test.ts`**

- Test detection with mocked directories (create temp dirs, check detection)
- Test `getDetectedTargetNames` returns only detected tools
- Test empty detection returns empty array

**Create `tests/gemini-sync.test.ts`**

Follow `tests/sync-cursor.test.ts` pattern:

- Test skills are symlinked to `.gemini/skills/`
- Test MCP servers merged into `settings.json`
- Test existing `settings.json` is backed up
- Test empty skills/servers produce no output

**Update `tests/cli.test.ts`**

- Test `--to all` flag is accepted
- Test `sync --target all` is accepted
- Test `sync --target gemini` is accepted

### Phase 6: Documentation

**Update `README.md`:**

Add to install section:
```bash
# auto-detect installed tools and install to all
bunx @every-env/compound-plugin install compound-engineering --to all
```

Add to sync section:
```bash
# Sync to Gemini
bunx @every-env/compound-plugin sync --target gemini

# Sync to all detected tools
bunx @every-env/compound-plugin sync --target all
```

## What We're NOT Doing

- Not adding binary detection (`which cursor`, `which gemini`) — directory checks are sufficient and don't require shell execution
- Not adding interactive prompts ("Install to Cursor? y/n") — auto-detect is fire-and-forget
- Not adding `--exclude` flag for skipping specific targets — can use `--to X --also Y` for manual selection
- Not adding Gemini to the `sync` symlink watcher (no watcher exists for any target)

## Complexity Assessment

**Low-medium change.** All patterns are established:
- Detection utility is new but simple (pathExists checks)
- Gemini sync follows cursor sync pattern exactly
- `--to all` is plumbing — iterate detected tools through existing handlers
- No new dependencies needed

## References

- Cursor sync (reference pattern): `src/sync/cursor.ts`
- Gemini writer (merge pattern): `src/targets/gemini.ts`
- Install command: `src/commands/install.ts`
- Sync command: `src/commands/sync.ts`
- File utilities: `src/utils/files.ts`
- Symlink utilities: `src/utils/symlink.ts`

## Completion Summary

### What Was Delivered
- Tool detection utility (`src/utils/detect-tools.ts`) with `detectInstalledTools()` and `getDetectedTargetNames()`
- Gemini sync (`src/sync/gemini.ts`) following cursor sync pattern — symlinks skills, merges MCP servers into `settings.json`
- `install --to all` and `convert --to all` auto-detect and install to all detected tools
- `sync --target gemini` added to sync command
- `sync --target all` syncs to all detected tools with summary output
- 8 new tests across 2 test files (detect-tools + sync-gemini)

### Implementation Statistics
- 4 new files, 3 modified files
- 139 tests passing (8 new + 131 existing)
- No new dependencies

### Git Commits
- `e4d730d` feat: add detect-tools utility and Gemini sync with tests
- `bc655f7` feat: wire --to all into install/convert and --target all/gemini into sync
- `877e265` docs: add auto-detect and Gemini sync to README, bump to 0.8.0

### Completion Details
- **Completed By:** Claude Opus 4.6
- **Date:** 2026-02-14
- **Session:** Single session, TDD approach
