---
title: "ce-doc-review calibration patterns: tier classification, schema callouts, and run variance"
date: 2026-04-19
category: skill-design
module: compound-engineering / ce-doc-review
problem_type: design_pattern
component: tooling
severity: medium
tags:
  - ce-doc-review
  - autofix-classification
  - synthesis-pipeline
  - persona-calibration
  - calibration
applies_when:
  - Changing persona confidence calibration in the doc-review skill-local personas under `skills/ce-doc-review/references/personas/`
  - Modifying the synthesis pipeline in `skills/ce-doc-review/references/synthesis-and-presentation.md`
  - Adjusting the subagent template's output contract in `references/subagent-template.md`
  - Adding or modifying seeded test fixtures under `tests/fixtures/ce-doc-review/`
  - Debugging why a finding landed in a different tier than expected
---

# ce-doc-review calibration patterns

Patterns that re-surface whenever personas or synthesis guidance are retuned. Contributors changing calibration should expect them and not "fix" them as bugs.

## Tier classification is context-sensitive, not purely formal

The naive read of the tier spec says `safe_auto` = "one clear correct fix, applied silently." The same shape of finding legitimately lands in different tiers depending on scope and verifiability.

**External stale cross-reference goes to `gated_auto`, not `safe_auto`.** `see Unit 7` where Unit 7 does not exist in the same document is internal: coherence can verify from the document text alone and apply `safe_auto`. `see docs/guides/keyboard-nav.md Section 4` is external: silently deleting the reference risks masking a legitimate doc, so the fix is "verify before applying" under `gated_auto`.

**Multi-surface terminology drift goes to `gated_auto`.** Two synonyms in prose only (`data store` / `database`) normalize under `safe_auto`. Drift that crosses surfaces (UI copy, aria-labels, toasts, analytics events, file names, code identifiers) exceeds prose normalization and warrants confirmation. Security-adjacent terms (`token` / `credential` / `secret` / `API key`) carry different semantic weight and route to `gated_auto` with a glossary-fix recommendation.

Do not tighten coherence's `safe_auto` guidance to force these into `safe_auto`. The reclassification is reviewer judgment doing useful work.

## Schema compliance needs inline enum callouts, not just `{schema}` injection

The subagent template injects the full JSON schema into each persona's prompt. Conformance still broke on longer personas (adversarial at 89 lines, scope-guardian at 54): severity emitted as `"high"/"medium"/"low"` instead of `P0..P3`, evidence as strings instead of arrays. Schema injection gets pushed down in attention by dense persona rubrics. What worked is the "Schema conformance — hard constraints" block at the top of the output contract in `references/subagent-template.md`, naming the exact enum values and forbidding common deviations, plus a translation rule so a persona's informal "critical/important/low-signal" language maps to `P0..P3` at emit time instead of leaking into JSON.

## Reviewer variance is inherent; single runs are not baselines

Across 7+ runs on the rename fixture, the same document produced `safe_auto`-applied counts of 0, 1, 2, 3 and total user-decision counts of 14, 19, 6, 12, 8, 6. Calibration reduced but did not eliminate variance. Primary sources:

- adversarial reviewer activation: the activation signals (requirement count, architectural decisions, high-stakes domain) are non-deterministic on borderline documents
- root selection when multiple candidates exist
- confidence on borderline findings: the same finding lands in FYI on one run and manual on the next because the anchor choice flips at the boundary

Validate calibration changes against multiple runs. A single bad run is likely noise; a pattern across 3+ runs is signal. Seeded fixtures under `tests/fixtures/ce-doc-review/` document expected tier distributions as targets, not pass/fail assertions.

## Related documentation

- `skills/ce-doc-review/references/synthesis-and-presentation.md`: the current pipeline; read it, not this doc, for mechanics
- `skills/ce-doc-review/references/subagent-template.md`: output contract with the schema conformance block
- `skills/ce-doc-review/references/personas/`: the persona prompts with their calibration sections
- [confidence-anchored-scoring.md](./confidence-anchored-scoring.md): the scoring model (discrete `0/25/50/75/100`, FYI = anchor `50`)
