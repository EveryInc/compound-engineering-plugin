---
module: cross-model-review-eval
tags: [evaluation, code-review, cross-model, decision-grade, judge]
problem_type: decision-record
---

# Cross-model critique — decision-grade run (decision record)

The first run with all four decision-grade guards on at once: a **non-Claude blind judge**
(codex), **3 trials per arm**, a pre-registered decision rule, and the negative-control +
yield precision checks. Corpus: a private code-review corpus of 10 known-failure culprit
diffs (each paired with the historical fix that proved the bug mattered) + 1 behavior-
preserving negative control. Target specifics omitted — public repo.

## Outcome: inconclusive / underpowered (by design)

Pre-registered `minimum_corpus_n = 20`; the confirmed corpus is 10, so the R9 safeguard
fires and the run reports `inconclusive` rather than a confident build/kill. This is the
guard working, not a failure — a 10-item corpus can't carry a confident verdict, and the
pre-registration prevents an underpowered run from masquerading as one.

## Primary signal — GT-match (validated), best-of-3-trials per doc

| Arm | GT hits /10 | Caught a bug NO other arm caught |
|-----|-------------|----------------------------------|
| baseline (Claude) | 1 | — |
| cross-model, isolated (codex) | 2 | yes (1) |
| cross-model, +context (gemini) | 4 | yes (1) |
| self-critic (Claude) | 3 | — |

Union across all arms: **5/10** known bugs caught by someone. The decisive result: **each
cross-model arm uniquely surfaced a validated bug that neither Claude arm caught** — grounded
in the actual historical fix, not plausibility. On this corpus, under a fair non-Claude
judge, the cross-model lever **decorrelates and adds GT coverage the Claude panel misses.**
The self-critic (Claude, fresh adversarial pass) also beat the baseline (3 vs 1), but caught
nothing the cross-model+context arm didn't.

## Finding yield — and its precision caveat

Yield (judge-classified unique-actionable findings, 11 docs × 3 trials): baseline 11,
codex 45, gemini **134**, self-critic 18. The cross-model arms produce far more — but yield
is **judge-plausibility, not code-verified truth**: the code-blind judge can confirm a finding
is *specific and plausible*, not that it is *real*. gemini's volume is the precision-suspect
one (it confabulated on the negative control in an earlier run). The negative control here was
clean for all arms (the judge rejected all control findings, 0 false positives) — but that
only catches blatant confabulation. **Raw yield must still be precision-weighted by
human spot-verification** before it ranks arms; this run did not do that.

## Validity checks

- **Negative control:** did not move (0 decision-changing findings on the control, all arms).
- **Blind judge:** held by construction (the judge saw finding text + ground-truth bug, never
  the arm; arms re-attached afterward via `gt-resolve`).
- **Judge-family overlap (disclosed limitation):** with only codex/gemini as non-Claude CLIs,
  any non-Claude judge shares a family with one cross-model arm — codex-judge overlaps the
  codex arm (b). No fully-disjoint judge is available; mitigated by the blind pool. A future
  run should cross-check with a gemini judge (overlaps c instead) and compare.
- **Power:** corpus_n 10 < pre-registered 20 → inconclusive.

## What this concludes (and doesn't)

- **Directionally, the lever looks worth building:** on validated outcomes, under a fair
  non-Claude judge across 3 trials, the cross-model arms catch real bugs the Claude arms miss,
  and the +context arm caught the most (4/10) — suggesting context, not just model diversity,
  carries weight.
- **It is not a confident build/kill.** It is underpowered (N=10 < 20), gemini's high yield is
  not code-verified, and the judge shares a family with one arm.
- **A confident verdict needs:** a larger human-confirmed known-failure corpus (≥ the
  pre-registered floor), human precision-verification of a finding sample (true-positive rate
  per arm, not judge plausibility), and a judge cross-checked across families.

If a build proceeds on the directional signal, the winning shape is **cross-model + fixed
context** (arm c) — the highest GT coverage — with codex as the higher-precision, lower-volume
alternative and gemini's yield gated behind precision verification.
