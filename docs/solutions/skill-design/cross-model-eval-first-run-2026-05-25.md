---
module: cross-model-review-eval
tags: [evaluation, code-review, cross-model, corpus, blinding]
problem_type: workflow-pattern
---

# Cross-model eval — first code-review run (decision record)

First end-to-end run of the code-review breakpoint (`scripts/eval/cross_model_review/`)
against a private internal codebase (~200 `fix:` commits). Target details are deliberately
omitted — this repo is public. The run is a **mechanics validation**, not a decision-grade
result.

## Outcome: inconclusive (correctly)

Single trial, a non-blind same-family judge, and a loosely-built corpus all hold below the
bar for a real decision. The pipeline reported `inconclusive` rather than a count-driven
`build_nothing` — the safeguards (pre-registration, blind-integrity gate, human override)
fired as designed. A naive read of the raw counts would have been the exact "measure
activity not outcomes" trap the eval exists to prevent.

Per-arm GT-match hits (10 known-failure docs, 1 trial): baseline 0, cross-model-isolated 1,
cross-model-context 0, self-critic 1.

## What the run actually taught (the value)

1. **Decorrelation showed real signal.** The cross-model arm and the same-model self-critic
   each surfaced a *different* known bug that every other arm — including the baseline —
   missed. Even same-model "fresh adversarial pass" decorrelates from the baseline. This is
   the first concrete evidence the lever might pay off, and it justifies a real (blinded,
   multi-trial, clean-corpus) run.

2. **External-CLI arms are not uniformly viable.** One cross-model CLI returned usable,
   specific findings; the other returned unusable output (it emitted its own CLI's internal
   monologue instead of a review). Per-CLI viability must be smoke-checked before a CLI is
   trusted as an arm — a configured arm can silently no-op.

3. **Harness bug found and fixed: cross-arm credit bleed.** GT-match verdicts were keyed on
   `(doc_id, finding_id)`, but finding ids are only local to a record, so one `matches_bug`
   verdict credited *every* arm that reused a local id like `f1`. Fixed by pooling findings
   under arm-opaque, globally-unique uids (`gt_pool` / `gt_hits_from_verdicts`); the judge
   still never sees the arm. Regression-tested.

4. **Tier-3 auto-corpus needs a quality gate.** Blame-built corpora collapsed multiple
   distinct fixes onto a single large culprit commit (10 docs -> 6 distinct diffs; one
   culprit was a ~150k-line foundational commit), and the fix's target bug was frequently
   *not* the most salient defect in the (huge) culprit diff — so arms found real bugs that
   weren't the GT bug, depressing the hit rate for corpus reasons rather than arm quality.
   `build_corpus` should cap culprit-diff size, exclude foundational/import commits, require
   blame to a small recent commit, and dedup docs sharing a culprit.

## Process constraint discovered

The agent harness **hard-blocks** sending a private codebase's diffs to external model CLIs
(data exfiltration) — user authorization in-session does not clear it. Cross-model arms over
proprietary code must be run by the user on their own machine, or the eval must use a public
corpus. The in-process arms (baseline, self-critic) have no egress and run normally.

## Next steps for a decision-grade run

- Add the `build_corpus` quality gate above, then rebuild a tighter corpus.
- Run blinded (judge does not see arms) with `trials_per_arm >= 3` and a non-Claude judge to
  clear the blind-integrity confound.
- For the cross-model arms specifically, use a public repo (or user-run egress).
