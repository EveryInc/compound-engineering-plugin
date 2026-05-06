---
title: "safe_auto rubric calibration: variance reduction beats safe_auto-rate-as-target"
date: 2026-04-25
last_updated: 2026-04-25
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
  - eval-methodology
  - variance
related_issue: EveryInc/compound-engineering-plugin#686
related_pr: "PR #685 (suggested_fix push that this builds on)"
---

# safe_auto rubric calibration: variance reduction beats safe_auto-rate-as-target

## TL;DR

Issue #686 hypothesized that personas were *under*-classifying findings as `safe_auto` and proposed tightening the rubric to push more findings into auto-apply. The 60-trial eval showed:

- The hypothesis doesn't hold for textbook cases. **6 of 9 fixture shapes** classify identically between baseline and tightened rubric (all `safe_auto` where mechanical, all `gated_auto` where contract-touching).
- The real win is **variance reduction on ambiguous cases** — particularly orphan code without explicit "no callers" annotation, where the baseline rubric produces essentially random classification (manual / safe_auto / gated_auto across 4 trials on the same fixture).
- The tightened rubric trades one stable disagreement: cross-file Rails service extraction goes from baseline `safe_auto` (4/4) to tightened `gated_auto` (6/7). Both classifications are internally defensible. Tightened is the more conservative reading and matches what a careful operator would want before an auto-apply.

The shipped change is mostly a determinism patch, not a safe_auto-rate increase. Two methodological lessons generalize beyond this calibration: **measure variance, not just classification-rate-shift**, and **a synthetic-fixture eval harness is the right tier between "ship and watch" and "stare at the diff"**. Both are written up in dedicated sections below.

---

## Context

