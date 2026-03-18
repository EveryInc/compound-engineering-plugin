---
title: "feat: Sync Claude MCP servers to all supported providers"
type: feat
date: 2026-03-03
status: completed
deepened: 2026-03-03
---

# feat: Sync Claude MCP servers to all supported providers

## Overview

Expand the `sync` command so a user's local Claude Code MCP configuration can be propagated to every provider this CLI can reasonably support, instead of only the current partial set.

Today, `sync` already symlinks Claude skills and syncs MCP servers for a subset of targets. The gap is that install/convert support has grown much faster than sync support, so the product promise in `README.md` has drifted away from what `src/commands/sync.ts` can actually do.

This feature should close that parity gap without changing the core sync contract:

- Claude remains the source of truth for personal skills and MCP servers.
- Skills stay symlinked, not copied.
- Existing user config in the destination tool is preserved where possible.
- Target-specific MCP formats stay target-specific.

## Problem Statement

The current implementation has three concrete problems:

1. `sync` only knows about `opencode`, `codex`, `pi`, `droid`, `copilot`, and `gemini`, while install/convert now supports `kiro`, `windsurf`, `openclaw`, and `qwen` too.
2. `sync --target all` relies on stale detection metadata that still includes `cursor`, but misses newer supported tools.
3. Existing MCP sync support is incomplete even for some already-supported targets:
   - `codex` only emits stdio servers and silently drops remote MCP servers.
   - `droid` is still skills-only even though Factory now documents `mcp.json`.

User impact:

- A user can install the plugin to more providers than they can sync their personal Claude setup to.
- `sync --target all` does not mean "all supported tools" anymore.
- Users with remote MCP servers in Claude get partial results depending on target.

## Research Summary

### No Relevant Brainstorm

I checked recent brainstorms in `docs/brainstorms/` and found no relevant document for this feature within the last 14 days.

### Internal Findings

- `src/commands/sync.ts:15-125` hardcodes the sync target list, output roots, and per-target dispatch. It omits `windsurf`, `kiro`, `openclaw`, and `qwen`.
- `src/utils/detect-tools.ts:15-22` still detects `cursor`, but not `windsurf`, `kiro`, `openclaw`, or `qwen`.
- `src/parsers/claude-home.ts:11-19` already gives sync exactly the right inputs: personal skills plus `settings.json` `mcpServers`.
- `src/sync/codex.ts:25-91` only serializes stdio MCP servers, even though Codex supports remote MCP config.
- `src/sync/droid.ts:6-21` symlinks skills but ignores MCP entirely.
- Target writers already encode several missing MCP formats and merge behaviors:
  - `src/targets/windsurf.ts:65-92`
  - `src/targets/kiro.ts:68-91`
  - `src/targets/openclaw.ts:34-42`
  - `src/targets/qwen.ts:9-15`
- `README.md:89-123` promises "Sync Personal Config" but only documents the old subset of targets.

### Institutional Learnings

`docs/solutions/adding-converter-target-providers.md:20-32` and `docs/solutions/adding-converter-target-providers.md:208-214` reinforce the right pattern for this feature:

- keep target mappings explicit,
- treat MCP conversion as target-specific,
- warn on unsupported features instead of forcing fake parity,
- and add tests for each mapping.

Note: `docs/solutions/patterns/critical-patterns.md` does not exist in this repository, so there was no critical-patterns file to apply.

### External Findings

Official docs confirm that the missing targets are not all equivalent, so this cannot be solved with a generic JSON pass-through.

| Target | Official MCP / skills location | Key notes |
| --- | --- | --- |
| Factory Droid | `~/.factory/mcp.json`, `.factory/mcp.json`, `~/.factory/skills/` | Supports `stdio` and `http`; user config overrides project config. |
| Windsurf | `~/.codeium/windsurf/mcp_config.json`, `~/.codeium/windsurf/skills/` | Supports `stdio`, Streamable HTTP, and SSE; remote config uses `serverUrl` or `url`. |
| Kiro | `~/.kiro/settings/mcp.json`, `.kiro/settings/mcp.json`, `~/.kiro/skills/` | Supports user and workspace config; remote MCP support was added after this repo's local Kiro spec was written. |
| Qwen Code | `~/.qwen/settings.json`, `.qwen/settings.json`, `~/.qwen/skills/`, `.qwen/skills/` | Supports `stdio`, `http`, and `sse`; official docs say prefer `http`, with `sse` treated as legacy/deprecated. |
| OpenClaw | `~/.openclaw/skills`, `<workspace>/skills`, `~/.openclaw/openclaw.json` | Skills are well-documented; a generic MCP server config surface is not clearly documented in official docs, so MCP sync needs validation before implementation is promised. |

