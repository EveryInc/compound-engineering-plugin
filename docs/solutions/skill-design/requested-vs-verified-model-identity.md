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
  - "cross-model review peers or second opinions are dispatched via model CLIs or subagent primitives"
  - "cross-model agreement bonuses or scoring assume a different model family actually ran"
  - "a backend can silently fall back to a default model when the requested one is unavailable"
tags: [cross-model, delegation, model-identity, verification, receipts, subagents, output-integrity]
---

# Requested-vs-Verified Model Identity: Treat "Which Model Ran" as a Claim That Needs a Receipt

## Context

The cross-model review passes in this plugin announce a concrete peer model to the user ("independent cross-model adversarial review by <model> at high reasoning" -- `skills/ce-code-review/SKILL.md` requires the announce line to name the concrete model) and pin per-provider model IDs as script constants: `M_CODEX="gpt-5.6-luna"`, `M_CLAUDE="opus"`, `M_GROK="grok-4.5"`, `M_GROK_CURSOR="cursor-grok-4.5-high"`, `M_COMPOSER="composer-2.5-fast"` at `skills/ce-code-review/scripts/cross-model-adversarial-review.sh` lines 73-77, with byte-identical constants at `skills/ce-doc-review/scripts/cross-model-doc-review.sh` lines 85-89.

The durable fold-in artifacts record the ROUTE that produced them -- the `cross_model_route` field, set in each script's normalize step (`cross-model-adversarial-review.sh` line 441, `cross-model-doc-review.sh` line 531). But nothing anywhere verifies which model actually served the run: neither script parses any model-identity field out of the peer CLI's response envelope. Route- and provider-level reconciliation already exists: both skills' references require announcing the egress scope and reconciling the actual provider from the fold-in filename and the `cross_model_route` field ("Fallback egress must not be silent" in `skills/ce-code-review/references/cross-model-review.md` and `skills/ce-doc-review/references/cross-model-review.md`). The unfilled gap is one level deeper: everything we tell the user and record about the *model* is derived from what we *requested*, not from what *happened*.

The core insight: **"which model ran" is a claim about a remote system's behavior, and we have been treating our own request parameters as proof of it.** Requested identity and served identity are separate facts, and only the serving backend can attest to the second one.

## Guidance

- **Model identity is a claim; attach a receipt or say "unverified".** Every run resolves to one of three outcomes:
  - **verified** -- the backend's own identity report matches the requested model (alias resolution to a dated full ID counts as a match).
  - **mismatch** -- the receipt disagrees with the request. Surface a prominent warning; do not label the output with the requested model; treat downstream independence assumptions as void for this run.
  - **unverified** -- the backend exposes no authoritative identity report. Label output "requested <model>, unverified". This is not an error state; it is honest labeling.
- **Record it durably next to the route.** Fold-in JSON gains `model_requested` and `model_actual` (or the literal string `"unverified"`) alongside the existing `cross_model_route` field, so post-hoc audits can distinguish what was asked from what was served without re-running anything.
- **Never prompt-inject identity, and do not substitute a prompted self-report for a receipt.** Telling a model "you are X" does not make it X, and asking a model which model it is yields a self-report, not a receipt. Measured 2026-07-14: asked to name its serving model, the codex CLI's model answered "GPT-5 (exact serving model name/version not exposed to me)" -- it cannot see its own serving identity even on a healthy run, so it cannot detect a substitution either. The claude CLI's model named itself exactly -- but its harness injects the model name into context, so the self-report is not independent evidence, and the same route already provides a real receipt (`modelUsage`). Identity comes only from the serving backend's own out-of-band report (a response-envelope field, usage metadata, or an API-level attestation) -- never from the model's text output.
- **Independence-weighted logic must follow the receipt.** Any mechanism that gives extra weight to cross-model agreement -- promotion bonuses, consensus gates, "strongest corroboration" language -- should either require a verified receipt or downgrade its weight and wording to match unverified identity. Agreement between two runs whose model identity is unverified is still agreement between two separate processes, but it may not be agreement between two model *families*, and the language must not claim more than the receipt supports.
- **Announce lines follow the receipt.** User-facing text may name the concrete model when identity is verified; otherwise it names the requested model with an explicit unverified marker (e.g. "requested opus; serving model unverified on this route").

## Why This Matters

Where can requested-vs-served diverge? Measured 2026-07-14: all three CLIs we tested reject an *unknown or unavailable* model id loudly rather than substituting -- the claude CLI returns a 404-flagged error envelope, the codex CLI a 400 `invalid_request_error` ("model is not supported when using Codex with a ChatGPT account"), and cursor-agent refuses with its available-model list. So the request-validation layer is not the silent surface. The silent surface is **server-side substitution behind a valid model id**: alias re-pointing (a family alias like `opus` re-resolving to a newer dated model), capacity or routing substitution, and A/B serving -- cases where the request is accepted and nothing in the output signals what actually served it. An announce line built from the requested value alone can be false in exactly those cases, and only a serving-side receipt reveals it.

