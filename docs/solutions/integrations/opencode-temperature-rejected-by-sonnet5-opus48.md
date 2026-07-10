---
title: OpenCode converter emits a temperature that Sonnet 5 / Opus 4.8 reject
module: src/converters/claude-to-opencode.ts
date: 2026-07-08
problem_type: integration_issue
component: tooling
severity: high
symptoms:
  - Converted OpenCode primary agent fails at runtime with HTTP 400 from Anthropic
  - Breakage appears only after bumping the Claude family alias map to claude-sonnet-5 / claude-opus-4-8
  - inferTemperature (CLI default) emits a temperature (0.1-0.6) on every converted agent
  - Primary agents pinned to claude-sonnet-5 or claude-opus-4-8 reject non-default temperature/top_p/top_k
  - The same conversion worked previously under claude-sonnet-4-6, which accepts temperature
root_cause: config_error
resolution_type: code_fix
related_components:
  - src/utils/model.ts
  - tests/model-utils.test.ts
  - tests/converter.test.ts
tags:
  - opencode
  - converter
  - temperature
  - sampling-params
  - claude-sonnet-5
  - claude-opus-4-8
  - model-alias
---

# OpenCode converter emits a temperature that Sonnet 5 / Opus 4.8 reject

## Problem

Bumping the `sonnet`/`opus` aliases to a newer Claude generation (Sonnet 5, Opus 4.8) made the OpenCode converter emit an inferred `temperature` into primary-agent configs for models that reject non-default sampling params, producing configs the target runtime rejects with HTTP 400.

## Symptoms

- Converted OpenCode primary-agent configs carried an explicit `temperature` for agents pinned to Sonnet 5 (and Opus 4.7/4.8).
- The generated config triggers an HTTP 400 from Anthropic at runtime because Sonnet 5 / Opus 4.7+ reject non-default `temperature`/`top_p`/`top_k`.
- No test failed — no existing test exercised a primary OpenCode agent on a new-generation model, so the breakage was invisible in the suite.

## What Didn't Work

The regression is easy to miss because cause and effect live in different files with no obvious link:

- The triggering change — bumping the `sonnet` alias to Sonnet 5 — looks purely mechanical: a single string swap in an alias map (`CLAUDE_FAMILY_ALIASES` in `src/utils/model.ts`). Nothing at the edit site hints that temperature emission is affected.
- The failing behavior lives elsewhere: the converter's `inferTemperature` emission is in `src/converters/claude-to-opencode.ts`. Reviewing the alias bump in isolation gives no signal.
- No existing test exercised a primary OpenCode agent on a new-generation model, so the suite stayed green.

A naive fix would over- or under-reach:

- Dropping `temperature` for **all** agents over-reaches — models that still accept sampling params (Sonnet 4, Haiku) would lose a valid inferred temperature.
- String-matching `"sonnet"` under-reaches and misclassifies — it would wrongly suppress temperature for older accepting Sonnets (`claude-sonnet-4-20250514`) while missing rejecting Opus generations (`claude-opus-4-7`, `claude-opus-4-8`) entirely.

## Solution

Introduce a precise, canonical-ID-based predicate for "this model rejects sampling params," and gate the converter's temperature emission on it.

Added `rejectsSamplingParams` in `src/utils/model.ts`, backed by a set of canonical IDs. It resolves bare aliases via `resolveClaudeFamilyAlias` and strips the `anthropic/` provider prefix, so every spelling of the same model matches:

```ts
const SAMPLING_PARAM_REJECTING_MODELS: ReadonlySet<string> = new Set([
  "claude-sonnet-5",
  "claude-opus-4-7",
  "claude-opus-4-8",
])

export function rejectsSamplingParams(model: string): boolean {
  const canonical = resolveClaudeFamilyAlias(model).replace(/^anthropic\//, "")
  return SAMPLING_PARAM_REJECTING_MODELS.has(canonical)
}
```

This matches `sonnet`, `claude-sonnet-5`, and `anthropic/claude-sonnet-5`; it does **not** match `claude-sonnet-4-20250514` or `haiku`.

In `convertAgent` (`src/converters/claude-to-opencode.ts`), the temperature emission is gated so it is skipped only when a rejecting model was actually written to the config. The converter writes `model` only for primary agents, so the `frontmatter.model !== undefined` guard scopes this to primary agents; subagents (no model written — they inherit the parent session's model) keep existing behavior, out of scope because the runtime model is unknown at convert time.

Before:

```ts
if (options.inferTemperature) {
  const temperature = inferTemperature(agent)
  if (temperature !== undefined) {
    frontmatter.temperature = temperature
  }
}
```

After:

```ts
if (options.inferTemperature) {
  const temperature = inferTemperature(agent)
  const modelRejectsTemperature =
    frontmatter.model !== undefined &&
    typeof agent.model === "string" &&
    rejectsSamplingParams(agent.model)
  if (temperature !== undefined && !modelRejectsTemperature) {
    frontmatter.temperature = temperature
  }
}
```

## Why This Works

Sonnet 5 and Opus 4.7/4.8 return HTTP 400 for any non-default `temperature`/`top_p`/`top_k` (per Anthropic's Sonnet 5 and Opus 4.8 migration notes). The converter only writes `model` into the config for primary agents, so tying suppression to "we wrote a rejecting model" (`frontmatter.model !== undefined && rejectsSamplingParams(agent.model)`) targets exactly the case that would fail at runtime — a primary agent pinned to a rejecting model — without touching subagents or any model that still accepts sampling params.

## Prevention

The compounding lesson: **a model alias bump is never purely mechanical.** When you point an alias at a newer Claude generation, the model ID string is the smallest part of the change — audit every downstream emitter for API constraints that shifted with the generation. Newer generations (Sonnet 5+, Opus 4.7+) reject non-default sampling params, so any code path that emits `temperature`/`top_p`/`top_k` for a resolved Claude model must gate on model compatibility.

Concrete guardrails:

- Keep `SAMPLING_PARAM_REJECTING_MODELS` in sync with `CLAUDE_FAMILY_ALIASES` whenever a new generation is added — both live in `src/utils/model.ts` and are co-located intentionally so the two are edited together.
- Test both directions so neither over- nor under-reach regresses: a rejecting model (temperature suppressed) and an accepting model (temperature still inferred). The tests added are `rejectsSamplingParams` unit tests in `tests/model-utils.test.ts` (alias resolution, the `anthropic/` prefix, and the accepting cases `claude-sonnet-4-20250514` / `haiku`), plus a converter test in `tests/converter.test.ts` asserting temperature is suppressed for a Sonnet 5 primary agent but still inferred (0.1) for a Haiku agent.
- Verify bot-sourced API claims against the source of truth. An automated cross-model code-review bot (Codex) caught this before merge, but its factual claim about the HTTP 400 was confirmed against authoritative Anthropic migration docs before building the fix — the claim was true, but bot claims about API behavior must always be verified first.

## Related

- [`cross-platform-model-field-normalization.md`](cross-platform-model-field-normalization.md) — the sibling doc covering how bare Claude aliases resolve to provider-prefixed canonical IDs across target platforms. That doc owns the alias-to-provider normalization *mechanism* (`CLAUDE_FAMILY_ALIASES`, `normalizeModelWithProvider`); this doc covers a distinct downstream constraint (sampling-param API limits of newer generations). Both live in `src/utils/model.ts`.
