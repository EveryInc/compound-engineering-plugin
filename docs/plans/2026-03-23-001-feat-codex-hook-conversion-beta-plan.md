---
title: "feat: Add Codex hook conversion support"
type: feat
status: completed
date: 2026-03-23
origin: docs/solutions/integration-issues/codex-hook-converter-gap.md
deepened: 2026-03-23
---

# feat: Add Codex hook conversion support

## Enhancement Summary

**Deepened on:** 2026-03-23
**Reviewers used:** kieran-typescript-reviewer, architecture-strategist, pattern-recognition-specialist, code-simplicity-reviewer, adding-converter-target-providers learnings, Codex hooks.json path verification

### Key Improvements from Deepening
1. Use `CodexHookEventName` string literal union for compile-time safety against invalid events (prevents `deny_unknown_fields` rejections)
2. Merge two event sets into a single `CODEX_EVENTS` map with `toolScoped` flag (eliminates sync obligation)
3. Use options object for `renderCodexConfig()` instead of accumulating boolean params
4. Extract `isBashCompatibleMatcher()` as a named, testable function
5. Feature gate must be written outside the sync path's managed block to survive `syncToCodex` overwrites
6. Collapse 5 per-event tests to 2 (tool-scoped + non-tool-scoped) -- tests logic, not data
7. Confirmed `.codex/hooks.json` is correct via Codex source analysis (`codex-rs/hooks/src/engine/discovery.rs`)
8. Resolved `timeout` field naming: Codex uses `timeout` (number, seconds) -- not `timeoutSec`

### New Considerations Discovered
- Hook command strings should NOT have `transformContentForCodex()` applied -- they are shell commands, not markdown with agent references
- Feature gate `[features]` section in config.toml must be placed outside sync managed block markers to avoid being clobbered
- Mixed matchers like `"Bash|Write"` need an explicit decision (skip + warn)
- Add one integration test using the full sample-plugin fixture for end-to-end coverage

## Overview

The Codex converter silently drops all hooks during Claude-to-Codex conversion -- the only converter that doesn't even warn. Codex has been incrementally shipping hook support (PreToolUse, PostToolUse, UserPromptSubmit, SessionStart, Stop), creating a growing conversion gap. This plan adds partial hook conversion for the 5 compatible events and specific warnings for everything else.

## Problem Frame

When a Claude plugin with hooks is converted to Codex, all hooks vanish silently. The `CodexBundle` type has no `hooks` field. Users get no indication that workflow-critical or security-critical hooks were dropped. Every other converter (Windsurf, Kiro, Copilot, Gemini) at minimum emits `console.warn`.

See origin: `docs/solutions/integration-issues/codex-hook-converter-gap.md` for the full gap analysis including upstream PR links and compatibility matrix.

## Requirements Trace