Additional important findings:

- Kiro's current official behavior supersedes the local repo spec that says "workspace only" and "stdio only".
- Qwen's current docs explicitly distinguish `httpUrl` from legacy SSE `url`; blindly copying Claude's `url` is too lossy.
- Factory and Windsurf both support remote MCP, so `droid` should no longer be treated as skills-only.

## Proposed Solution

### Product Decision

Treat this as **sync parity for MCP-capable providers**, not as a one-off patch.

That means this feature should:

- add missing sync targets where the provider has a documented skills/MCP surface,
- upgrade partial implementations where existing sync support drops valid Claude MCP data,
- and replace stale detection metadata so `sync --target all` is truthful again.

### Scope

#### In Scope

- Add MCP sync coverage for:
  - `droid`
  - `windsurf`
  - `kiro`
  - `qwen`
- Expand `codex` sync to support remote MCP servers.
- Add provider detection for newly supported sync targets.
- Keep skills syncing for all synced targets.
- Update CLI help text, README sync docs, and tests.

#### Conditional / Validation Gate

- `openclaw` skills sync is straightforward and should be included if the target is added to `sync`.
- `openclaw` MCP sync should only be implemented if its config surface is validated against current upstream docs or current upstream source. If that validation fails, the feature should explicitly skip OpenClaw MCP sync with a warning rather than inventing a format.

#### Out of Scope

- Standardizing all existing sync targets onto user-level paths only.
- Reworking install/convert output roots.
- Hook sync.
- A full rewrite of target writers.

### Design Decisions

#### 0. Keep existing sync roots stable unless this feature is explicitly adding a new target

Do not use this feature to migrate existing `copilot` and `gemini` sync behavior.

Backward-compatibility rule:

- existing targets keep their current sync roots unless a correctness bug forces a change,
- newly added sync targets use the provider's documented personal/global config surface,
- and any future root migration belongs in a separate plan.

Planned sync roots after this feature:

| Target | Sync root | Notes |
| --- | --- | --- |
| `opencode` | `~/.config/opencode` | unchanged |
| `codex` | `~/.codex` | unchanged |
| `pi` | `~/.pi/agent` | unchanged |
| `droid` | `~/.factory` | unchanged root, new MCP file |
| `copilot` | `.github` | unchanged for backwards compatibility |
| `gemini` | `.gemini` | unchanged for backwards compatibility |
| `windsurf` | `~/.codeium/windsurf` | new |
| `kiro` | `~/.kiro` | new |
| `qwen` | `~/.qwen` | new |
| `openclaw` | `~/.openclaw` | new, MCP still validation-gated |

#### 1. Add a dedicated sync target registry

Do not keep growing `sync.ts` as a hand-maintained switch statement.

Create a dedicated sync registry, for example:

### `src/sync/registry.ts`

```ts
import os from "os"
import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"

export type SyncTargetDefinition = {
  name: string
  detectPaths: (home: string, cwd: string) => string[]
  resolveOutputRoot: (home: string, cwd: string) => string
  sync: (config: ClaudeHomeConfig, outputRoot: string) => Promise<void>
}
```

This registry becomes the single source of truth for:

- valid `sync` targets,
- `sync --target all` detection,
- output root resolution,
- and dispatch.

This avoids the current drift between:

- `src/commands/sync.ts`
- `src/utils/detect-tools.ts`
- `README.md`

#### 2. Preserve sync semantics, not writer semantics

Do not directly reuse install target writers for sync.

Reason:

- writers mostly copy skill directories,
- sync intentionally symlinks skills,
- writers often emit full plugin/install bundles,
- sync only needs personal skills plus MCP config.

However, provider-specific MCP conversion helpers should be extracted or reused where practical so sync and writer logic do not diverge again.

#### 3. Keep merge behavior additive, with Claude winning on same-name collisions

For JSON-based targets:

- preserve unrelated user keys,
- preserve unrelated user MCP servers,
- but if the same server name exists in Claude and the target config, Claude's value should overwrite that server entry during sync.

Codex remains the special case:

- continue using the managed marker block,
- remove the previous managed block,
- rewrite the managed block from Claude,
- leave the rest of `config.toml` untouched.

#### 4. Secure config writes where secrets may exist

Any config file that may contain MCP headers or env vars should be written with restrictive permissions where the platform already supports that pattern.

