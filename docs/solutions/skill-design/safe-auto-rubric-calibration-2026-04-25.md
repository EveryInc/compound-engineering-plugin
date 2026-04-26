---
title: "safe_auto rubric calibration: variance reduction beats safe_auto-rate-as-target"
date: 2026-04-25
category: skill-design
module: compound-engineering / ce-code-review
problem_type: design_pattern
component: subagent-template
severity: low
tags:
  - ce-code-review
  - autofix-class
  - rubric
  - calibration
  - eval
related_issue: EveryInc/compound-engineering-plugin#686
related_pr: PR #685 (suggested_fix push that this builds on)
---

# safe_auto rubric calibration: variance reduction beats safe_auto-rate-as-target

## TL;DR

Issue #686 hypothesized that personas were *under*-classifying findings as `safe_auto` and proposed tightening the rubric to push more findings into auto-apply. The 60-trial eval showed:

- The hypothesis doesn't hold for textbook cases. **6 of 9 fixture shapes** classify identically between baseline and tightened rubric (all `safe_auto` where mechanical, all `gated_auto` where contract-touching).
- The real win is **variance reduction on ambiguous cases** — particularly orphan code without explicit "no callers" annotation, where the baseline rubric produces essentially random classification (manual / safe_auto / gated_auto across 4 trials on the same fixture).
- The tightened rubric trades one stable disagreement: cross-file Rails service extraction goes from baseline `safe_auto` (4/4) to tightened `gated_auto` (6/7). Both classifications are internally defensible. Tightened is the more conservative reading and matches what a careful operator would want before an auto-apply.

The shipped change is mostly a determinism patch, not a safe_auto-rate increase.

## Context