[`ce-code-review`'s subagent template](../../plugins/compound-engineering/skills/ce-code-review/references/subagent-template.md) classifies each finding into one of four `autofix_class` buckets — `safe_auto`, `gated_auto`, `manual`, `advisory` — that govern downstream fixer dispatch. Headless mode auto-applies only `safe_auto`; everything else surfaces for user routing.

Issue #686 cited an incident pre-#685 ("8 findings ended up in tickets that should have been fixes") and inferred personas were too conservative on `safe_auto`, pushing genuinely-mechanical fixes into `gated_auto` or `manual`. PR #685 fixed the LFG defer-bias directly via `suggested_fix` propagation. #686 asked: should we also tighten the `safe_auto` boundary so more findings flow into auto-apply?

---

## What the eval probed

9 fixtures across distinct finding shapes, run on both the post-#685 baseline subagent template and a tightened version. Single-persona dispatches (correctness / maintainability / testing / security depending on fixture). 60 total trials across 5 iterations:

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

---

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

---

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

---

## What shipped

Two files changed:

1. **`subagent-template.md` (autofix_class decision guide, ~138-160).** Net +14 lines, −6 lines.
   - One-sentence "symmetry of wrong-side cost" framing at the top.
   - Replaced "without design judgment" with an operational test: one-sentence fix, no "depends on" clauses, no change to function signature / public-API contract / error contract / security posture / permission model.
   - Added a "Boundary cases that often feel risky but are still safe_auto" subsection covering nil guards, off-by-ones, dead code, helper extraction (with the cross-file discriminator that pins F4b to gated_auto when placement is design-shaped).
   - Added "do not default to gated_auto" parallel to the existing "do not default to advisory" anti-pattern guard.

2. **`findings-schema.json` (autofix_class field description).** Replaced terse "Reviewer's conservative recommendation" with an operational summary that mirrors the subagent-template wording.

---

## Methodological lesson 1: variance reduction beats classification-rate-shift

The headline lesson generalizes beyond `autofix_class`. When evaluating any persona-rubric change, **measure variance reduction on ambiguous fixtures first; treat classification-rate shifts on textbook fixtures as a noise-prone third-tier signal.**

### The hierarchy of evidence

1. **First-order signal — variance reduction on ambiguous fixtures.** Run each ambiguous cell at least N=3 trials per version, bumping to N=7+ if N=3 still looks noisy. Measure: how many distinct classifications does each version produce across trials on the same input? A baseline that emits 3 different classes across 4 trials, paired with a tightened version that pins to one class across 7 trials, is a clear win — independent of *which* class the tightened version chose.
2. **Second-order signal — stable disagreements on boundary cases.** A cell where baseline gives `X` consistently and tightened gives `Y` consistently is a real trade-off, not noise. Both readings may be defensible; the question becomes "which is the right side to land on?" — a judgment call, but a legible one.
3. **Third-order signal — classification-rate shifts on textbook cases.** This is the noisiest, lowest-value signal because synthetic textbook fixtures don't move on a well-tuned model. If your only "win" is rate-shifts on textbook cases, you are likely measuring noise.

### Why N=1 synthetic-fixture evals mislead

Persona dispatches over the same input can produce different classifications across runs because the rubric's prior wording was genuinely ambiguous, not because the model is broken. On synthetic fixtures the temptation to read N=1 is especially strong — the fixture *feels* deterministic, so one trial *feels* sufficient. It isn't.

In this calibration, two early N=1 reads produced two confidently-wrong conclusions in succession — first "the tightened rubric has no effect," then "the tightened rubric is causing a wrong-direction regression." Both reversed at N=3 and resolved cleanly only at N=4 to N=7 on the noisy cells.

The mechanism: F3b at the baseline samples from a tri-modal distribution {manual, safe_auto, gated_auto}. Two single-trial reads on the same prompt pair on the same fixture can therefore produce wildly different stories:

- (baseline=safe_auto, tightened=gated_auto) → "regression: tightening pushed a safe_auto into gated_auto"
- (baseline=manual, tightened=gated_auto) → "improvement: tightening pulled a manual into gated_auto"
- (baseline=gated_auto, tightened=gated_auto) → "no effect"

All three reads are sampled from the same prompt pair on the same fixture. Only the variance summary tells the truth: baseline is essentially random on this input; tightened is pinned. That's the win.

### Practical rules

- **Never trust N=1 on a synthetic fixture for a directional read.** Treat single-trial reads as "do the dispatches even run end-to-end?" smoke checks, not behavior measurements.
- **N=3 is the floor; bump until variance stops moving.** If three trials disagree, run more trials *before* running more fixtures. The bottleneck for a confident read is depth on the noisy cell, not breadth across new cells.
- **Aggregate variance explicitly in the summary table.** A row like `F3b: baseline manual / safe_auto / gated_auto / safe_auto (4 trials, 3 distinct classes)` tells the reader something a single-class summary cannot.
- **Treat reduction in *number of distinct classes per cell* as the headline metric for prompt-tightening changes.** This is the determinism win, and it's what justifies the prompt's added token cost.
- **Keep a negative control fixture** that should not move at all — if it moves under either version across trials, the rubric has a stability problem the calibration is masking.

### When the lens applies

Apply the variance-first lens when the eval is on synthetic fixtures (no ground-truth label), the rubric outputs into a small number of discrete buckets, or the change is motivated by an incident report claiming systematic mis-classification. The lens applies less when you have ground-truth labels (rate-shift against truth becomes meaningful) or when the rubric outputs free-text rather than a discrete bucket.

A related precedent in this repo: [`docs/solutions/skill-design/ce-doc-review-calibration-patterns-2026-04-19.md`](./ce-doc-review-calibration-patterns-2026-04-19.md) has a "Reviewer variance is inherent; single runs aren't baselines" section warning the same thing, scoped to ce-doc-review's tier classification. The principle generalizes: any persona-rubric eval needs N≥3 minimum on cells where the rubric is plausibly ambiguous.

---

## Methodological lesson 2: validating persona-rubric prompt changes before shipping

A reusable harness pattern for evaluating any subagent-template / persona-prompt change before merge.

### The gap this fills

There is a tier between "ship the prompt and watch real reviews" (slow, low signal, mixes in synthesis-layer effects) and "stare at the diff and reason about it" (no signal). The pattern below fills that tier with a lightweight, scriptable harness that holds everything constant except the prompt under test.

### Workspace pattern (reproduces the safe_auto eval; reusable as-is)

```
/tmp/<eval-name>/
  fixtures/
    F<N>-<short-label>/
      fixture.json        # id, intent, expected outcome, metric, persona
      diff.patch          # the unified diff under review
      context/            # repo files visible as surrounding context (NOT in diff)
      files/              # post-change versions of touched files
  skill-snapshot/         # the BASELINE prompt(s), copied verbatim before any edits
  persona-runner-prompt.md
  iteration-1/
    F<N>-old_skill-trial-1/outputs/findings.json
    F<N>-with_skill-trial-1/outputs/findings.json
    ...
  iteration-2/
  ...
```

The `persona-runner-prompt.md` defines a strict contract every dispatch obeys: (1) read exactly the four input paths (subagent template, persona profile, diff, context dir), (2) do not fall back to any other version of the prompt, (3) stay in persona, (4) write findings JSON to the specified `OUTPUT_PATH`, (5) no prose in the dispatch reply. This is what makes the workspace reproducible — every cell behaves identically except for the parameters you vary.

### Steps to apply

1. **Snapshot the baseline first.** Before editing the prompt, copy the current version to `skill-snapshot/`. Treat this directory as immutable for the duration of the eval.
2. **Build a fixture matrix that spans the boundary, not just the easy cases.** Include textbook positives, textbook negatives, an explicit negative control that should not move, and at least two boundary cases that you genuinely cannot predict. Each fixture gets a tiny `fixture.json` documenting intent and expected outcome — this prevents post-hoc rationalization.
3. **Spawn cells via parallel Agent dispatches.** Pass the four paths and a unique `OUTPUT_PATH` per cell. Use a simple naming scheme (`F3b-old_skill-trial-2`) so aggregation is `jq` over a glob.
4. **Run multiple trials per cell.** Three is the practical minimum; bump to seven or more on cells that look noisy at N=3. (See the variance lesson above for the full argument.)
5. **Aggregate with `jq` over the structured field under test** (e.g. `jq '.findings[0].autofix_class'` across iteration directories). Build a summary table indexed by fixture and prompt version.
6. **Iterate, then re-snapshot if the prompt changes again.** Each iteration directory is a separate run; `iteration-N` lets you compare across prompt revisions without losing earlier data.

### Fixture matrix design (generalize the shape, not the content)

| Fixture role | What it probes | Example from this eval |
|---|---|---|
| Textbook positive | Should classify the "right" way under both versions | F1 nil guard inside internal helper |
| Textbook negative | Should classify the "wrong-direction" way under both versions | F2 off-by-one with parallel pattern |
| Explicit negative control | Must not move; if it moves, the prompt has a regression | F6 admin auth gate |
| Ambiguous boundary | The reason the eval exists — outcome unknown a priori | F3b orphan code without "no callers" comment |
| Stable disagreement candidate | Both versions defensible; you want to see the trade clearly | F4b cross-file Rails service extraction |

### Reproducibility

Workspace: `/tmp/safe-auto-eval/` (synthetic fixtures, snapshot baseline, persona-runner prompt, per-iteration outputs).

To re-run for a different rubric change:
1. Snapshot the current `subagent-template.md` (or other persona prompt) to `/tmp/<eval-name>/skill-snapshot/`
2. Reuse the persona-runner pattern in `/tmp/safe-auto-eval/persona-runner-prompt.md`
3. Spawn one Agent dispatch per cell × trial, parameterized by SUBAGENT_TEMPLATE_PATH (current vs snapshot) + PERSONA_PATH + DIFF_PATH + FILES_DIR + CONTEXT_DIR
4. Aggregate via `jq '.findings[0].<field>'` across iteration directories

The fixtures themselves (`/tmp/safe-auto-eval/fixtures/F{1,1b,2,3,3b,4,4b,5,6}/`) are kept for reproducibility but are not committed — they're synthetic eval scaffolding, not part of the plugin.

### When to apply this pattern

Use the harness when:

- A persona rubric, decision guide, or output-contract section is being edited, and the change is intended to alter classification behavior.
- The rubric drives downstream automation (auto-apply gates, fixer dispatch, escalation routing) where wrong classification has real cost.
- "Just ship it and watch" is too slow or too risky because the change touches headless or auto-apply paths.
- A reported incident motivated the change and you want to validate the hypothesis before shipping (the safe_auto calibration is exactly this case — Issue #686 hypothesized under-classification; the eval falsified that hypothesis but surfaced a different real problem worth fixing).

Skip or downscale when the change is purely textual (typo, link fix), gated behind a feature flag with low cost-of-bad-ship, or when a real-branch test gives equally clean signal at similar cost (rare for persona-layer changes).

---

## Related

- PR #685 — `fix(ce-code-review): replace LFG with best-judgment auto-resolve` (the suggested_fix push this builds on)
- Issue #686 — the calibration request that prompted the eval
- [`docs/solutions/skill-design/confidence-anchored-scoring-2026-04-21.md`](./confidence-anchored-scoring-2026-04-21.md) — prior art for eval-as-validation in this repo; established the A/B-against-baseline pattern this generalizes
- [`docs/solutions/skill-design/ce-doc-review-calibration-patterns-2026-04-19.md`](./ce-doc-review-calibration-patterns-2026-04-19.md) — see the "Reviewer variance is inherent; single runs aren't baselines" section, which warns of the same N=1 trap scoped to ce-doc-review's tier classification
