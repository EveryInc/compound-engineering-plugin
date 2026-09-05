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

"Which model ran" is a claim about a remote system's behavior; our own request parameters (`--model`, the `M_CLAUDE` / `M_CODEX` / `M_GROK` pins in the cross-model review scripts) are not evidence of it. Requested identity and served identity are separate facts, and only the serving backend can attest to the second one. The receipt fields (`model_requested`, `model_actual`, `independence_verified`) and the promotion gate that depends on them live in `skills/ce-code-review/references/cross-model-review.md` and `skills/ce-pov/scripts/cross-model-pov.sh`; this doc keeps the measurements behind that design.

## The three outcomes

- **verified** -- the backend's own identity report matches the requested model (alias resolution to a dated full ID counts as a match).
- **mismatch** -- the receipt disagrees with the request. Warn prominently, do not label the output with the requested model, void independence assumptions for this run.
- **unverified** -- the backend exposes no authoritative identity report. Label output "requested <model>, unverified". This is honest labeling, not an error state.

Any logic that weights cross-model agreement more than same-model agreement (promotion bonuses, consensus gates, "strongest corroboration" wording) must either require a verified receipt or downgrade its weight and wording to match. Agreement between two unverified runs is agreement between two processes, not necessarily two model families.

## Why a self-report is not a receipt (measured 2026-07-14)

- Asked to name its serving model, the codex CLI's model answered "GPT-5 (exact serving model name/version not exposed to me)" -- it cannot see its own serving identity even on a healthy run, so it cannot detect a substitution either.
- The claude CLI's model named itself exactly, but its harness injects the model name into context, so the self-report is not independent evidence. The same route already provides a real receipt: `claude -p --model haiku --output-format json` returns an envelope whose `modelUsage` object is keyed by the full ID that actually served the run (requesting the alias `haiku` yielded `claude-haiku-4-5-20251001`).
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
