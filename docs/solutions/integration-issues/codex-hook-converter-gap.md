---
title: "Codex Hook Support: Cross-Platform Conversion Gap Analysis"
type: research
status: active
category: integration-issues
component: codex-converter
created: 2026-03-23
updated: 2026-03-23
affected_files:
  - src/converters/claude-to-codex.ts
  - src/types/codex.ts
  - src/targets/codex.ts
  - docs/specs/codex.md
tags:
  - codex
  - hooks
  - converter
  - cross-platform
  - research
---

# Codex Hook Support: Cross-Platform Conversion Gap Analysis

## Problem Statement

The Codex converter (`src/converters/claude-to-codex.ts`) silently drops all hooks during Claude-to-Codex conversion with no warning emitted. Every other converter in the codebase (Windsurf, Kiro, Copilot, Gemini) at least emits `console.warn` for unsupported hooks. The `CodexBundle` type (`src/types/codex.ts`) has no `hooks` field, and the Codex spec (`docs/specs/codex.md`, last verified 2026-01-21) makes no mention of hooks.

Meanwhile, Codex has been incrementally shipping hook support across multiple PRs, creating a growing conversion gap.

## Investigation

### Step 1: Current Converter State

Checked `src/converters/claude-to-codex.ts` -- found zero references to hooks. The function `convertClaudeToCodex()` processes agents, commands, and skills but has no hook handling at all. No `console.warn`, no comment, nothing.

For comparison, every other converter follows a documented pattern from `docs/solutions/adding-converter-target-providers.md` (Phase 5):

```typescript
if (plugin.hooks && Object.keys(plugin.hooks.hooks).length > 0) {
  console.warn("Warning: {Target} does not support hooks. Hooks were skipped.")
}
```

### Step 2: Codex Upstream Hook Support Research

Researched four Codex PRs and the current main branch to map what Codex now supports:

#### PreToolUse -- MERGED ([openai/codex#15211](https://github.com/openai/codex/pull/15211))

- Shell/Bash only -- tool name hardcoded to `"Bash"` regardless of underlying tool (`shell`, `local_shell`, `shell_command`, `container.exec`, `exec_command`)
- Deny-only -- `permissionDecision: "deny"` is the only supported decision. `allow`, `ask`, `updatedInput`, `additionalContext` all fail open with an error log
- Matchers are regex patterns tested against tool name (but tool name is always "Bash")
- Two blocking paths: JSON output with `permissionDecision: "deny"`, or exit code 2 + stderr
- Key files: `codex-rs/hooks/src/events/pre_tool_use.rs`, `codex-rs/core/src/hook_runtime.rs`

#### PostToolUse -- DRAFT/WIP ([openai/codex#15531](https://github.com/openai/codex/pull/15531))

