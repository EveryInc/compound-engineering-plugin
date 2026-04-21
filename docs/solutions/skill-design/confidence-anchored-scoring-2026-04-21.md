---
title: "ce-doc-review confidence scoring: anchored rubric over continuous floats"
date: 2026-04-21
category: skill-design
module: compound-engineering / ce-doc-review
problem_type: design_pattern
component: tooling
severity: medium
tags:
  - ce-doc-review
  - scoring
  - calibration
  - personas
  - persona-rubric
---

# ce-doc-review confidence scoring: anchored rubric over continuous floats

## Problem

Persona-based document review originally used a continuous `confidence` field (0.0 to 1.0) that synthesis compared against per-severity numeric gates (0.50 / 0.60 / 0.65 / 0.75) and a 0.40 FYI floor. In practice the continuous scale invited false precision: personas clustered on round values (0.60, 0.65, 0.72, 0.80, 0.85), and gate boundaries created coin-flip bands where trivial score shifts moved findings in and out of the actionable tier. The personas were not genuinely differentiating 0.65 from 0.72; the model cannot calibrate self-reported confidence at that granularity.

Symptoms surfaced in review output:

- Single personas filing 3+ findings all rated 0.68-0.72, all variants of the same root premise
- Findings at 0.65 admitted into the actionable tier on noise, not signal
- Residual concerns and deferred questions near-duplicated findings already surfaced, indicating the persona's own ordering did not distinguish "raise this" from "note this"

## Reference pattern: Anthropic's anchored rubric

Anthropic's official code-review plugin (`anthropics/claude-plugins-official/plugins/code-review/commands/code-review.md`) solves the calibration problem with 5 discrete anchors (`0`, `25`, `50`, `75`, `100`) each tied to a behavioral criterion the model can honestly self-apply:

- `0` — false positive or pre-existing issue
- `25` — might be real but couldn't verify; stylistic-not-in-CLAUDE.md
- `50` — verified real but nitpick / not very important
- `75` — double-checked, will hit in practice, directly impacts functionality
- `100` — confirmed, evidence directly confirms, will happen frequently

The rubric is passed verbatim to a separate scoring agent. Filter threshold: `>= 80`.

## Solution adopted for ce-doc-review

Port the structural techniques — anchored rubric, verbatim persona-facing text, explicit false-positive catalog — and tune the filter threshold for document-review economics. The doc-review threshold is `>= 50`, not Anthropic's `>= 80`.

### Anchor-to-route mapping

| Anchor | Route |
|--------|-------|
| `0`, `25` | Dropped silently (counted in Coverage only) |
| `50` | FYI subsection (surface-only, no forced decision) |
| `75`, `100` | Actionable tier, classified by `autofix_class` |

Cross-persona corroboration promotes one anchor step (`50 → 75`, `75 → 100`, `100 → 100`). This replaces the prior `+0.10` numeric boost.

Within-severity sort: anchor descending, then document order as the deterministic final tiebreak.

### Files

- `plugins/compound-engineering/skills/ce-doc-review/references/findings-schema.json` — `confidence` is an integer enum `[0, 25, 50, 75, 100]` with behavioral definitions embedded in the `description` field
- `plugins/compound-engineering/skills/ce-doc-review/references/subagent-template.md` — the rubric section personas see verbatim, plus the consolidated false-positive catalog
- `plugins/compound-engineering/skills/ce-doc-review/references/synthesis-and-presentation.md` — anchor-based gate in 3.2, anchor-step promotion in 3.4, anchor-sorted ordering in 3.8, anchor+autofix routing in 3.7
- `plugins/compound-engineering/agents/document-review/*.agent.md` — each of the 7 personas carries a persona-specific calibration section that maps domain criteria to the shared anchors
- `tests/pipeline-review-contract.test.ts` — contract tests that assert the schema enforces discrete anchors and the template embeds the rubric

## Why the threshold diverges from Anthropic

Code review and document review have different economics. Anthropic's `>= 80` filter is load-bearing for code review because of three constraints that do not apply to doc review:

1. **Code review has a linter backstop.** CI runs linters, typecheckers, and tests. The LLM reviewer is a second layer on top of automated tooling, and a second layer only adds value by being *more selective*. If automation already catches the 50-75 tier, the LLM surfacing it again is noise.
2. **Code review is high-frequency and publicly visible.** Every surfaced finding becomes a PR comment. A reviewer who cries wolf 5 times gets muted. Precision dominates recall.
3. **Code claims are ground-truth verifiable.** "The code does X" can be proven or refuted by reading it. A 75 in code review often means "I couldn't verify" — which means waiting for someone who can.

Document review inverts all three:

1. **Doc review IS the backstop.** There is no linter that catches a plan's premise gaps or scope drift. A missed finding in the plan derails implementation weeks later.
2. **Doc review is low-frequency and private.** One review per plan, not per PR. Surfaced findings are dismissed with a keystroke via the routing menu; they are not public commentary.
3. **Premise claims have a natural confidence ceiling.** "Is the motivation valid?" and "does this scope match the goal?" cannot be verified against ground truth. Personas working in strategy, premise, and adversarial domains (product-lens, adversarial) legitimately cap at anchors 50-75 because full verification is not possible from document text alone. A `>= 80` filter would silence those personas.

Filter at `>= 50` for doc review; let the routing menu handle volume. Dismissing a surfaced finding is cheap; missing a real concern is expensive.

## When to port this pattern

- Other persona-based review skills with similar economics (no linter backstop, one-shot consumption, dismissal cheap via routing). Default threshold for such skills: `>= 50`.
- Any scoring workflow where the model is asked to self-report confidence on a continuous scale and clustering on round numbers is observed.

## When NOT to port directly

- Code review workflows (e.g., `ce-code-review`) have linter backstops and public-comment costs. Port the rubric structure, but tune the threshold higher (`>= 75` or `>= 80` per Anthropic). This is out of scope for the ce-doc-review migration; evaluate separately.
- High-throughput pipelines where the `25` anchor ("couldn't verify") represents most findings. Dropping everything below `50` may be too aggressive; consider surfacing `25` as "needs human triage" instead.

## Migration history

Landed in a single atomic change because the schema, template, synthesis, rendering, personas, and tests are coupled — a partial migration would have failed validation at every boundary. The schema change is the load-bearing commit; the persona updates and test updates consume it.

The deferred follow-ups are:

- Port the pattern to `ce-code-review` with a code-review-appropriate threshold
- Evaluate a neutral-scorer second pass (a cheap agent that re-scores findings independent of the producing persona) once the anchor rubric has been observed in practice
