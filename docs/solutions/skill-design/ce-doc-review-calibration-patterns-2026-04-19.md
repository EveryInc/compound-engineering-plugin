---
title: "ce-doc-review calibration patterns: tier classification, chain grouping, and FYI routing"
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
  - premise-dependency
  - fyi-routing
  - calibration
applies_when:
  - Changing persona confidence calibration bands in `plugins/compound-engineering/agents/document-review/`
  - Modifying the synthesis pipeline in `plugins/compound-engineering/skills/ce-doc-review/references/synthesis-and-presentation.md`
  - Adjusting the subagent template's output contract in `references/subagent-template.md`
  - Adding or modifying seeded test fixtures under `tests/fixtures/ce-doc-review/`
  - Debugging why a finding landed in a different tier than expected
---

# ce-doc-review calibration patterns

Calibration work on ce-doc-review (PR #601 series, 2026-04-18 and -19) surfaced several non-obvious patterns in how the synthesis pipeline classifies findings. These patterns are durable: they will re-surface any time personas or synthesis guidance are retuned. Future contributors changing calibration should expect them and not "fix" them as bugs.

## Tier classification is context-sensitive, not purely formal

The naive read of the tier spec says `safe_auto` = "one clear correct fix, applied silently." In practice, the same shape of finding can legitimately land in different tiers depending on scope and verifiability. Two recurring patterns:

### External stale cross-reference → gated_auto (not safe_auto)

When the document says `see Unit 7` and Unit 7 doesn't exist in the same document, that's an **internal** stale cross-reference — coherence can verify from the document text alone and apply `safe_auto`. When the document says `see docs/guides/keyboard-nav.md Section 4` and that file isn't verifiable from the document content, that's an **external** cross-reference; applying "delete this reference" silently risks masking a legitimate external doc. The reviewer should route these to `gated_auto` with a "verify before applying" fix, not `safe_auto`.

Observed in: feature-plan fixture runs. The external cross-ref landed at P2 0.70 gated_auto with the fix "Verify docs/guides/keyboard-nav.md exists... If stale, either remove the reference or replace with inline guidance."

### Multi-surface terminology drift → gated_auto (not safe_auto)

When two synonyms appear in prose only (`data store` / `database`), `safe_auto` normalizes correctly. When the drift crosses surfaces — UI copy, aria-labels, toast messages, analytics events, file names, code identifiers — the fix's scope exceeds prose normalization and warrants user confirmation. Security-adjacent terminology (`token` / `credential` / `secret` / `API key`) carries different semantic weight and should also route to `gated_auto` with a glossary-fix recommendation.

Observed in: auth-plan fixture runs (security-lens escalated), feature-plan fixture runs (UI-surface escalated).

**Do not tighten coherence's `safe_auto` guidance to force these into `safe_auto`.** The reclassification is reviewer judgment doing useful work.

## Premise-dependency chains have scope hierarchy

Synthesis step 3.5c groups manual findings whose fixes cascade from a single premise challenge. When multiple premise-level candidates surface, they may be **peer roots** (independent premises at different scopes) or **nested** (one premise's resolution moots the other). The decision rules:

### Peer vs nested — mechanical test, not example-based

> "Two candidate roots are peers when accepting root A's proposed fix would not resolve root B's concern (and vice versa). They are nested when one root's fix would moot the other — in which case the subsumed candidate becomes a dependent of the surviving root."

Apply symmetrically: check both directions before deciding. Example-based teaching ("e.g., 'drop the alias'") overfits to specific vocabulary; a mechanical decision test generalizes across domains.

### Surviving root under nested — scope dominates confidence

When nested, the surviving root is the one whose fix moots the other — **not** the higher-confidence candidate. In a rename plan, "rename premise unsupported" (0.82) dominates "alias machinery unjustified" (0.98) because rejecting the rename moots the alias entirely, while rejecting the alias still leaves the rename standing. Earlier synthesis picked the higher-confidence candidate as root, which stranded the broader-scope premise's natural dependents as independent findings.

Confidence is for tie-breaking *among peers*, not for deciding which of two nested candidates dominates.

### Multi-root requires explicit elevation

Synthesis defaults to picking a single root when multiple candidates match. A phrase like "typically 0–2 roots surface per review" anchors the synthesizer to elevate only one. Explicit guidance to elevate ALL matching candidates (subject only to the peer-vs-nested test) is needed. The criteria themselves are the filter — no numerical cap on roots.

## FYI routing requires band + template-level anchoring

The FYI bucket (manual findings with confidence 0.40–0.65) stayed empty for initial calibration runs because personas had only two bands defined (HIGH ≥0.80, MODERATE 0.60–0.79) with "Suppress below 0.50." Advisory observations with no articulable consequence had nowhere to land — they were either promoted above gate (appearing as real decisions) or suppressed entirely.

Two changes together populate the FYI bucket reliably:

1. **Per-persona LOW (0.40–0.59) Advisory band** tailored to each persona's scope. Each of the 7 personas needs its own band; a single template-level rule doesn't override persona-specific calibrations.
2. **Template-level advisory rule** in `subagent-template.md`'s output-contract using the "what actually breaks if we don't fix this?" heuristic. Anchors the scoring decision when a persona's own rubric doesn't make the band's applicability obvious.

Either alone is insufficient. Persona bands without the template rule produce inconsistent results across personas; the template rule without per-persona bands has nothing to calibrate against.

## Schema compliance requires inline enum callouts, not just `{schema}` injection

The subagent template injects the full JSON schema into each persona's prompt. Schema conformance nonetheless broke on longer personas (adversarial at 89 lines, scope-guardian at 54 lines) — severity emitted as `"high"/"medium"/"low"` instead of `P0/P1/P2/P3`, evidence as strings instead of arrays.

The fix that worked: a **"Schema conformance — hard constraints"** block at the top of the output contract prose, naming the exact enum values and forbidding common deviations. Schema injection alone gets pushed down in attention by dense persona rubrics; inline enum callouts anchor them at the top of the output contract and survive longer prompts.

A severity translation rule ("if your persona's prose discusses 'critical/important/low-signal', map to P0/P1/P2/P3 at emit time") prevents informal priority language in persona rubrics from leaking into JSON output.

## Coverage/rendering count invariants need a single source of truth

Early chain runs reported coverage count (`1 root with 6 dependents`) that didn't match the rendered output (5 dependents shown). The spec didn't name which step's count was authoritative (candidate count from Step 2, post-safeguard from Step 3, or post-cap from Step 4), so the orchestrator used different values for coverage and rendering.

**Invariant to preserve:** the `dependents` array populated in the final annotation step (after all filtering) is the single source of truth for both coverage and rendering. A finding appearing in a root's `dependents` array must appear nested under that root in presentation and must NOT appear at its own severity position. Coverage count equals the length of the `dependents` array.

Any future pipeline change that adds filtering or reorganization steps must re-state which post-step snapshot is authoritative.

## Reviewer variance is inherent; single runs aren't baselines

Across 7+ runs on the rename fixture, the same document produced user-engagement counts of 0, 1, 2, 3 for `safe_auto` applied and 14, 19, 6, 12, 8, 6 for total user decisions. Calibration work reduced but did not eliminate variance. Primary variance sources:

- **Adversarial reviewer activation** — the activation signals (requirement count, architectural decisions, high-stakes domain) produce non-deterministic decisions at borderline documents
- **Root selection when multiple candidates exist** — even with scope-dominance guidance, the synthesizer's root choice varies across runs
- **Confidence calibration on borderline findings** — the same finding lands in FYI on one run and manual on the next, because the reviewer scored 0.63 vs 0.68

**Testing implication:** validate calibration changes against multiple runs, not single samples. A single "bad" run is likely noise; a pattern across 3+ runs is signal. Seeded fixtures document expected tier distributions as targets, not as pass/fail assertions.

## Related documentation

- `plugins/compound-engineering/skills/ce-doc-review/references/synthesis-and-presentation.md` — canonical synthesis pipeline spec, including 3.5c premise-dependency chain linking
- `plugins/compound-engineering/skills/ce-doc-review/references/subagent-template.md` — output contract with schema conformance block and advisory routing rule
- `plugins/compound-engineering/agents/document-review/` — the 7 persona agents with their confidence calibration bands
- `tests/fixtures/ce-doc-review/` — three seeded fixtures (rename, auth, feature) for manual calibration testing; see each fixture's header comment for its specific seed map
- `docs/solutions/developer-experience/branch-based-plugin-install-and-testing-2026-03-26.md` — how to run the skill from a branch checkout for testing
