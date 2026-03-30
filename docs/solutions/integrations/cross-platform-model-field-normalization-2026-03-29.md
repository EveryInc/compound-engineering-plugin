---
title: "Cross-platform model field normalization for target converters"
date: 2026-03-29
category: integration-issues
module: src/converters
problem_type: integration_issue
component: tooling
symptoms:
  - "Target platforms received raw Claude model aliases (e.g., 'sonnet') they could not resolve"
  - "Qwen converter mapped model aliases to wrong canonical names (claude-sonnet instead of claude-sonnet-4-6)"
  - "OpenClaw and Copilot passed through unnormalized model values in formats the target could not use"
  - "Duplicated CLAUDE_FAMILY_ALIASES and normalizeModel logic across converters with divergent alias values"
root_cause: config_error
resolution_type: code_fix
severity: medium
tags:
  - model-normalization
  - converters
  - cross-platform
  - opencode
  - qwen
  - droid
  - copilot
  - openclaw
  - codex
---

# Cross-platform model field normalization for target converters

## Problem

Claude Code uses bare model aliases (`model: sonnet`, `model: haiku`, `model: opus`) in agent and command frontmatter. Each target platform expects a different format for the model field, but the converters handled this inconsistently — some passed through raw values, others had duplicated normalization logic with wrong alias mappings.

## Symptoms

- OpenClaw passed `model: sonnet` through raw — invalid on a platform expecting `anthropic/claude-sonnet-4-6`
- Qwen mapped `sonnet` to `anthropic/claude-sonnet` instead of `anthropic/claude-sonnet-4-6` (wrong alias in its local copy of `CLAUDE_FAMILY_ALIASES`)
- Copilot passed through raw Claude model IDs like `claude-sonnet-4-20250514` — Copilot uses display-name format ("Claude Opus 4.5"), not model IDs
- Codex emitted no model field — correct behavior, but accidental (no deliberate handling)
- Droid passed through as-is — correct behavior, but undocumented as intentional
- Two copies of `CLAUDE_FAMILY_ALIASES` existed in OpenCode and Qwen converters with divergent values

## What Didn't Work

- **Passing model through as-is**: works for Droid (Factory natively resolves bare aliases), breaks OpenClaw/Qwen/OpenCode
- **Mapping bare aliases to incomplete model names**: Qwen's `sonnet` -> `claude-sonnet` was wrong; correct is `claude-sonnet-4-6`
- **Assuming all targets want the same model format**: each platform has fundamentally different expectations
- **Assuming Codex skills support model overrides in frontmatter**: they don't — confirmed by the Rust source `SkillFrontmatter` struct which only has `name` and `description`
- **Initial assumption that Qwen should drop model entirely**: wrong — Qwen is multi-provider and supports Anthropic models via `settings.json` with `anthropic` provider config
- **Initial assumption that Copilot doesn't support models**: wrong — Copilot supports multi-model including Claude, but the exact format is uncertain (display names vs model IDs)

## Solution

Created `src/utils/model.ts` with shared normalization utilities:

```typescript
// Single source of truth for bare Claude family aliases
export const CLAUDE_FAMILY_ALIASES: Record<string, string> = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
}

// Resolve bare alias without provider prefix (used by Droid)
export function resolveClaudeFamilyAlias(model: string): string

// Add provider prefix based on naming conventions
export function addProviderPrefix(model: string): string

// Combined: resolve + prefix (used by OpenCode, Qwen, OpenClaw)
export function normalizeModelWithProvider(model: string): string
```

Each converter now uses the appropriate shared utility:

| Target | Behavior | Output for `model: sonnet` |
|--------|----------|----------------------------|
| OpenCode | Resolve alias + add provider prefix | `anthropic/claude-sonnet-4-6` |
| Qwen | Resolve alias + add provider prefix | `anthropic/claude-sonnet-4-6` |
| OpenClaw | Resolve alias + add provider prefix | `anthropic/claude-sonnet-4-6` |
| Droid | Pass through as-is | `sonnet` |
| Copilot | Drop entirely | (omitted) |
| Codex | Drop entirely | (omitted) |

---

## Why This Works

Each platform has fundamentally different model handling requirements:

**Platforms that normalize (OpenCode, Qwen, OpenClaw):** These are multi-provider platforms that support Anthropic, OpenAI, Google, and other model providers. They need provider-prefixed IDs like `anthropic/claude-sonnet-4-6` to route requests to the correct backend. The `normalizeModelWithProvider` function resolves bare aliases and adds the appropriate prefix.

**Droid (Factory) — pass-through:** Factory is multi-provider but natively resolves Claude's bare aliases (`sonnet`, `opus`, `haiku`) internally. Pass-through is correct and simpler than normalizing to a format Factory would also accept but doesn't require. Factory also accepts full dated model IDs like `claude-sonnet-4-5-20250929` and non-Anthropic models prefixed with `custom:`.