[`ce-code-review`'s subagent template](../../plugins/compound-engineering/skills/ce-code-review/references/subagent-template.md) classifies each finding into one of four `autofix_class` buckets — `safe_auto`, `gated_auto`, `manual`, `advisory` — that govern downstream fixer dispatch. Headless mode auto-applies only `safe_auto`; everything else surfaces for user routing.

Issue #686 cited an incident pre-#685 ("8 findings ended up in tickets that should have been fixes") and inferred personas were too conservative on `safe_auto`, pushing genuinely-mechanical fixes into `gated_auto` or `manual`. PR #685 fixed the LFG defer-bias directly via `suggested_fix` propagation. #686 asked: should we also tighten the `safe_auto` boundary so more findings flow into auto-apply?

## What the eval probed

7 fixtures across 5 finding shapes, run on both the post-#685 baseline subagent template and a tightened version. Single-persona dispatches (correctness / maintainability / testing / security depending on fixture). 60 total trials across 5 iterations:

| Fixture | Shape | Persona |
|---|---|---|
| F1 | Nil guard inside internal helper | correctness |
| F1b | Cart subtotal `min_by` semantic bug | correctness |
| F2 | Off-by-one with parallel pattern in scope | correctness |
| F3 | Dead code with explicit "no callers" comment | maintainability |
| F3b | Orphan code with no explicit deadness signal | maintainability |
| F4 | Local helper extraction within one class | maintainability |
| F4b | Cross-file helper extraction | maintainability |
| F5 | Missing test for new public method | testing |
| F6 | Admin auth gate (negative control — should stay gated_auto) | security |

The tightened rubric added: a one-sentence "test" for `safe_auto` with explicit exclusion list (no contract / permission / signature change), four "boundary cases that feel risky but are safe_auto" examples, a symmetry-of-error opening sentence, and a "do not default to gated_auto" anti-pattern guard.

## Results

| Fixture | Baseline | Tightened | Delta |
|---|---|---|---|
| F1 | 3/3 safe_auto | 3/3 safe_auto | identical |
| F1b | 3/3 safe_auto | 3/3 safe_auto | identical |
| F2 | 3/3 safe_auto | 3/3 safe_auto | identical |
| F3 | 3/3 safe_auto | 3/3 safe_auto | identical |
| F4 | 2/3 safe_auto, 1/3 advisory | 3/3 safe_auto | tightened reduces variance |
| **F3b** | **manual / safe_auto / gated_auto / safe_auto (4 trials, 3 different classes)** | **7/7 gated_auto** | **tightened dramatically reduces variance** |
| F4b | 4/4 safe_auto | 6/7 gated_auto, 1/7 advisory | stable disagreement, opposite directions |
| F5 | 3/3 safe_auto | 3/3 safe_auto | identical |
| F6 (control) | 1/1 gated_auto | 1/1 gated_auto | identical (correctly stable) |

## Interpretation

### The hypothesis was approximately wrong, but the rubric tightening is approximately right anyway

The "personas under-classify safe_auto" hypothesis assumed personas were systematically conservative across the boundary. The data shows post-#685 personas already classify textbook mechanical cases (nil guards, off-by-ones with parallel patterns, explicit dead code, local helper extraction, missing tests for existing methods) as `safe_auto` — six of nine fixtures show no daylight between baseline and tightened.

What the rubric tightening actually does is reduce **variance** on cases where the rubric's previous wording was genuinely ambiguous. F3b is the headline: an orphan method without an explicit "no callers" comment. The baseline produced `manual`, `safe_auto`, and `gated_auto` across four trials on the same input — essentially random. The tightened rubric pins it to `gated_auto` deterministically by giving the persona a clearer test ("the surrounding refactor obviously displaces it" requires positive signal, which this fixture lacks).

Variance on classification is a real cost: ce-work's headless mode behaves differently across runs on identical inputs when the rubric is ambiguous. Determinism is more valuable than the specific classification chosen, as long as the classification is defensible.

### F4b is the one stable disagreement, and it's defensible either way

Cross-file extraction of two service objects with identical bodies: the baseline rubric's "extracting a duplicated helper" example matches, so 4/4 classify `safe_auto`. The tightened rubric's "naming or placement requires a design conversation" criterion catches Rails service-layering placement (base class vs concern vs module) and 6/7 classify `gated_auto`.

Both are internally consistent. The argument for `safe_auto` is "the consolidation is mechanical, the new module's name follows from the shared shape, both call sites update in lockstep within one diff." The argument for `gated_auto` is "in a Rails app, where a shared module lives is a real architectural decision the user should approve before it lands." Reasonable operators could prefer either.

The tightened rubric picks the conservative reading. That's a trade-off, not a regression: ce-work's headless will now flag cross-file extraction for user review instead of auto-applying it. For careful operators that's the right call; for autonomous bulk refactor flows it's modestly more friction.

### What the eval doesn't tell us

This was a single-persona, synthetic-fixture eval. Real reviews run multiple personas through synthesis with conservative tie-breaks; the persona-side classification I measured is one input. Synthesis-layer effects could amplify or dampen what the eval shows. A proper end-to-end test on a real branch with multi-persona dispatch would catch surprises.

The fixtures are also synthetic. The original "8 findings to tickets" incident might involve a finding shape I didn't probe. If the calibration ships and a similar incident recurs, that's evidence the rubric still has a gap and another iteration is warranted.

## What shipped

Two files changed:

1. **`subagent-template.md` (autofix_class decision guide, ~138-160).** Net +14 lines, −6 lines.
   - One-sentence "symmetry of wrong-side cost" framing at the top.
   - Replaced "without design judgment" with an operational test: one-sentence fix, no "depends on" clauses, no change to function signature / public-API contract / error contract / security posture / permission model.
   - Added a "Boundary cases that often feel risky but are still safe_auto" subsection covering nil guards, off-by-ones, dead code, helper extraction (with the cross-file discriminator that pins F4b to gated_auto when placement is design-shaped).
   - Added "do not default to gated_auto" parallel to the existing "do not default to advisory" anti-pattern guard.

2. **`findings-schema.json` (autofix_class field description).** Replaced terse "Reviewer's conservative recommendation" with an operational summary that mirrors the subagent-template wording.

## Why this writeup matters more than the prompt change

The eval surfaced a methodological pattern worth keeping: **rubric calibrations should be evaluated for variance reduction first, classification-rate-shift second.** A "tighter rubric" that doesn't change determinism on ambiguous inputs adds prompt cost without behavioral benefit. F3b's variance reduction is the only fixture where the calibration earns its 14 lines of token cost; F4b is a defensible side effect; the rest are no-ops.

If a future contributor proposes another `autofix_class` rubric tweak, run the same eval (`/tmp/safe-auto-eval/` reproduces in 10–30 minutes per iteration depending on N). Look for variance reduction on ambiguous fixtures, not classification-rate shifts on textbook ones — those don't move on Opus 4.7 with the post-#685 prompt.

## Eval reproducibility

Workspace: `/tmp/safe-auto-eval/` (synthetic fixtures, snapshot baseline, persona-runner prompt, per-iteration outputs).

To re-run:
1. Snapshot the current `subagent-template.md` to `/tmp/safe-auto-eval/skill-snapshot/`
2. Reuse the persona-runner pattern in `/tmp/safe-auto-eval/persona-runner-prompt.md`
3. Spawn one Agent dispatch per cell × trial, parameterized by SUBAGENT_TEMPLATE_PATH (current vs snapshot) + PERSONA_PATH + DIFF_PATH + FILES_DIR + CONTEXT_DIR
4. Aggregate via `jq '.findings[0].autofix_class'` across iteration directories

The fixtures themselves (`/tmp/safe-auto-eval/fixtures/F{1,1b,2,3,3b,4,4b,5,6}/`) are kept for reproducibility but are not committed — they're synthetic eval scaffolding, not part of the plugin.

## Related

- PR #685 — `fix(ce-code-review): replace LFG with best-judgment auto-resolve` (the suggested_fix push this builds on)
- Issue #686 — the calibration request that prompted the eval
- `docs/solutions/skill-design/confidence-anchored-scoring-2026-04-21.md` — the anchored confidence rubric this shares stylistic conventions with