At minimum:

- `config.toml`
- `mcp.json`
- `mcp_config.json`
- `settings.json`

should follow the repo's existing "secure write" conventions where possible.

#### 5. Do not silently coerce ambiguous remote transports

Qwen and possibly future targets distinguish Streamable HTTP from legacy SSE.

Use this mapping rule:

- if Claude explicitly provides `type: "sse"` or an equivalent known signal, map to the target's SSE field,
- otherwise prefer the target's HTTP form for remote URLs,
- and log a warning when a target requires more specificity than Claude provides.

## Provider Mapping Plan

### Existing Targets to Upgrade

#### Codex

Current issue:

- only stdio servers are synced.

Implementation:

- extend `syncToCodex()` so remote MCP servers are serialized into the Codex TOML format, not dropped.
- keep the existing marker-based idempotent section handling.

Notes:

- This is a correctness fix, not a new target.

#### Droid / Factory

Current issue:

- skills-only sync despite current official MCP support.

Implementation:

- add `src/sync/droid.ts` MCP config writing to `~/.factory/mcp.json`.
- merge with existing `mcpServers`.
- support both `stdio` and `http`.

### New Sync Targets

#### Windsurf

Add `src/sync/windsurf.ts`:

- symlink Claude skills into `~/.codeium/windsurf/skills/`
- merge MCP servers into `~/.codeium/windsurf/mcp_config.json`
- support `stdio`, Streamable HTTP, and SSE
- prefer `serverUrl` for remote HTTP config
- preserve unrelated existing servers
- write with secure permissions

Reference implementation:

- `src/targets/windsurf.ts:65-92`

#### Kiro

Add `src/sync/kiro.ts`:

- symlink Claude skills into `~/.kiro/skills/`
- merge MCP servers into `~/.kiro/settings/mcp.json`
- support both local and remote MCP servers
- preserve user config already present in `mcp.json`

Important:

- This feature must treat the repository's local Kiro spec as stale where it conflicts with official 2025-2026 Kiro docs/blog posts.

Reference implementation:

- `src/targets/kiro.ts:68-91`

#### Qwen

Add `src/sync/qwen.ts`:

- symlink Claude skills into `~/.qwen/skills/`
- merge MCP servers into `~/.qwen/settings.json`
- map stdio directly
- map remote URLs to `httpUrl` by default
- only emit legacy SSE `url` when Claude transport clearly indicates SSE

Important:

- capture the deprecation note in docs/comments: SSE is legacy, so HTTP is the default remote mapping.

#### OpenClaw

Add `src/sync/openclaw.ts` only if validated during implementation:

- symlink skills into `~/.openclaw/skills`
- optionally merge MCP config into `~/.openclaw/openclaw.json` if the official/current upstream contract is confirmed

Fallback behavior if MCP config cannot be validated:

- sync skills only,
- emit a warning that OpenClaw MCP sync is skipped because the official config surface is not documented clearly enough.

## Implementation Phases

### Phase 1: Registry and shared helpers

Files:

- `src/commands/sync.ts`
- `src/utils/detect-tools.ts`
- `src/sync/registry.ts` (new)
- `src/sync/skills.ts` or `src/utils/symlink.ts` extension
- optional `src/sync/mcp-merge.ts`

Tasks:

- move sync target metadata into a single registry
- make `validTargets` derive from the registry
- make `sync --target all` use the registry
- update detection to include supported sync targets instead of stale `cursor`
- extract a shared helper for validated skill symlinking

### Phase 2: Upgrade existing partial targets

Files:

- `src/sync/codex.ts`
- `src/sync/droid.ts`
- `tests/sync-droid.test.ts`
- new or expanded `tests/sync-codex.test.ts`

Tasks:

- add remote MCP support to Codex sync
- add MCP config writing to Droid sync
- preserve current skill symlink behavior

### Phase 3: Add missing sync targets

Files:

- `src/sync/windsurf.ts`
- `src/sync/kiro.ts`
- `src/sync/qwen.ts`
- optionally `src/sync/openclaw.ts`
- `tests/sync-windsurf.test.ts`
- `tests/sync-kiro.test.ts`
- `tests/sync-qwen.test.ts`
- optionally `tests/sync-openclaw.test.ts`

Tasks:

- implement skill symlink + MCP merge for each target
- align output paths with the target's documented personal config surface
- secure writes and corrupted-config fallbacks

### Phase 4: CLI, docs, and detection parity

Files:

