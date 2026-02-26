---
title: Windsurf Global Scope Support
type: feat
status: completed
date: 2026-02-25
deepened: 2026-02-25
prior: docs/plans/2026-02-23-feat-add-windsurf-target-provider-plan.md (removed — superseded)
---

# Windsurf Global Scope Support

## Post-Implementation Revisions (2026-02-26)

After auditing the implementation against `docs/specs/windsurf.md`, two significant changes were made:

1. **Agents → Skills (not Workflows)**: Claude agents map to Windsurf Skills (`skills/{name}/SKILL.md`), not Workflows. Skills are "complex multi-step tasks with supporting resources" — a better conceptual match for specialized expertise/personas. Workflows are "reusable step-by-step procedures" — a better match for Claude Commands (slash commands).

2. **Workflows are flat files**: Command workflows are written to `global_workflows/{name}.md` (global scope) or `workflows/{name}.md` (workspace scope). No subdirectories — the spec requires flat files.

3. **Content transforms updated**: `@agent-name` references are kept as-is (Windsurf skill invocation syntax). `/command` references produce `/{name}` (not `/commands/{name}`). `Task agent(args)` produces `Use the @agent-name skill: args`.

### Final Component Mapping (per spec)

| Claude Code | Windsurf | Output Path | Invocation |
|---|---|---|---|
| Agents (`.md`) | Skills | `skills/{name}/SKILL.md` | `@skill-name` or automatic |
| Commands (`.md`) | Workflows (flat) | `global_workflows/{name}.md` (global) / `workflows/{name}.md` (workspace) | `/{workflow-name}` |
| Skills (`SKILL.md`) | Skills (pass-through) | `skills/{name}/SKILL.md` | `@skill-name` |
| MCP servers | `mcp_config.json` | `mcp_config.json` | N/A |
| Hooks | Skipped with warning | N/A | N/A |
| CLAUDE.md | Skipped | N/A | N/A |

### Files Changed in Revision

- `src/types/windsurf.ts` — `agentWorkflows` → `agentSkills: WindsurfGeneratedSkill[]`
- `src/converters/claude-to-windsurf.ts` — `convertAgentToSkill()`, updated content transforms
- `src/targets/windsurf.ts` — Skills written as `skills/{name}/SKILL.md`, flat workflows
- Tests updated to match

---

## Enhancement Summary

**Deepened on:** 2026-02-25
**Research agents used:** architecture-strategist, kieran-typescript-reviewer, security-sentinel, code-simplicity-reviewer, pattern-recognition-specialist
**External research:** Windsurf MCP docs, Windsurf tutorial docs

### Key Improvements from Deepening
1. **HTTP/SSE servers should be INCLUDED** — Windsurf supports all 3 transport types (stdio, Streamable HTTP, SSE). Original plan incorrectly skipped them.
2. **File permissions: use `0o600`** — `mcp_config.json` contains secrets and must not be world-readable. Add secure write support.
3. **Extract `resolveTargetOutputRoot` to shared utility** — both commands duplicate this; adding scope makes it worse. Extract first.
4. **Bug fix: missing `result[name] = entry`** — all 5 review agents caught a copy-paste bug in the `buildMcpConfig` sample code.
5. **`hasPotentialSecrets` to shared utility** — currently in sync.ts, would be duplicated. Extract to `src/utils/secrets.ts`.
6. **Windsurf `mcp_config.json` is global-only** — per Windsurf docs, no per-project MCP config support. Workspace scope writes it for forward-compatibility but emit a warning.
7. **Windsurf supports `${env:VAR}` interpolation** — consider writing env var references instead of literal values for secrets.

### New Considerations Discovered
- Backup files accumulate with secrets and are never cleaned up — cap at 3 backups
- Workspace `mcp_config.json` could be committed to git — warn about `.gitignore`
- `WindsurfMcpServerEntry` type needs `serverUrl` field for HTTP/SSE servers
- Simplicity reviewer recommends handling scope as windsurf-specific in CLI rather than generic `TargetHandler` fields — but brainstorm explicitly chose "generic with windsurf as first adopter". **Decision: keep generic approach** per user's brainstorm decision, with JSDoc documenting the relationship between `defaultScope` and `supportedScopes`.

---

## Overview