**Copilot — drop:** Copilot supports a `model` field in `.agent.md` frontmatter (documented in `docs/specs/copilot.md`), but the expected values are Copilot-specific display names like "Claude Opus 4.5" — not Claude model IDs like `claude-sonnet-4-20250514` or bare aliases like `sonnet`. Passing through Claude-specific values would emit a field Copilot can't use. Unlike Droid (which natively resolves `sonnet`), Copilot has no documented resolution for Claude model IDs. Dropping is safer: the spec says "If unset, inherits the default model."

**Codex — drop:** Codex skill frontmatter (`SKILL.md`) only supports `name` and `description` fields. This was confirmed by examining the Rust source code (`SkillFrontmatter` struct in `codex-rs/core-skills/src/loader.rs`). Model selection in Codex is global via `config.toml` or runtime `/model` command, not per-skill.

---

## Target platform model field reference

This reference captures research findings as of 2026-03-29.

### OpenCode
- **Model format:** `provider/model-id` (e.g., `anthropic/claude-sonnet-4-6`)
- **Provider prefixes:** `anthropic/`, `openai/`, `google/`
- **Docs:** Agents defined in `.opencode/agents/*.md`

### Qwen
- **Model format:** `provider/model-id` (e.g., `anthropic/claude-sonnet-4-6`)
- **Multi-provider:** Yes — supports Anthropic, OpenAI, Google GenAI via `settings.json`
- **Configuration example:** `"anthropic": [{"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4", "envKey": "ANTHROPIC_API_KEY"}]`
- **Common misconception:** Qwen is NOT limited to its own foundation model

### Droid (Factory)
- **Model format:** Bare names (`sonnet`, `claude-sonnet-4-5-20250929`) or `custom:<model>` for BYOK
- **Native alias resolution:** Factory resolves `sonnet`, `opus`, `haiku` internally
- **Multi-provider:** Yes — supports Anthropic, OpenAI, Google, and Factory's own `droid-core`
- **Docs:** Custom droids defined in `.factory/droids/*.md`

### Copilot
- **Model format:** Display names (e.g., "Claude Opus 4.5", "GPT-5.2"), possibly array syntax `model: ['Claude Opus 4.5', 'GPT-5.2']`
- **Multi-provider:** Yes — supports Claude and GPT models
- **Current converter behavior:** Drop (Claude model IDs don't map to Copilot's expected format)
- **Note:** Spec says "may be ignored on github.com" — model selection works in IDE but may not apply on the GitHub web platform
- **Docs:** Agents defined in `.github/agents/*.agent.md`

### OpenClaw
- **Model format:** `provider/model-id` (same as OpenCode)
- **Docs:** Skills defined in `skills/*/SKILL.md`

### Codex
- **Model field in skill frontmatter:** NOT SUPPORTED
- **Supported frontmatter fields:** `name`, `description` only
- **Model configuration:** Global `config.toml` (`model = "gpt-5.4"`) or runtime `/model` command
- **Valid model IDs (as of 2026-03):** `gpt-5.4` (flagship), `gpt-5.4-mini` (fast), `gpt-5.3-codex` (coding-specialized)
- **Deprecated:** `codex-mini-latest` (removed Feb 2026)
- **Docs:** Skills defined in `.codex/skills/*/SKILL.md` or `.agents/skills/*/SKILL.md`

---

## Prevention

1. **Research before implementing:** When adding a new converter target, research its model field format with external documentation before assuming pass-through or copying from another converter. The format varies significantly between platforms.

2. **Single source of truth:** The `CLAUDE_FAMILY_ALIASES` map in `src/utils/model.ts` is the canonical alias map. Update it there — not in individual converters — when new Claude model generations are released.

3. **Test coverage:** Run `bun test` after model-related changes. The test suite covers model handling across all converters (`tests/model-utils.test.ts` plus each converter's test file).

4. **Don't assume format from the field name:** A `model` field in frontmatter doesn't mean the format is the same across platforms. OpenCode wants `anthropic/claude-sonnet-4-6`, Factory wants `sonnet`, Copilot wants "Claude Sonnet 4", and Codex doesn't support the field at all.

5. **When in doubt, drop:** If you can't confidently produce the target's expected format, omit the field rather than emitting a potentially invalid value. Most platforms fall back to a sensible default when model is unset.

## Related Issues

- `docs/solutions/adding-converter-target-providers.md` — Converter architecture doc; should be updated to reference model normalization as part of the conversion pattern
- `docs/solutions/integrations/colon-namespaced-names-break-windows-paths-2026-03-26.md` — Structural analog: same pattern of per-target boundary normalization
- `docs/specs/codex.md` — Platform spec (last verified 2026-01-21); confirms skill frontmatter limitations