- R1. Convert PreToolUse (Bash-matched, command type) hooks to Codex format
- R2. Convert PostToolUse (Bash-matched, command type) hooks to Codex format (depends on [openai/codex#15531](https://github.com/openai/codex/pull/15531))
- R3. Convert UserPromptSubmit (command type) hooks to Codex format
- R4. Convert SessionStart (command type) hooks to Codex format
- R5. Convert Stop (command type) hooks to Codex format
- R6. Emit specific warnings for every unconvertible hook (non-Bash matchers, prompt/agent types, unsupported events)
- R7. Write `.codex/hooks.json` when convertible hooks exist
- R8. Enable the `codex_hooks` feature gate in `config.toml` when hooks are present
- R9. Preserve existing converter behavior when no hooks are present
- R10. Update Codex spec to document hook support

## Scope Boundaries

- Sync path (`src/sync/codex.ts`) is out of scope -- needs `ClaudeHomeConfig` to expose hooks first (see origin)
- Non-command hook types (`prompt`, `agent`) cannot be converted -- Codex only supports `command`
- Cross-converter completeness testing is a valuable follow-up but not in this PR
- No `transformContentForCodex()` on hook command strings -- they are shell commands, not markdown content with agent references or slash-command references

## Context & Research

### Relevant Code and Patterns

- **Reference implementation**: `src/converters/claude-to-opencode.ts` -- the only converter that maps hooks today. Uses a `HOOK_EVENT_MAP` table (line 48) and a `convertHooks()` function (line 157) that iterates events, filters by support, and renders output
- **Codex converter**: `src/converters/claude-to-codex.ts` -- `convertClaudeToCodex()` processes agents, commands, skills but has zero hook handling
- **Codex types**: `src/types/codex.ts` -- `CodexBundle` has no `hooks` field
- **Claude hook types**: `src/types/claude.ts` lines 66-91 -- `ClaudeHooks`, `ClaudeHookMatcher`, `ClaudeHookEntry` (union of Command | Prompt | Agent)
- **Codex writer**: `src/targets/codex.ts` -- `writeCodexBundle()` writes prompts, skills, generated skills, config.toml. `renderCodexConfig()` only handles MCP servers. Exported and also called from `src/sync/codex.ts:23`
- **Warning pattern**: Windsurf/Kiro/Copilot converters use `if (plugin.hooks && Object.keys(plugin.hooks.hooks).length > 0) { console.warn(...) }` with "Warning: " prefix convention
- **Warning test pattern**: 4 of 5 converter test files use manual `console.warn` replacement (not `spyOn`): `const originalWarn = console.warn; console.warn = (msg) => warnings.push(msg)` with cleanup
- **Test fixtures**: `tests/fixtures/sample-plugin/hooks/hooks.json` -- all 13 Claude hook events with all three hook types
- **Codex converter tests**: `tests/codex-converter.test.ts` -- uses inline `ClaudePlugin` fixtures with `hooks: undefined`
- **Codex writer tests**: `tests/codex-writer.test.ts` -- uses `fs.mkdtemp` for temp dirs, `backupFile` pattern for config.toml
- **Sync path managed blocks**: `src/sync/codex.ts` uses `# BEGIN/END compound-plugin Claude Code MCP` markers to merge MCP config idempotently

### Institutional Learnings

- `docs/solutions/adding-converter-target-providers.md`: Phase 5 documents the "warn on unsupported features" pattern. The Codex converter never implemented it. Five converters (Codex, Droid, Pi, OpenClaw, Qwen) silently drop hooks.
- `docs/solutions/codex-skill-prompt-entrypoints.md`: Codex skill names come from directory basenames. Content rewriting must be selective -- do not rewrite arbitrary slash-shaped text. This reinforces the decision to NOT apply `transformContentForCodex` to hook command strings.

### Upstream References

- PreToolUse: [openai/codex#15211](https://github.com/openai/codex/pull/15211) (merged) -- shell-only, deny-only, tool name hardcoded to "Bash", matchers are regex
- PostToolUse: [openai/codex#15531](https://github.com/openai/codex/pull/15531) (draft, active) -- shell-only, block + additionalContext, `updatedMCPToolOutput` rejected
- UserPromptSubmit: [openai/codex#14626](https://github.com/openai/codex/pull/14626) (merged) -- no matcher support, blocked prompts never enter history, context injected as developer messages
- SessionStart: exists on Codex main -- `SessionStartSource` enum (Startup/Resume), `additional_contexts`, `should_stop`/`stop_reason`
- Stop: exists on Codex main

### Verified: hooks.json Discovery Path

Confirmed by reading `codex-rs/hooks/src/engine/discovery.rs`: Codex walks the `ConfigLayerStack` and joins `"hooks.json"` to each layer's `config_folder()`. For project layers, `config_folder()` returns the `.codex/` folder. So the correct output path is `.codex/hooks.json`.

Codex also loads from `~/.codex/hooks.json` (user-level) and `/etc/codex/hooks.json` (system-level), but the converter should write project-level hooks only.

## Key Technical Decisions

- **hooks.json location**: `.codex/hooks.json` parallel to `config.toml` -- confirmed correct via `codex-rs/hooks/src/engine/discovery.rs`
- **Feature gate**: Auto-write `[features] codex_hooks = true` to `config.toml` when hooks are present -- without it, hooks are silently ignored at runtime. Must be written outside the sync path's managed block markers so `syncToCodex` does not clobber it.
- **PostToolUse**: Include conversion logic now, hold the PR until upstream #15531 merges -- avoids a second implementation pass. Add a TODO comment in the converter linking to the upstream PR.
- **Wildcard matchers on tool-scoped events**: Convert them -- on Codex, PreToolUse/PostToolUse only fire for Bash anyway, so `*` effectively means the same thing
- **Mixed matchers (e.g. `Bash|Write`)**: Skip with warning -- the matcher includes non-Bash tools that Codex cannot handle. Do not try to extract the Bash-compatible portion.
- **`${CLAUDE_PLUGIN_ROOT}` in commands**: Warn but do not rewrite -- Codex may have a different root convention
- **No content transformation on hook commands**: Do not apply `transformContentForCodex()` -- hook commands are shell commands, not markdown with agent references
- **Backup on re-conversion**: Yes for hooks.json, matching the existing config.toml pattern via `backupFile`
- **Timeout field**: Use `timeout` (not `timeoutSec`) -- confirmed as the primary field name in Codex's `HookHandlerConfig` struct. Value is in seconds.
- **Type-safe event names**: Use a `CodexHookEventName` string literal union to prevent invalid events at compile time

## Open Questions

### Resolved During Planning

- **Where does hooks.json go?**: `.codex/hooks.json` -- confirmed via Codex source code in `codex-rs/hooks/src/engine/discovery.rs`
- **Should config.toml always be written when hooks exist?**: Yes -- even without MCP servers, `[features] codex_hooks = true` is needed
- **How to handle PostToolUse before upstream merges?**: Include the code, hold the PR. The schema is documented in the draft PR and unlikely to change significantly.
- **`timeout` vs `timeoutSec`?**: Use `timeout`. Codex's `HookHandlerConfig` uses `timeout` as the primary field, with `timeoutSec` as an alias.
- **Apply `transformContentForCodex` to hook commands?**: No. Hook commands are shell commands (e.g., `python3 /path/to/hook.py`), not markdown content with slash-command references.
- **How to handle `Bash|Write` mixed matchers?**: Skip with warning. The matcher includes non-Bash tools that Codex cannot fire hooks for.

### Deferred to Implementation

- **Exact Codex hooks.json field validation**: The `deny_unknown_fields` constraint requires precise field names. Implementation should validate against the generated JSON schemas from `codex-rs/hooks/schema/generated/`. If fields are rejected at runtime, adjust.
- **statusMessage field**: Codex hook configs support an optional `statusMessage`. Claude hooks don't have this field. Implementation may choose to omit it or add it as a future enhancement.

## Implementation Units

- [x] **Unit 1: Add Codex hook types to `CodexBundle`**

  **Goal:** Define the Codex-specific hook types and extend `CodexBundle` so the converter has a target to write to.

  **Requirements:** Foundation for R1-R5, R7

  **Dependencies:** None

  **Files:**
  - Modify: `src/types/codex.ts`

  **Approach:**
  - Add a `CodexHookEventName` string literal union of the 5 supported events (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `Stop`). This provides compile-time protection against writing an unsupported event to hooks.json -- critical given Codex's `deny_unknown_fields`.
  - Add `CodexHookCommand` type with fields `type` (literal `"command"`), `command` (string), `timeout` (optional number) -- matching Codex's wire format
  - Add `CodexHookMatcher` type with optional `matcher` string and `hooks` array of `CodexHookCommand`
  - Add `CodexHooks` type wrapping `Partial<Record<CodexHookEventName, CodexHookMatcher[]>>`
  - Add optional `hooks` field to `CodexBundle`
  - Keep types minimal -- no extra fields beyond what Codex's schema accepts

  **Patterns to follow:**
  - `ClaudeHookCommand`, `ClaudeHookMatcher`, `ClaudeHooks` in `src/types/claude.ts` -- structurally similar but Codex types restrict to `command` type only and use a closed event name union instead of open `Record<string, ...>`

  **Verification:**
  - TypeScript compiles. Existing tests still pass (no behavioral change yet).

- [x] **Unit 2: Add hook conversion logic to the Codex converter**

  **Goal:** Convert compatible hooks from Claude format to Codex format, emitting warnings for everything unconvertible.

  **Requirements:** R1-R6, R9

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `src/converters/claude-to-codex.ts`
  - Test: `tests/codex-converter.test.ts`

  **Approach:**
  - Define a single `CODEX_EVENTS` map combining supported events with their `toolScoped` flag:
    ```
    PreToolUse: toolScoped true, PostToolUse: toolScoped true,
    UserPromptSubmit: toolScoped false, SessionStart: toolScoped false, Stop: toolScoped false
    ```
    This replaces two separate sets and eliminates the sync obligation between them.
  - Extract an `isBashCompatibleMatcher(matcher: string | undefined): boolean` function that returns true for `undefined`, `"*"`, `""`, `"Bash"`, `"^Bash$"` and false for everything else (including mixed matchers like `"Bash|Write"`). This is a named, testable function.
  - Add a `convertHooksForCodex(hooks: ClaudeHooks): CodexHooks | undefined` function (receives `plugin.hooks` — the outer wrapper whose `.hooks` property is the `Record<string, ClaudeHookMatcher[]>` map) that:
    - Iterates `hooks.hooks` entries (the inner `.hooks` record keyed by event name)
    - Skips events not in `CODEX_EVENTS` with a specific warning naming the event
    - For tool-scoped events, checks matcher via `isBashCompatibleMatcher()` -- skips non-Bash matchers with warning
    - Filters each matcher's hook entries to `command` type only -- warns about skipped `prompt`/`agent` entries
    - Emits a one-time warning about PreToolUse deny-only semantics when PreToolUse hooks are converted
    - Scans converted command strings for `${CLAUDE_PLUGIN_ROOT}` and warns if found
    - Returns `CodexHooks` or `undefined` if no convertible hooks remain
  - Keep `convertHooksForCodex` as a non-exported (private) function, consistent with all other helpers in the Codex converter
  - Wire into `convertClaudeToCodex()`: `const hooks = plugin.hooks ? convertHooksForCodex(plugin.hooks) : undefined`
  - Add `hooks` to the returned bundle
  - Add a TODO comment on the PostToolUse entry in `CODEX_EVENTS` linking to upstream PR #15531

  **Patterns to follow:**
  - OpenCode's `HOOK_EVENT_MAP` table pattern at `src/converters/claude-to-opencode.ts` -- but simpler since Codex output is JSON not TypeScript, so we just filter and reshape rather than generating code
  - Warning pattern from `src/converters/claude-to-windsurf.ts` -- use "Warning: " prefix convention
  - Warning tests: use the dominant manual `console.warn` replacement pattern (not `spyOn`)

  **Test scenarios:**
  - Converts a tool-scoped event (PreToolUse) with Bash matcher and command type -> present in bundle.hooks with correct structure
  - Converts a non-tool-scoped event (UserPromptSubmit) with command type -> present in bundle.hooks
  - Converts a full plugin with all 5 supported events -> all present in bundle.hooks (integration-level test)
  - Skips non-Bash matcher on tool-scoped event (`Write|Edit`) -> warning emitted, not in bundle
  - Skips mixed matcher (`Bash|Write`) -> warning emitted, not in bundle
  - Skips `prompt` and `agent` type hooks -> warning emitted, only command hooks pass through
  - Skips unsupported events (one test covering PostToolUseFailure, PermissionRequest, etc.) -> warnings emitted
  - Plugin with no hooks -> hooks undefined, no warnings
  - Plugin where all hooks are unconvertible -> hooks undefined, warnings emitted
  - Preserves timeout field when present
  - Wildcard matcher (`*`) on PreToolUse is converted (not skipped)
  - `isBashCompatibleMatcher` unit tests: undefined, `*`, `""`, `Bash`, `^Bash$` return true; `Write|Edit`, `Bash|Write`, `Read` return false

  **Verification:**
  - All new converter tests pass. All existing converter tests still pass. Run `bun test`.

- [x] **Unit 3: Write hooks.json and feature gate in Codex writer**

  **Goal:** Output the converted hooks as `.codex/hooks.json` and enable the feature gate in `config.toml`.

  **Requirements:** R7, R8, R9

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `src/targets/codex.ts`
  - Test: `tests/codex-writer.test.ts`

  **Approach:**
  - In `writeCodexBundle()`, after writing skills/prompts, check if `bundle.hooks` has entries
    - If so, write `.codex/hooks.json` with `JSON.stringify(bundle.hooks, null, 2)` -- use `backupFile` before overwriting
  - Refactor `renderCodexConfig()` to accept an options object instead of positional params:
    ```
    type CodexConfigOptions = { mcpServers?: Record<string, ClaudeMcpServer>; hasHooks?: boolean }
    ```
    This prevents accumulating boolean params as more config sections are added. The function is exported and called from two places: `writeCodexBundle` (in `src/targets/codex.ts`) and `syncToCodex` (in `src/sync/codex.ts:23`, which passes only `mcpServers`). Add defaults for all options so the sync call site needs no changes.
  - When `hasHooks` is true, emit `[features]\ncodex_hooks = true\n` at the top of the config output, before any MCP server sections. This ordering ensures the feature gate sits outside the sync path's managed block markers (`# BEGIN/END compound-plugin`), which wrap only MCP content.
  - Ensure `config.toml` is written when hooks are present even if no MCP servers exist (currently `renderCodexConfig` returns `null` when no MCP servers)

  **Patterns to follow:**
  - Existing `backupFile` + `writeText` pattern for `config.toml` in `src/targets/codex.ts`
  - `resolveCodexRoot()` helper already handles `.codex` path resolution

  **Test scenarios:**
  - Writes `.codex/hooks.json` when hooks present in bundle -- verify file exists and content is valid JSON matching the bundle
  - Does not write hooks.json when hooks are undefined or empty
  - Backs up existing hooks.json before overwriting
  - Writes `[features] codex_hooks = true` in config.toml when hooks present
  - Writes config.toml with feature flag even without MCP servers
  - Config.toml with both MCP servers and feature flag includes both sections

  **Verification:**
  - All new writer tests pass. Existing writer tests still pass (no behavioral change for hooks-free bundles). Run `bun test`.

- [x] **Unit 4: Update Codex spec documentation and validate**

  **Goal:** Document the new hook support in the Codex target spec so the converter's behavior is discoverable. Run release validation.

  **Requirements:** R10

  **Dependencies:** Units 1-3 (should reflect final implementation)

  **Files:**
  - Modify: `docs/specs/codex.md`

  **Approach:**
  - Add a `## Hooks` section documenting:
    - Supported events and their capabilities/limitations
    - `hooks.json` format and location (`.codex/hooks.json`)
    - Feature gate requirement (`codex_hooks = true`)
    - Limitations vs Claude Code (deny-only PreToolUse, no matchers for UserPromptSubmit, shell-only tool hooks, command type only)
    - Links to upstream Codex PRs for reference
  - Update the `Last verified` date

  **Verification:**
  - Spec accurately reflects the implemented behavior.
  - Run `bun run release:validate` to confirm no release-owned metadata was inadvertently changed.

## System-Wide Impact

- **Interaction graph:** The change touches the convert/install CLI path: `convertClaudeToCodex()` -> `writeCodexBundle()`. No callbacks, middleware, or observers. The sync path (`syncToCodex`) is unaffected and out of scope -- but the `renderCodexConfig` signature change must be backward-compatible (options object with defaults) since `syncToCodex` calls it.
- **Error propagation:** Hook conversion warnings go to `console.warn` (stderr). A malformed hook should not fail the entire conversion -- skip and warn. The writer should propagate I/O errors normally (same as config.toml writes).
- **State lifecycle risks:** The `[features]` section in config.toml must be written outside the sync path's managed block markers (`# BEGIN/END compound-plugin`). If written inside, a subsequent `syncToCodex` run would clobber it, silently disabling hooks. The writer owns this section independently of the managed MCP block.
- **API surface parity:** After this change, Codex joins OpenCode as a converter with hook support. All other converters remain warn-and-skip. The `release:validate` script should still pass since we are adding a field, not changing existing output.
- **Integration coverage:** The full convert-then-verify flow (load plugin with hooks -> convert to Codex -> assert hooks.json written with correct content) should be covered via one integration-level converter test using the full sample-plugin fixture, plus targeted writer tests.

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PostToolUse PR #15531 changes schema before merge | Medium | Medium | Hold our PR; TODO comment links to upstream PR for easy verification |
| `deny_unknown_fields` rejects our hooks.json | Low | High | Use `CodexHookEventName` union to prevent invalid events at compile time; keep output minimal |
| hooks.json path not discovered by Codex at runtime | Low | High | Verified correct via `codex-rs/hooks/src/engine/discovery.rs` source analysis |
| Feature gate syntax wrong in config.toml | Low | Medium | Verify against `codex-rs/core/src/config.rs` for `[features]` parsing |
| Sync path clobbers feature gate | Low | High | Write `[features]` section outside managed block markers; document this constraint |
| `renderCodexConfig` signature change breaks sync caller | Low | Low | Use options object with defaults -- sync call site needs no changes |

## Sources & References

- **Origin document:** [docs/solutions/integration-issues/codex-hook-converter-gap.md](docs/solutions/integration-issues/codex-hook-converter-gap.md) -- full research with upstream PR links, compatibility matrix, and semantic differences
- OpenCode hook converter (reference): `src/converters/claude-to-opencode.ts`
- Converter target pattern: `docs/solutions/adding-converter-target-providers.md`
- Codex naming patterns: `docs/solutions/codex-skill-prompt-entrypoints.md`
- Codex hook discovery: `codex-rs/hooks/src/engine/discovery.rs` (confirms `.codex/hooks.json` path)
- Upstream PRs: [#15211](https://github.com/openai/codex/pull/15211) (PreToolUse), [#15531](https://github.com/openai/codex/pull/15531) (PostToolUse), [#14626](https://github.com/openai/codex/pull/14626) (UserPromptSubmit), [#11637](https://github.com/openai/codex/pull/11637) (SessionStart/PreCompact, closed)