Add a generic `--scope global|workspace` flag to the converter CLI with Windsurf as the first adopter. Global scope writes to `~/.codeium/windsurf/`, making workflows, skills, and MCP servers available across all projects. This also upgrades MCP handling from a human-readable setup doc (`mcp-setup.md`) to a proper machine-readable config (`mcp_config.json`), and removes AGENTS.md generation (the plugin's CLAUDE.md contains development-internal instructions, not user-facing content).

## Problem Statement / Motivation

The current Windsurf converter (v0.10.0) writes everything to project-level `.windsurf/`, requiring re-installation per project. Windsurf supports global paths for skills (`~/.codeium/windsurf/skills/`) and MCP config (`~/.codeium/windsurf/mcp_config.json`). Users should install once and get capabilities everywhere.

Additionally, the v0.10.0 MCP output was a markdown setup guide — not an actual integration. Windsurf reads `mcp_config.json` directly, so we should write to that file.

## Breaking Changes from v0.10.0

This is a **minor version bump** (v0.11.0) with intentional breaking changes to the experimental Windsurf target:

1. **Default output location changed** — `--to windsurf` now defaults to global scope (`~/.codeium/windsurf/`). Use `--scope workspace` for the old behavior.
2. **AGENTS.md no longer generated** — old files are left in place (not deleted).
3. **`mcp-setup.md` replaced by `mcp_config.json`** — proper machine-readable integration. Old files left in place.
4. **Env var secrets included with warning** — previously redacted, now included (required for the config file to work).
5. **`--output` semantics changed** — `--output` now specifies the direct target directory (not a parent where `.windsurf/` is created).

## Proposed Solution

### Phase 0: Extract Shared Utilities (prerequisite)

**Files:** `src/utils/resolve-output.ts` (new), `src/utils/secrets.ts` (new)

#### 0a. Extract `resolveTargetOutputRoot` to shared utility

Both `install.ts` and `convert.ts` have near-identical `resolveTargetOutputRoot` functions that are already diverging (`hasExplicitOutput` exists in install.ts but not convert.ts). Adding scope would make the duplication worse.

- [x] Create `src/utils/resolve-output.ts` with a unified function:

```typescript
import os from "os"
import path from "path"
import type { TargetScope } from "../targets"

export function resolveTargetOutputRoot(options: {
  targetName: string
  outputRoot: string
  codexHome: string
  piHome: string
  hasExplicitOutput: boolean
  scope?: TargetScope
}): string {
  const { targetName, outputRoot, codexHome, piHome, hasExplicitOutput, scope } = options
  if (targetName === "codex") return codexHome
  if (targetName === "pi") return piHome
  if (targetName === "droid") return path.join(os.homedir(), ".factory")
  if (targetName === "cursor") {
    const base = hasExplicitOutput ? outputRoot : process.cwd()
    return path.join(base, ".cursor")
  }
  if (targetName === "gemini") {
    const base = hasExplicitOutput ? outputRoot : process.cwd()
    return path.join(base, ".gemini")
  }
  if (targetName === "copilot") {
    const base = hasExplicitOutput ? outputRoot : process.cwd()
    return path.join(base, ".github")
  }
  if (targetName === "kiro") {
    const base = hasExplicitOutput ? outputRoot : process.cwd()
    return path.join(base, ".kiro")
  }
  if (targetName === "windsurf") {
    if (hasExplicitOutput) return outputRoot
    if (scope === "global") return path.join(os.homedir(), ".codeium", "windsurf")
    return path.join(process.cwd(), ".windsurf")
  }
  return outputRoot
}
```

- [x] Update `install.ts` to import and call `resolveTargetOutputRoot` from shared utility
- [x] Update `convert.ts` to import and call `resolveTargetOutputRoot` from shared utility
- [x] Add `hasExplicitOutput` tracking to `convert.ts` (currently missing)

### Research Insights (Phase 0)

**Architecture review:** Both commands will call the same function with the same signature. This eliminates the divergence and ensures scope resolution has a single source of truth. The `--also` loop in both commands also uses this function with `handler.defaultScope`.

**Pattern review:** This follows the same extraction pattern as `resolveTargetHome` in `src/utils/resolve-home.ts`.

#### 0b. Extract `hasPotentialSecrets` to shared utility

Currently in `sync.ts:20-31`. The same regex pattern also appears in `claude-to-windsurf.ts:223` as `redactEnvValue`. Extract to avoid a third copy.

- [x] Create `src/utils/secrets.ts`:

```typescript
const SENSITIVE_PATTERN = /key|token|secret|password|credential|api_key/i

export function hasPotentialSecrets(
  servers: Record<string, { env?: Record<string, string> }>,
): boolean {
  for (const server of Object.values(servers)) {
    if (server.env) {
      for (const key of Object.keys(server.env)) {
        if (SENSITIVE_PATTERN.test(key)) return true
      }
    }
  }
  return false
}
```

- [x] Update `sync.ts` to import from shared utility
- [x] Use in new windsurf converter

### Phase 1: Types and TargetHandler

**Files:** `src/types/windsurf.ts`, `src/targets/index.ts`

#### 1a. Update WindsurfBundle type

```typescript
// src/types/windsurf.ts
export type WindsurfMcpServerEntry = {
  command?: string
  args?: string[]
  env?: Record<string, string>
  serverUrl?: string
  headers?: Record<string, string>
}

export type WindsurfMcpConfig = {
  mcpServers: Record<string, WindsurfMcpServerEntry>
}

export type WindsurfBundle = {
  agentWorkflows: WindsurfWorkflow[]
  commandWorkflows: WindsurfWorkflow[]
  skillDirs: WindsurfSkillDir[]
  mcpConfig: WindsurfMcpConfig | null
}
```

- [x] Remove `agentsMd: string | null`
- [x] Replace `mcpSetupDoc: string | null` with `mcpConfig: WindsurfMcpConfig | null`
- [x] Add `WindsurfMcpServerEntry` (supports both stdio and HTTP/SSE) and `WindsurfMcpConfig` types

### Research Insights (Phase 1a)

**Windsurf docs confirm** three transport types: stdio (`command` + `args`), Streamable HTTP (`serverUrl`), and SSE (`serverUrl` or `url`). The `WindsurfMcpServerEntry` type must support all three — making `command` optional and adding `serverUrl` and `headers` fields.

**TypeScript reviewer:** Consider making `WindsurfMcpServerEntry` a discriminated union if strict typing is desired. However, since this mirrors JSON config structure, a flat type with optional fields is pragmatically simpler.

#### 1b. Add TargetScope to TargetHandler

```typescript
// src/targets/index.ts
export type TargetScope = "global" | "workspace"

export type TargetHandler<TBundle = unknown> = {
  name: string
  implemented: boolean
  /**
   * Default scope when --scope is not provided.
   * Only meaningful when supportedScopes is defined.
   * Falls back to "workspace" if absent.
   */
  defaultScope?: TargetScope
  /** Valid scope values. If absent, the --scope flag is rejected for this target. */
  supportedScopes?: TargetScope[]
  convert: (plugin: ClaudePlugin, options: ClaudeToOpenCodeOptions) => TBundle | null
  write: (outputRoot: string, bundle: TBundle) => Promise<void>
}
```

- [x] Add `TargetScope` type export
- [x] Add `defaultScope?` and `supportedScopes?` to `TargetHandler` with JSDoc
- [x] Set windsurf target: `defaultScope: "global"`, `supportedScopes: ["global", "workspace"]`
- [x] No changes to other targets (they have no scope fields, flag is ignored)

### Research Insights (Phase 1b)

**Simplicity review:** Argued this is premature generalization (only 1 of 8 targets uses scopes). Recommended handling scope as windsurf-specific with `if (targetName !== "windsurf")` guard instead. **Decision: keep generic approach** per brainstorm decision "Generic with windsurf as first adopter", but add JSDoc documenting the invariant.

**TypeScript review:** Suggested a `ScopeConfig` grouped object to prevent `defaultScope` without `supportedScopes`. The JSDoc approach is simpler and sufficient for now.

**Architecture review:** Adding optional fields to `TargetHandler` follows Open/Closed Principle — existing targets are unaffected. Clean extension.

### Phase 2: Converter Changes

**Files:** `src/converters/claude-to-windsurf.ts`

#### 2a. Remove AGENTS.md generation

- [x] Remove `buildAgentsMd()` function
- [x] Remove `agentsMd` from return value

#### 2b. Replace MCP setup doc with MCP config

- [x] Remove `buildMcpSetupDoc()` function
- [x] Remove `redactEnvValue()` helper
- [x] Add `buildMcpConfig()` that returns `WindsurfMcpConfig | null`
- [x] Include **all** env vars (including secrets) — no redaction
- [x] Use shared `hasPotentialSecrets()` from `src/utils/secrets.ts`
- [x] Include **both** stdio and HTTP/SSE servers (Windsurf supports all transport types)

```typescript
function buildMcpConfig(
  servers?: Record<string, ClaudeMcpServer>,
): WindsurfMcpConfig | null {
  if (!servers || Object.keys(servers).length === 0) return null

  const result: Record<string, WindsurfMcpServerEntry> = {}
  for (const [name, server] of Object.entries(servers)) {
    if (server.command) {
      // stdio transport
      const entry: WindsurfMcpServerEntry = { command: server.command }
      if (server.args?.length) entry.args = server.args
      if (server.env && Object.keys(server.env).length > 0) entry.env = server.env
      result[name] = entry
    } else if (server.url) {
      // HTTP/SSE transport
      const entry: WindsurfMcpServerEntry = { serverUrl: server.url }
      if (server.headers && Object.keys(server.headers).length > 0) entry.headers = server.headers
      if (server.env && Object.keys(server.env).length > 0) entry.env = server.env
      result[name] = entry
    } else {
      console.warn(`Warning: MCP server "${name}" has no command or URL. Skipping.`)
      continue
    }
  }

  if (Object.keys(result).length === 0) return null

  // Warn about secrets (don't redact — they're needed for the config to work)
  if (hasPotentialSecrets(result)) {
    console.warn(
      "Warning: MCP servers contain env vars that may include secrets (API keys, tokens).\n" +
      "   These will be written to mcp_config.json. Review before sharing the config file.",
    )
  }

  return { mcpServers: result }
}
```

### Research Insights (Phase 2)

**Windsurf docs (critical correction):** Windsurf supports **stdio, Streamable HTTP, and SSE** transports in `mcp_config.json`. HTTP/SSE servers use `serverUrl` (not `url`). The original plan incorrectly planned to skip HTTP/SSE servers. This is now corrected — all transport types are included.

**All 5 review agents flagged:** The original code sample was missing `result[name] = entry` — the entry was built but never stored. Fixed above.

**Security review:** The warning message should enumerate which specific env var names triggered detection. Enhanced version:

```typescript
if (hasPotentialSecrets(result)) {
  const flagged = Object.entries(result)
    .filter(([, s]) => s.env && Object.keys(s.env).some(k => SENSITIVE_PATTERN.test(k)))
    .map(([name]) => name)
  console.warn(
    `Warning: MCP servers contain env vars that may include secrets: ${flagged.join(", ")}.\n` +
    "   These will be written to mcp_config.json. Review before sharing the config file.",
  )
}
```

**Windsurf env var interpolation:** Windsurf supports `${env:VARIABLE_NAME}` syntax in `mcp_config.json`. Future enhancement: write env var references instead of literal values for secrets. Out of scope for v0.11.0 (requires more research on which fields support interpolation).

### Phase 3: Writer Changes

**Files:** `src/targets/windsurf.ts`, `src/utils/files.ts`

#### 3a. Simplify writer — remove AGENTS.md and double-nesting guard

The writer always writes directly into `outputRoot`. The CLI resolves the correct output root based on scope.

- [x] Remove AGENTS.md writing block (lines 10-17)
- [x] Remove `resolveWindsurfPaths()` — no longer needed
- [x] Write workflows, skills, and MCP config directly into `outputRoot`

### Research Insights (Phase 3a)

**Pattern review (dissent):** Every other writer (kiro, copilot, gemini, droid) has a `resolve*Paths()` function with a double-nesting guard. Removing it makes Windsurf the only target where the CLI fully owns nesting. This creates an inconsistency in the `write()` contract.

**Resolution:** Accept the divergence — Windsurf has genuinely different semantics (global vs workspace). Add a JSDoc comment on `TargetHandler.write()` documenting that some writers may apply additional nesting while the Windsurf writer expects the final resolved path. Long-term, other targets could migrate to this pattern in a separate refactor.

#### 3b. Replace MCP setup doc with JSON config merge

Follow Kiro pattern (`src/targets/kiro.ts:68-92`) with security hardening:

- [x] Read existing `mcp_config.json` if present
- [x] Backup before overwrite (`backupFile()`)
- [x] Parse existing JSON (warn and replace if corrupted; add `!Array.isArray()` guard)
- [x] Merge at `mcpServers` key: plugin entries overwrite same-name entries, user entries preserved
- [x] Preserve all other top-level keys in existing file
- [x] Write merged result with **restrictive permissions** (`0o600`)
- [x] Emit warning when writing to workspace scope (Windsurf `mcp_config.json` is global-only per docs)

```typescript
// MCP config merge with security hardening
if (bundle.mcpConfig) {
  const mcpPath = path.join(outputRoot, "mcp_config.json")
  const backupPath = await backupFile(mcpPath)
  if (backupPath) {
    console.log(`Backed up existing mcp_config.json to ${backupPath}`)
  }

  let existingConfig: Record<string, unknown> = {}
  if (await pathExists(mcpPath)) {
    try {
      const parsed = await readJson<unknown>(mcpPath)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        existingConfig = parsed as Record<string, unknown>
      }
    } catch {
      console.warn("Warning: existing mcp_config.json could not be parsed and will be replaced.")
    }
  }

  const existingServers =
    existingConfig.mcpServers &&
    typeof existingConfig.mcpServers === "object" &&
    !Array.isArray(existingConfig.mcpServers)
      ? (existingConfig.mcpServers as Record<string, unknown>)
      : {}
  const merged = { ...existingConfig, mcpServers: { ...existingServers, ...bundle.mcpConfig.mcpServers } }
  await writeJsonSecure(mcpPath, merged)  // 0o600 permissions
}
```

### Research Insights (Phase 3b)

**Security review (HIGH):** The current `writeJson()` in `src/utils/files.ts` uses default umask (`0o644`) — world-readable. The sync targets all use `{ mode: 0o600 }` for secret-containing files. The Windsurf writer (and Kiro writer) must do the same.

**Implementation:** Add a `writeJsonSecure()` helper or add a `mode` parameter to `writeJson()`:

```typescript
// src/utils/files.ts
export async function writeJsonSecure(filePath: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data, null, 2)
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, content + "\n", { encoding: "utf8", mode: 0o600 })
}
```

**Security review (MEDIUM):** Backup files inherit default permissions. Ensure `backupFile()` also sets `0o600` on the backup copy when the source may contain secrets.

**Security review (MEDIUM):** Workspace `mcp_config.json` could be committed to git. After writing to workspace scope, emit a warning:

```
Warning: .windsurf/mcp_config.json may contain secrets. Ensure it is in .gitignore.
```

**TypeScript review:** The `readJson<Record<string, unknown>>` assertion is unsafe — a valid JSON array or string passes parsing but fails the type. Added `!Array.isArray()` guard.

**TypeScript review:** The `bundle.mcpConfig` null check is sufficient — when non-null, `mcpServers` is guaranteed to have entries (the converter returns null for empty servers). Simplified from `bundle.mcpConfig && Object.keys(...)`.

**Windsurf docs (important):** `mcp_config.json` is a **global configuration only** — Windsurf has no per-project MCP config support. Writing it to `.windsurf/` in workspace scope may not be discovered by Windsurf. Emit a warning for workspace scope but still write the file for forward-compatibility.

#### 3c. Updated writer structure

```typescript
export async function writeWindsurfBundle(outputRoot: string, bundle: WindsurfBundle): Promise<void> {
  await ensureDir(outputRoot)

  // Write agent workflows
  if (bundle.agentWorkflows.length > 0) {
    const agentDir = path.join(outputRoot, "workflows", "agents")
    await ensureDir(agentDir)
    for (const workflow of bundle.agentWorkflows) {
      validatePathSafe(workflow.name, "agent workflow")
      const content = formatFrontmatter({ description: workflow.description }, `# ${workflow.name}\n\n${workflow.body}`)
      await writeText(path.join(agentDir, `${workflow.name}.md`), content + "\n")
    }
  }

  // Write command workflows
  if (bundle.commandWorkflows.length > 0) {
    const cmdDir = path.join(outputRoot, "workflows", "commands")
    await ensureDir(cmdDir)
    for (const workflow of bundle.commandWorkflows) {
      validatePathSafe(workflow.name, "command workflow")
      const content = formatFrontmatter({ description: workflow.description }, `# ${workflow.name}\n\n${workflow.body}`)
      await writeText(path.join(cmdDir, `${workflow.name}.md`), content + "\n")
    }
  }

  // Copy skill directories
  if (bundle.skillDirs.length > 0) {
    const skillsDir = path.join(outputRoot, "skills")
    await ensureDir(skillsDir)
    for (const skill of bundle.skillDirs) {
      validatePathSafe(skill.name, "skill directory")
      const destDir = path.join(skillsDir, skill.name)
      const resolvedDest = path.resolve(destDir)
      if (!resolvedDest.startsWith(path.resolve(skillsDir))) {
        console.warn(`Warning: Skill name "${skill.name}" escapes skills/. Skipping.`)
        continue
      }
      await copyDir(skill.sourceDir, destDir)
    }
  }

  // Merge MCP config (see 3b above)
  if (bundle.mcpConfig) {
    // ... merge logic from 3b
  }
}
```

### Phase 4: CLI Wiring

**Files:** `src/commands/install.ts`, `src/commands/convert.ts`

#### 4a. Add `--scope` flag to both commands

```typescript
scope: {
  type: "string",
  description: "Scope level: global | workspace (default varies by target)",
},
```

- [x] Add `scope` arg to `install.ts`
- [x] Add `scope` arg to `convert.ts`

#### 4b. Validate scope with type guard

Use a proper type guard instead of unsafe `as TargetScope` cast:

```typescript
function isTargetScope(value: string): value is TargetScope {
  return value === "global" || value === "workspace"
}