The stakes here are worse than a mislabeled UI string. Synthesis in both review skills treats cross-model agreement as the strongest corroboration signal in the set: a finding matched by both the in-process persona and the cross-model peer promotes by one anchor step (`skills/ce-code-review/SKILL.md` Stage 5 step 3: "agreement between it and the in-process `adversarial` persona is the strongest signal in the set (different model providers, separate processes)"; same promotion in `skills/ce-doc-review/references/cross-model-review.md`, fold-in step: "promotes by one anchor step ... the cross-model agreement signal, the strongest in the set"). That promotion *presumes a different model family actually ran*. A silent fallback -- say, a peer route quietly serving the host's own model family -- turns "cross-model agreement" into same-family agreement while keeping the label and the anchor bonus. The system would then be systematically over-weighting findings based on an independence property it never checked.

The general form of the lesson: whenever a system's logic assigns extra weight to a property of an upstream run (which model, which version, which dataset, which environment), the requested value of that property is not evidence of it. Verify from the serving side's own report, or explicitly mark the property unverified and weight accordingly.

## When to Apply

- Any pipeline that shells out to an agent CLI or subagent primitive with a `--model`/`-m` flag and then makes claims -- to the user or in stored artifacts -- about which model produced the output.
- Any synthesis or gating logic that weights cross-model or cross-provider agreement more heavily than same-model agreement (promotion bonuses, consensus quorums, diversity requirements).
- Any durable artifact that records provenance of a model run: record both requested and actual identity, not just one.
- When adding a new peer-CLI adapter: check whether its response envelope exposes an authoritative served-model field. If it does, wire the receipt check; if it does not, wire the "unverified" labeling. Do not skip the question.
- Not needed when model identity carries no downstream weight -- e.g. a throwaway formatting call where any model is acceptable and nothing labels or weights the result by model.

## Examples

**The measured receipt (claude CLI, 2026-07-14).** `claude -p --model haiku --output-format json "..."` returns a JSON envelope whose `modelUsage` object is keyed by the full model ID that actually served the run. Measured: requesting the alias `haiku` yielded a `modelUsage` object keyed `claude-haiku-4-5-20251001`. So on this route, requested-vs-actual is checkable per run: parse `modelUsage`, compare the key against the requested alias/ID, and record both.

**Fold-in artifact carrying the receipt next to the route:**

```json
{
  "reviewer": "adversarial-claude",
  "cross_model_route": "claude",
  "model_requested": "opus",
  "model_actual": "claude-opus-4-8-20260115",
  "findings": []
}
```

On a route with no authoritative identity report, `model_actual` is the literal string `"unverified"`.

**Parse-compare-warn sketch:**

```bash
requested="opus"
actual="$(jq -r '.modelUsage | keys[0] // empty' "$RAW_OUT")"
if [ -z "$actual" ]; then
  actual="unverified"
  log "model identity unverified on this route (requested $requested)"
elif ! printf '%s' "$actual" | grep -qi "$requested"; then
  log "WARNING: model mismatch -- requested $requested, backend served $actual;"
  log "  do not label this output as $requested; independence assumptions void"
fi
# record both in the fold-in artifact:
#   --arg mreq "$requested" --arg mact "$actual"
#   ... model_requested: $mreq, model_actual: $mact ...
```

(The alias-match test above is a sketch; a real adapter maps each requested alias to its expected full-ID prefix per provider rather than substring-matching.)

**Scope note (honest).** Today only some routes expose an authoritative identity report -- measured on the claude CLI. Routes without one are not broken; they are simply labeled unverified, and their agreement bonuses should say so. As other peer CLIs add per-run served-model reporting, their adapters should adopt the same parse-compare-record pattern.

## Related

- `docs/solutions/skill-design/detached-job-lifecycle-for-delegated-work.md` -- sibling pattern for the same delegation infrastructure; its durable job artifacts (`meta.json` job identity, atomically published results) are the natural home for the `model_requested` / `model_actual` fields this doc prescribes.
- `docs/solutions/skill-design/cross-harness-cross-model-tool-invocation.md` -- the same epistemic root at a different layer: verify per-harness behavior empirically instead of trusting authoring-runtime assumptions.
- `docs/solutions/best-practices/codex-delegation-best-practices.md` -- scoping contrast: a delegate's self-reported work status may be trusted behind a circuit breaker; model identity may not be self-reported at all (receipts come from the serving backend, never the model's text).
- Issues #878 (verified cross-model deep review) and #1115 (Grok host support with an optional model pin) -- open work this receipt pattern is a building block for.