- Shell/Bash only (same as PreToolUse)
- Supports `block` decision + `additionalContext` injection
- `updatedMCPToolOutput` exists in the schema but is explicitly rejected at runtime
- Input includes `tool_response` (the command's output) in addition to `tool_input`
- `continue: false`, `stopReason`, `suppressOutput` all present in schema but unsupported
- Key files: `codex-rs/hooks/src/events/post_tool_use.rs`, `codex-rs/hooks/schema/generated/post-tool-use.command.input.schema.json`

#### UserPromptSubmit -- MERGED ([openai/codex#14626](https://github.com/openai/codex/pull/14626))

- Fires before user prompt reaches the model
- Supports `block` decision + `additionalContext` injection
- No matcher support -- all registered hooks fire for every prompt (unlike Claude Code which supports matchers)
- Blocked prompts never enter conversation history (differs from Claude Code where they may still be recorded)
- Context injected as developer messages (not user messages)
- Feature-gated behind `codex_hooks = true` in `config.toml` `[features]`
- Key files: `codex-rs/hooks/src/events/user_prompt_submit.rs`, `codex-rs/hooks/schema/generated/user-prompt-submit.command.input.schema.json`

#### SessionStart -- EXISTS ON MAIN

- Supports `SessionStartSource` enum with `Startup` and `Resume` variants
- Supports `additional_contexts` (context injection) and `should_stop`/`stop_reason`
- A community PR ([openai/codex#11637](https://github.com/openai/codex/pull/11637)) proposed this but was closed due to OpenAI's contribution policy change -- OpenAI implemented it themselves
- Key files: `codex-rs/hooks/src/events/session_start.rs`

#### Stop -- EXISTS ON MAIN

- Exists alongside SessionStart in the `HookEventName` enum
- Fires at session end

### Step 3: Hook Type Compatibility

Only `command` type hooks are supported in Codex. Claude Code's `prompt` and `agent` hook types have no equivalent.

## Hook Event Compatibility Matrix

| Claude Event | Codex Status | Convertible? | Key Limitations |
|---|---|---|---|
| PreToolUse (Bash matcher) | Merged (PR #15211) | Yes | Deny-only; no allow/ask/updatedInput/additionalContext |
| PreToolUse (non-Bash) | N/A | No | Codex only fires for shell tools |
| PostToolUse (Bash matcher) | Draft (PR #15531) | Yes (pending merge) | Block + additionalContext only |
| PostToolUse (non-Bash) | N/A | No | Codex only fires for shell tools |
| UserPromptSubmit | Merged (PR #14626) | Yes | No matchers; blocked prompts don't enter history |
| SessionStart | Exists on main | Yes | Command-only |
| Stop | Exists on main | Yes | Command-only |
| PostToolUseFailure | N/A | No | No Codex equivalent |
| PermissionRequest | N/A | No | No Codex equivalent |
| Notification | N/A | No | No Codex equivalent |
| SessionEnd | N/A | No | No Codex equivalent |
| PreCompact | N/A | No | No Codex equivalent |
| Setup | N/A | No | No Codex equivalent |
| SubagentStart/Stop | N/A | No | No Codex equivalent |

## Cross-Cutting Constraints

- **Command-only**: Only `type: "command"` hooks. No `prompt` or `agent` types in Codex.
- **Feature-gated**: Requires `codex_hooks = true` in `config.toml` under `[features]`.
- **Strict schema**: `deny_unknown_fields` on all wire types -- extra fields cause parse failure.
- **Fail-open design**: Unsupported outputs, malformed JSON, non-zero/non-2 exit codes all resolve to "allow."
- **No Windows support**: Entire hook system disabled on Windows.
- **No async hooks**: `async: true` in config is recognized but skipped with a warning.

## Semantic Differences from Claude Code

1. **PreToolUse decisions**: Claude Code supports allow/deny/ask/updatedInput/additionalContext. Codex supports deny only.
2. **UserPromptSubmit matchers**: Claude Code supports matchers to selectively fire hooks. Codex has no matcher support.
3. **UserPromptSubmit blocking**: In Claude Code, blocked prompts may still enter conversation history. In Codex, they never do.
4. **Context injection**: Codex injects additionalContext as developer messages, which may have different model-visible behavior.

## Recommended Solution

1. Add `hooks` field to `CodexBundle` type in `src/types/codex.ts`
2. Convert the compatible subset: PreToolUse (Bash-matched, command type), PostToolUse (pending PR #15531 merge), UserPromptSubmit, SessionStart, Stop
3. Skip + warn for unconvertible hooks with specific reasons (non-Bash matchers, prompt/agent types, unsupported events)
4. Write `hooks.json` output in the Codex writer (`src/targets/codex.ts`)
5. Update `docs/specs/codex.md` with hook documentation
6. Add converter and writer tests

## Prevention Strategies

### Silent feature drops

The core issue is that the Codex converter was never updated to even warn about hooks. Five converters (Codex, Droid, Pi, OpenClaw, Qwen) silently drop hooks. Consider:

- Adding a cross-converter completeness test that asserts every converter either includes hooks in its bundle or emits a warning
- Framework-level validation in `src/targets/index.ts` that automatically checks for dropped features post-conversion

### Tracking upstream changes

The Codex spec (`docs/specs/codex.md`) was last verified 2026-01-21. Consider a capability matrix that maps each Claude feature to each target's support status with `last-verified` dates, and flagging entries older than 90 days as stale during `release:validate`.

## Related Documentation

- `docs/specs/codex.md` -- Codex target spec (needs hooks section added)
- `docs/specs/claude-code.md` -- Claude Code hook architecture reference
- `docs/solutions/adding-converter-target-providers.md` -- Documented converter pattern (Phase 5 warns on unsupported features; Codex never implemented this)
- `docs/solutions/codex-skill-prompt-entrypoints.md` -- Codex-specific conversion patterns
- `src/converters/claude-to-opencode.ts` -- Reference for full hook conversion (the only converter that maps hooks today)
- Commit `598222e` -- OpenCode PreToolUse try-catch fix (issue #85)

## Refresh Candidates

- `docs/solutions/adding-converter-target-providers.md` may need update once Codex hook conversion is implemented, since the pattern of "all new targets warn-and-skip hooks" will no longer be universal
- `docs/specs/codex.md` needs a hooks section