const scopeValue = args.scope ? String(args.scope) : undefined
if (scopeValue !== undefined) {
  if (!target.supportedScopes) {
    throw new Error(`Target "${targetName}" does not support the --scope flag.`)
  }
  if (!isTargetScope(scopeValue) || !target.supportedScopes.includes(scopeValue)) {
    throw new Error(`Target "${targetName}" does not support --scope ${scopeValue}. Supported: ${target.supportedScopes.join(", ")}`)
  }
}
const resolvedScope = scopeValue ?? target.defaultScope ?? "workspace"
```

- [x] Add `isTargetScope` type guard
- [x] Add scope validation in both commands (single block, not two separate checks)

### Research Insights (Phase 4b)

**TypeScript review:** The original plan cast `scopeValue as TargetScope` before validation — a type lie. Use a proper type guard function to keep the type system honest.

**Simplicity review:** The two-step validation (check supported, then check exists) can be a single block with the type guard approach above.

#### 4c. Update output root resolution

Both commands now use the shared `resolveTargetOutputRoot` from Phase 0a.

- [x] Call shared function with `scope: resolvedScope` for primary target
- [x] Default scope: `target.defaultScope ?? "workspace"` (only used when target supports scopes)

#### 4d. Handle `--also` targets

`--scope` applies only to the primary `--to` target. Extra `--also` targets use their own `defaultScope`.

- [x] Pass `handler.defaultScope` for `--also` targets (each uses its own default)
- [x] Update the `--also` loop in both commands to use target-specific scope resolution

### Research Insights (Phase 4d)

**Architecture review:** There is no way for users to specify scope for an `--also` target (e.g., `--also windsurf:workspace`). Accept as a known v0.11.0 limitation. If users need workspace scope for windsurf, they can run two separate commands. Add a code comment indicating where per-target scope overrides would be added in the future.

### Phase 5: Tests

**Files:** `tests/windsurf-converter.test.ts`, `tests/windsurf-writer.test.ts`

#### 5a. Update converter tests

- [x] Remove all AGENTS.md tests (lines 275-303: empty plugin, CLAUDE.md missing)
- [x] Remove all `mcpSetupDoc` tests (lines 305-366: stdio, HTTP/SSE, redaction, null)
- [x] Update `fixturePlugin` default — remove `agentsMd` and `mcpSetupDoc` references
- [x] Add `mcpConfig` tests:
  - stdio server produces correct JSON structure with `command`, `args`, `env`
  - HTTP/SSE server produces correct JSON structure with `serverUrl`, `headers`
  - mixed servers (stdio + HTTP) both included
  - env vars included (not redacted) — verify actual values present
  - `hasPotentialSecrets()` emits console.warn for sensitive keys
  - `hasPotentialSecrets()` does NOT warn when no sensitive keys
  - no servers produces null mcpConfig
  - empty bundle has null mcpConfig
  - server with no command and no URL is skipped with warning

#### 5b. Update writer tests

- [x] Remove AGENTS.md tests (backup test, creation test, double-nesting AGENTS.md parent test)
- [x] Remove double-nesting guard test (guard removed)
- [x] Remove `mcp-setup.md` write test
- [x] Update `emptyBundle` fixture — remove `agentsMd`, `mcpSetupDoc`, add `mcpConfig: null`
- [x] Add `mcp_config.json` tests:
  - writes mcp_config.json to outputRoot
  - merges with existing mcp_config.json (preserves user servers)
  - backs up existing mcp_config.json before overwrite
  - handles corrupted existing mcp_config.json (warn and replace)
  - handles existing mcp_config.json with array (not object) at root
  - handles existing mcp_config.json with `mcpServers: null`
  - preserves non-mcpServers keys in existing file
  - server name collision: plugin entry wins
  - file permissions are 0o600 (not world-readable)
- [x] Update full bundle test — writer writes directly into outputRoot (no `.windsurf/` nesting)

#### 5c. Add scope resolution tests

Test the shared `resolveTargetOutputRoot` function:

- [x] Default scope for windsurf is "global" → resolves to `~/.codeium/windsurf/`
- [x] Explicit `--scope workspace` → resolves to `cwd/.windsurf/`
- [x] `--output` overrides scope resolution (both global and workspace)
- [x] Invalid scope value for windsurf → error
- [x] `--scope` on non-scope target (e.g., opencode) → error
- [x] `--also windsurf` uses windsurf's default scope ("global")
- [x] `isTargetScope` type guard correctly identifies valid/invalid values

### Phase 6: Documentation

**Files:** `README.md`, `CHANGELOG.md`

- [x] Update README.md Windsurf section to mention `--scope` flag and global default
- [x] Add CHANGELOG entry for v0.11.0 with breaking changes documented
- [x] Document migration path: `--scope workspace` for old behavior
- [x] Note that Windsurf `mcp_config.json` is global-only (workspace MCP config may not be discovered)

## Acceptance Criteria

- [x] `install compound-engineering --to windsurf` writes to `~/.codeium/windsurf/` by default
- [x] `install compound-engineering --to windsurf --scope workspace` writes to `cwd/.windsurf/`
- [x] `--output /custom/path` overrides scope for both commands
- [x] `--scope` on non-supporting target produces clear error
- [x] `mcp_config.json` merges with existing file (backup created, user entries preserved)
- [x] `mcp_config.json` written with `0o600` permissions (not world-readable)
- [x] No AGENTS.md generated for either scope
- [x] Env var secrets included in `mcp_config.json` with `console.warn` listing affected servers
- [x] Both stdio and HTTP/SSE MCP servers included in `mcp_config.json`
- [x] All existing tests updated, all new tests pass
- [x] No regressions in other targets
- [x] `resolveTargetOutputRoot` extracted to shared utility (no duplication)

## Dependencies & Risks

**Risk: Global workflow path is undocumented.** Windsurf may not discover workflows from `~/.codeium/windsurf/workflows/`. Mitigation: documented as a known assumption in the brainstorm. Users can `--scope workspace` if global workflows aren't discovered.

**Risk: Breaking changes for existing v0.10.0 users.** Mitigation: document migration path clearly. `--scope workspace` restores previous behavior. Target is experimental with a small user base.

**Risk: Workspace `mcp_config.json` not read by Windsurf.** Per Windsurf docs, `mcp_config.json` is global-only configuration. Workspace scope writes the file for forward-compatibility but emits a warning. The primary use case is global scope anyway.

**Risk: Secrets in `mcp_config.json` committed to git.** Mitigation: `0o600` file permissions, console.warn about sensitive env vars, warning about `.gitignore` for workspace scope.

## References & Research

- Spec: `docs/specs/windsurf.md` (authoritative reference for component mapping)
- Kiro MCP merge pattern: [src/targets/kiro.ts:68-92](../../src/targets/kiro.ts)
- Sync secrets warning: [src/commands/sync.ts:20-28](../../src/commands/sync.ts)
- Windsurf MCP docs: https://docs.windsurf.com/windsurf/cascade/mcp
- Windsurf Skills global path: https://docs.windsurf.com/windsurf/cascade/skills
- Windsurf MCP tutorial: https://windsurf.com/university/tutorials/configuring-first-mcp-server
- Adding converter targets (learning): [docs/solutions/adding-converter-target-providers.md](../solutions/adding-converter-target-providers.md)
- Plugin versioning (learning): [docs/solutions/plugin-versioning-requirements.md](../solutions/plugin-versioning-requirements.md)