- `src/commands/sync.ts`
- `src/utils/detect-tools.ts`
- `tests/detect-tools.test.ts`
- `tests/cli.test.ts`
- `README.md`
- optionally `docs/specs/kiro.md`

Tasks:

- update `sync` help text and summary output
- ensure `sync --target all` only reports real sync-capable tools
- document newly supported sync targets
- fix stale Kiro assumptions if repository docs are updated in the same change

## SpecFlow Analysis

### Primary user flows

#### Flow 1: Explicit sync to one target

1. User runs `bunx @every-env/compound-plugin sync --target <provider>`
2. CLI loads `~/.claude/skills` and `~/.claude/settings.json`
3. CLI resolves that provider's sync root
4. Skills are symlinked
5. MCP config is merged
6. CLI prints the destination path and completion summary

#### Flow 2: Sync to all detected tools

1. User runs `bunx @every-env/compound-plugin sync`
2. CLI detects installed/supported tools
3. CLI prints which tools were found and which were skipped
4. CLI syncs each detected target in sequence
5. CLI prints per-target success lines

#### Flow 3: Existing config already present

1. User already has destination config file(s)
2. Sync reads and parses the existing file
3. Existing unrelated keys are preserved
4. Claude MCP entries are merged in
5. Corrupt config produces a warning and replacement behavior

### Edge cases to account for

- Claude has zero MCP servers: skills still sync, no config file is written.
- Claude has remote MCP servers: targets that support remote config receive them; unsupported transports warn, not crash.
- Existing target config is invalid JSON/TOML: warn and replace the managed portion.
- Skill name contains path traversal characters: skip with warning, same as current behavior.
- Real directory already exists where a symlink would go: skip safely, do not delete user data.
- `sync --target all` detects a tool with skills support but unclear MCP support: sync only the documented subset and warn explicitly.

### Critical product decisions already assumed

- `sync` remains additive and non-destructive.
- Sync roots may differ from install roots when the provider has a documented personal config location.
- OpenClaw MCP support is validation-gated rather than assumed.

## Acceptance Criteria

### Functional Requirements

- [x] `sync --target` accepts `windsurf`, `kiro`, and `qwen`, in addition to the existing targets.
- [x] `sync --target droid` writes MCP servers to Factory's documented `mcp.json` format instead of remaining skills-only.
- [x] `sync --target codex` syncs both stdio and remote MCP servers.
- [x] `sync --target all` detects only sync-capable supported tools and includes the new targets.
- [x] Claude personal skills continue to be symlinked, not copied.
- [x] Existing destination config keys unrelated to MCP are preserved during merge.
- [x] Existing same-named MCP entries are refreshed from Claude for sync-managed targets.
- [x] Unsafe skill names are skipped without deleting user content.
- [x] If OpenClaw MCP sync is not validated, the CLI warns and skips MCP sync for OpenClaw instead of writing an invented format.

### Non-Functional Requirements

- [x] MCP config files that may contain secrets are written with restrictive permissions where supported.
- [x] Corrupt destination config files warn and recover cleanly.
- [x] New sync code does not duplicate target detection metadata in multiple places.
- [x] Remote transport mapping is explicit and tested, especially for Qwen and Codex.

### Quality Gates

- [x] Add target-level sync tests for every new or upgraded provider.
- [x] Update `tests/detect-tools.test.ts` for new detection rules and remove stale cursor expectations.
- [x] Add or expand CLI coverage for `sync --target all`.
- [x] `bun test` passes.

## Testing Plan

### Unit / integration tests

Add or expand:

- `tests/sync-codex.test.ts`
  - remote URL server is emitted
  - existing non-managed TOML content is preserved
- `tests/sync-droid.test.ts`
  - writes `mcp.json`
  - merges with existing file
- `tests/sync-windsurf.test.ts`
  - writes `mcp_config.json`
  - merges existing servers
  - preserves HTTP/SSE fields
- `tests/sync-kiro.test.ts`
  - writes `settings/mcp.json`
  - supports user-scope root
  - preserves remote servers
- `tests/sync-qwen.test.ts`
  - writes `settings.json`
  - maps remote servers to `httpUrl`
  - emits legacy SSE only when explicitly indicated
- `tests/sync-openclaw.test.ts` if implemented
  - skills path
  - MCP behavior or explicit skip warning

### CLI tests

Expand `tests/cli.test.ts` or add focused sync CLI coverage for:

- `sync --target windsurf`
- `sync --target kiro`
- `sync --target qwen`
- `sync --target all` with detected new tool homes
- `sync --target all` no longer surfacing unsupported `cursor`

