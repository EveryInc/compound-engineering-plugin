---
title: Requested-vs-verified model identity receipts for cross-model delegation
date: 2026-07-14
category: skill-design
module: skills
problem_type: design_pattern
component: development_workflow
severity: medium
applies_when:
  - "a skill announces or records which external model performed delegated work"
  - "cross-model agreement bonuses or scoring assume a different model family actually ran"
  - "a backend can silently fall back to a default model when the requested one is unavailable"
tags: [cross-model, delegation, model-identity, verification, receipts, subagents, output-integrity]
---

# Requested-vs-Verified Model Identity: Treat "Which Model Ran" as a Claim That Needs a Receipt

The principle is the "Model identity receipt" entry in `CONCEPTS.md`: request parameters (`--model`, the `M_CLAUDE` / `M_CODEX` / `M_GROK` pins in the cross-model scripts) are not evidence of which model served, and agreement weighting follows the receipt, not the request. The receipt fields (`model_requested`, `model_actual`, `independence_verified`), the verified / mismatch / unverified labeling, and the promotion gate live in `skills/ce-code-review/references/cross-model-review.md` and `skills/ce-pov/scripts/cross-model-pov.sh`. This doc keeps the measurements behind that design.

One labeling lesson the reference states but not its cause: "unknown model" is the wrong rendering of a missing receipt. The requested model is always known, and showing a receipt-less run as unknown identity confused users (2026-09-21); `model_actual: unverified` means no receipt, not an unknown model.

Since the acpx transport (#1843) the receipt is the adapter's report in the prompt result's `_meta` (`quota.model_usage` / `modelId`, read by `acpx_served_models`). acpx documents `_meta` as adapter-defined, so the workers treat it as the adapter's assertion rather than a backend attestation; routes whose adapter reports nothing (Antigravity) record `unverified`.

## Why a self-report is not a receipt (measured 2026-07-14)

- Asked to name its serving model, the codex CLI's model answered "GPT-5 (exact serving model name/version not exposed to me)" -- it cannot see its own serving identity even on a healthy run, so it cannot detect a substitution either.
- The claude CLI's model named itself exactly, but its harness injects the model name into context, so the self-report is not independent evidence. Before acpx, the same route already provided a real receipt: `claude -p --model haiku --output-format json` returns an envelope whose `modelUsage` object is keyed by the full ID that actually served the run (requesting the alias `haiku` yielded `claude-haiku-4-5-20251001`).
- Prompt-injecting identity ("you are X") does not make a model X. Identity comes only from an out-of-band serving-side report: a response-envelope field, usage metadata, or an API-level attestation -- never from the model's text output.

## Where requested-vs-served actually diverges (measured 2026-07-14)

All three CLIs tested reject an *unknown or unavailable* model id loudly rather than substituting: the claude CLI returns a 404-flagged error envelope, the codex CLI a 400 `invalid_request_error` ("model is not supported when using Codex with a ChatGPT account"), and cursor-agent refuses with its available-model list. The request-validation layer is therefore not the silent surface. The silent surface is **server-side substitution behind a valid model id**: alias re-pointing (`opus` re-resolving to a newer dated model), capacity or routing substitution, and A/B serving -- the request is accepted and nothing in the output signals what served it. An announce line built from the requested value alone is false in exactly those cases.

## When to Apply

- Any pipeline that shells out to an agent CLI with a `--model` flag and then makes claims -- to the user or in stored artifacts -- about which model produced the output. Record both requested and actual identity, not just one.
- When adding a new peer-CLI adapter: check whether its envelope exposes an authoritative served-model field. If it does, wire the receipt check; if it does not, wire the "unverified" labeling. Do not skip the question.
- Not needed when model identity carries no downstream weight (a throwaway formatting call where any model is acceptable).

The general form: whenever logic assigns extra weight to a property of an upstream run (which model, version, dataset, environment), the requested value of that property is not evidence of it. Verify from the serving side's own report, or mark the property unverified and weight accordingly.

## Related

- `docs/solutions/skill-design/detached-job-lifecycle-for-delegated-work.md` -- its durable job artifacts are the natural home for the `model_requested` / `model_actual` fields.
- `docs/solutions/skill-design/cross-harness-cross-model-tool-invocation.md` -- the same epistemic root at a different layer: verify per-harness behavior empirically instead of trusting authoring-runtime assumptions.
- `docs/solutions/best-practices/codex-delegation-best-practices.md` -- scoping contrast: a delegate's self-reported work status may be trusted behind a circuit breaker; model identity may not be self-reported at all.
