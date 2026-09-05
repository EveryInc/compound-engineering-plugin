---
title: "Cross-platform model field normalization for target converters"
date: 2026-03-29
category: integration-issues
module: src/converters
problem_type: integration_issue
component: tooling
symptoms:
  - "Target platforms received raw Claude model aliases (e.g., 'sonnet') they could not resolve"
  - "Duplicated CLAUDE_FAMILY_ALIASES and normalizeModel logic across converters with divergent alias values"
root_cause: config_error
resolution_type: code_fix
severity: medium
tags:
  - model-normalization
  - converters
  - cross-platform
  - opencode
  - droid
  - copilot
  - codex
---

# Cross-platform model field normalization for target converters

Claude Code uses bare model aliases (`model: sonnet`) in agent and command frontmatter. A `model` field in a target's frontmatter does not mean the format is the same: each target wants something different, and the wrong guess is an invalid config rather than a visible error. `src/utils/model.ts` is the single alias map (`CLAUDE_FAMILY_ALIASES`) and normalization helpers; converters must use it rather than carrying a local copy (two divergent copies is how Qwen shipped `sonnet -> claude-sonnet` instead of the dated ID).

## Per-target behavior and why

| Target | Behavior | Why |
|--------|----------|-----|
| OpenCode | Resolve alias + add provider prefix (`anthropic/claude-sonnet-5`) | Multi-provider; routes on the `provider/model-id` prefix. Same rule for any future multi-provider target with that format (the removed Qwen and OpenClaw converters used it). |
| Droid (Factory) | Pass through as-is (`sonnet`) | Factory resolves Claude's bare aliases natively and also accepts dated IDs and `custom:<model>`; normalizing to a form it also accepts adds nothing. |
| Copilot | Drop | Copilot's `model` field takes Copilot display names ("Claude Opus 4.5"), not Claude model IDs or aliases, and has no documented resolution for them. Spec: "If unset, inherits the default model." |
| Codex | Drop | Skill frontmatter supports only `name` and `description` (Rust `SkillFrontmatter` struct). Model selection is global via `config.toml` or `/model`. |

Copilot and Droid converters remain as cleanup remnants, not install targets; the installable Bun targets are `opencode`, `codex`, `pi`, and `antigravity`.

## Rejected assumptions

- Pass everything through: right for Droid only.
- Every target wants the same format: false, see table.
- Codex skills accept a model override: they do not.
- Qwen should drop model because it is single-provider: wrong, it was multi-provider via `settings.json`; the removal was for native-install reasons, not model handling.
- Copilot has no model support: wrong; it has one, in a format we cannot produce from Claude values, which is a different reason to drop.

## Rule

**When in doubt, drop.** If you cannot confidently produce the target's expected format, omit the field rather than emit a possibly invalid value; targets fall back to a default when `model` is unset. Research a new target's model format before assuming pass-through or copying another converter, and add new alias generations only in `src/utils/model.ts`.

## Related

- `docs/solutions/adding-converter-target-providers.md`
- `docs/solutions/integrations/native-plugin-install-strategy.md` for why Qwen and OpenClaw converters were removed