## Risks and Mitigations

### Risk: local specs are stale relative to current provider docs

Impact:

- implementing from local docs alone would produce incorrect paths and transport support.

Mitigation:

- treat official 2025-2026 docs/blog posts as source of truth where they supersede local specs
- update any obviously stale repo docs touched by this feature

### Risk: transport ambiguity for remote MCP servers

Impact:

- a Claude `url` may map incorrectly for targets that distinguish HTTP vs SSE.

Mitigation:

- prefer HTTP where the target recommends it
- only emit legacy SSE when Claude transport is explicit
- warn when mapping is lossy

### Risk: OpenClaw MCP surface is not sufficiently documented

Impact:

- writing a guessed MCP config could create a broken or misleading feature.

Mitigation:

- validation gate during implementation
- if validation fails, ship OpenClaw skills sync only and document MCP as a follow-up

### Risk: `sync --target all` remains easy to drift out of sync again

Impact:

- future providers get added to install/convert but missed by sync.

Mitigation:

- derive sync valid targets and detection from a shared registry
- add tests that assert detection and sync target lists match expected supported names

## Alternative Approaches Considered

### 1. Just add more cases to `sync.ts`

Rejected:

- this is exactly how the current drift happened.

### 2. Reuse target writers directly

Rejected:

- writers copy directories and emit install bundles;
- sync must symlink skills and only manage personal config subsets.

### 3. Standardize every sync target on user-level output now

Rejected for this feature:

- it would change existing `gemini` and `copilot` behavior and broaden scope into a migration project.

## Documentation Plan

- Update `README.md` sync section to list all supported sync targets and call out any exceptions.
- Update sync examples for `windsurf`, `kiro`, and `qwen`.
- If OpenClaw MCP is skipped, document that explicitly.
- If repository specs are corrected during implementation, update `docs/specs/kiro.md` to match official current behavior.

## Success Metrics

- `sync --target all` covers the same provider surface users reasonably expect from the current CLI, excluding only targets that lack a validated MCP config contract.
- A Claude config with one stdio server and one remote server syncs correctly to every documented MCP-capable provider.
- No user data is deleted during sync.
- Documentation and CLI help no longer over-promise relative to actual behavior.

## AI Pairing Notes

- Treat official provider docs as authoritative over older local notes, especially for Kiro and Qwen transport handling.
- Have a human review any AI-generated MCP mapping code before merge because these config files may contain secrets and lossy transport assumptions are easy to miss.
- When using an implementation agent, keep the work split by target so each provider's config contract can be tested independently.

## References & Research

### Internal References

- `src/commands/sync.ts:15-125`
- `src/utils/detect-tools.ts:11-46`
- `src/parsers/claude-home.ts:11-64`
- `src/sync/codex.ts:7-92`
- `src/sync/droid.ts:6-21`
- `src/targets/windsurf.ts:13-93`
- `src/targets/kiro.ts:5-93`
- `src/targets/openclaw.ts:6-95`
- `src/targets/qwen.ts:5-64`
- `docs/solutions/adding-converter-target-providers.md:20-32`
- `docs/solutions/adding-converter-target-providers.md:208-214`
- `README.md:89-123`

### External References

- Factory MCP docs: https://docs.factory.ai/factory-cli/configuration/mcp
- Factory skills docs: https://docs.factory.ai/cli/configuration/skills
- Windsurf MCP docs: https://docs.windsurf.com/windsurf/cascade/mcp
- Kiro MCP overview: https://kiro.dev/blog/unlock-your-development-productivity-with-kiro-and-mcp/
- Kiro remote MCP support: https://kiro.dev/blog/introducing-remote-mcp/
- Kiro skills announcement: https://kiro.dev/blog/custom-subagents-skills-and-enterprise-controls/
- Qwen settings docs: https://qwenlm.github.io/qwen-code-docs/en/users/configuration/settings/
- Qwen MCP docs: https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/
- Qwen skills docs: https://qwenlm.github.io/qwen-code-docs/zh/users/features/skills/
- OpenClaw setup/config docs: https://docs.openclaw.ai/start/setup
- OpenClaw skills docs: https://docs.openclaw.ai/skills

## Implementation Notes for the Follow-Up `/workflows-work` Step

Suggested implementation order:

1. registry + detection cleanup
2. codex remote MCP + droid MCP
3. windsurf + kiro + qwen sync modules
4. openclaw validation and implementation or explicit warning path
5. docs + tests
