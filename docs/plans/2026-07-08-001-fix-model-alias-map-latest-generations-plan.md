---
title: "fix: Bump Claude family alias map to latest generations (Sonnet 5, Opus 4.8)"
date: 2026-07-08
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
---

# fix: Bump Claude family alias map to latest generations (Sonnet 5, Opus 4.8)

## Summary

The `CLAUDE_FAMILY_ALIASES` map in `src/utils/model.ts` is the single source of truth that resolves bare Claude aliases (`model: sonnet`) to pinned model IDs when converting plugins to multi-provider target platforms (OpenCode, Qwen, OpenClaw, etc.). Two of its three entries are stale now that Sonnet 5 and Opus 4.8 have shipped: `sonnet` still maps to the previous generation `claude-sonnet-4-6`, and `opus` is two generations behind at `claude-opus-4-6`. Bump both to the current generation. `haiku` stays at `claude-haiku-4-5` (still current). Update the docstring examples and the affected test assertions in lockstep.

## Problem Frame

- The map's own comment states: *"Update these when new model generations are released."* — it is designed to be bumped on each release and is now out of date.
- A user who writes `model: sonnet` in a skill/agent and converts to a normalizing target (e.g. OpenCode) currently gets `anthropic/claude-sonnet-4-6` — the prior generation, not the latest Sonnet.
- This is broken/stale behavior the map is meant to keep current, so it is a `fix:`, not a `feat:`.

**Non-goals (explicitly out of scope):**
- Pass-through fixture IDs like `claude-sonnet-4-20250514` in converter tests (`converter.test.ts`, `codex-converter.test.ts`, `droid-converter.test.ts`, `kiro-converter.test.ts`, `copilot-converter.test.ts`, `antigravity-converter.test.ts`, and the `sample-plugin` fixture) — these verify that an arbitrary *dated* ID forwards unchanged; they are not claims about the latest model and must not be touched.
- Historical provenance in `docs/plans/*` (`completed_by: "Claude Opus 4.6"`) — historical record, do not rewrite.
- The historical solution doc `docs/solutions/integrations/cross-platform-model-field-normalization.md` — its `claude-sonnet-4-6` examples document the mechanism at the time; cosmetic only, leave as-is.

## Target values

| Alias | Current | New | Reason |
|-------|---------|-----|--------|
| `haiku` | `claude-haiku-4-5` | `claude-haiku-4-5` | unchanged — still current |
| `sonnet` | `claude-sonnet-4-6` | `claude-sonnet-5` | Sonnet 5 released |
| `opus` | `claude-opus-4-6` | `claude-opus-4-8` | Opus 4.8 is the current Opus generation |

Canonical short-form (no date suffix) matches the existing map convention and the current model IDs.

## Requirements

- R1: `resolveClaudeFamilyAlias("sonnet")` returns `claude-sonnet-5`; `resolveClaudeFamilyAlias("opus")` returns `claude-opus-4-8`; `haiku` unchanged.
- R2: `normalizeModelWithProvider` composes the new values with the provider prefix (`anthropic/claude-sonnet-5`, `anthropic/claude-opus-4-8`).
- R3: Docstring examples in `src/utils/model.ts` that use `claude-sonnet-4-6` as the illustrative *alias-resolution* output reflect the new value. The `claude-sonnet-4-20250514` pass-through examples (lines 24, 55) stay unchanged — they illustrate dated-ID pass-through, not alias resolution.
- R4: `bun test` passes.

## Implementation Units

### U1. Bump the alias map and docstring examples in `src/utils/model.ts`

- **Goal:** Update the two stale alias values and the docstrings that illustrate alias resolution.
- **Requirements:** R1, R3
- **Files:** `src/utils/model.ts`
- **Approach:**
  - Line 15: `sonnet: "claude-sonnet-4-6"` → `sonnet: "claude-sonnet-5"`
  - Line 16: `opus: "claude-opus-4-6"` → `opus: "claude-opus-4-8"`
  - Line 23 docstring (`"sonnet" -> "claude-sonnet-4-6"`) → `"sonnet" -> "claude-sonnet-5"`
  - Line 34 docstring (`"claude-sonnet-4-6" -> "anthropic/claude-sonnet-4-6"`) → use `claude-sonnet-5`
  - Line 54 docstring (`"sonnet" -> "anthropic/claude-sonnet-4-6"`) → use `anthropic/claude-sonnet-5`
  - Leave lines 24 and 55 (`claude-sonnet-4-20250514` pass-through examples) untouched.
- **Test scenarios:** Covered by U2 (assertions live in the test file, not this module).
- **Verification:** File compiles; `resolveClaudeFamilyAlias` returns the new canonical names for `sonnet`/`opus`.

### U2. Update assertions in `tests/model-utils.test.ts`

- **Goal:** Keep the alias-resolution assertions in sync with the new map values.
- **Requirements:** R1, R2, R4
- **Dependencies:** U1
- **Files:** `tests/model-utils.test.ts`
- **Approach:**
  - Line 12: expect `resolveClaudeFamilyAlias("sonnet")` → `claude-sonnet-5`
  - Line 13: expect `resolveClaudeFamilyAlias("opus")` → `claude-opus-4-8`
  - Line 25: expect `addProviderPrefix("claude-sonnet-4-6")` — this asserts prefixing behavior on an arbitrary Claude ID, not alias resolution. Either leave it (still valid — any `claude-*` gets the `anthropic/` prefix) or update the literal to `claude-sonnet-5` for freshness. Update it to `claude-sonnet-5` so the test file carries no stale generation references.
  - Line 63: expect `normalizeModelWithProvider("sonnet")` → `anthropic/claude-sonnet-5`
  - Line 65: expect `normalizeModelWithProvider("opus")` → `anthropic/claude-opus-4-8`
  - Do NOT change lines 17 and 69 (`claude-sonnet-4-20250514` pass-through assertions) — they prove dated IDs forward unchanged.
  - The `CLAUDE_FAMILY_ALIASES covers all three tiers` test (line 80) asserts on keys only, not values — no change needed.
- **Test scenarios:**
  - `resolveClaudeFamilyAlias("sonnet")` → `claude-sonnet-5` (happy path)
  - `resolveClaudeFamilyAlias("opus")` → `claude-opus-4-8` (happy path)
  - `normalizeModelWithProvider("sonnet")` → `anthropic/claude-sonnet-5` (compose with prefix)
  - `normalizeModelWithProvider("opus")` → `anthropic/claude-opus-4-8` (compose with prefix)
  - Regression guard: `resolveClaudeFamilyAlias("claude-sonnet-4-20250514")` still passes through unchanged (line 17 untouched).
- **Verification:** `bun test` passes with zero failures; no unintended edits to pass-through fixture assertions.

## Verification Contract

- `bun test` passes (specifically `tests/model-utils.test.ts`).
- Grep confirms no remaining `claude-sonnet-4-6` or `claude-opus-4-6` in `src/utils/model.ts` or `tests/model-utils.test.ts`.
- Grep confirms `claude-sonnet-4-20250514` pass-through fixtures are unchanged across `tests/`.

## Definition of Done

- `src/utils/model.ts` alias map reads `sonnet: "claude-sonnet-5"`, `opus: "claude-opus-4-8"`, `haiku` unchanged; docstrings updated.
- `tests/model-utils.test.ts` assertions updated; pass-through assertions untouched.
- `bun test` green.
- No changes to converter fixtures, historical docs/plans, or the historical solution doc.
