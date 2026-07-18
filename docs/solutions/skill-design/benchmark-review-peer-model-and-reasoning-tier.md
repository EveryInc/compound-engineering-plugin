---
title: "Benchmark a cross-model review peer's model and reasoning tier with reversed real bugs and a detection-vs-assertion judge"
date: 2026-07-18
category: skill-design
module: ce-code-review cross-model adversarial peer
problem_type: design_pattern
component: testing_framework
severity: medium
applies_when:
  - Choosing or changing the model or reasoning tier a skill dispatches a peer/subagent on
  - Evaluating a "cheaper and faster at similar quality" claim about a candidate model
  - Any peer or subagent whose output is graded for whether it caught something
related_components:
  - tooling
  - ce-doc-review
tags:
  - skill-eval
  - cross-model
  - reasoning-effort
  - benchmark
  - non-inferiority
---

# Benchmark a cross-model review peer's model and reasoning tier with reversed real bugs and a detection-vs-assertion judge

## Context

ce-code-review dispatches an adversarial-reviewer persona to a peer model (a
different serving family than the host). Two knobs — which model and which
reasoning tier — had been set editorially ("one model per provider at HIGH
reasoning"), never measured. When an external benchmark claimed a cheaper, faster
sibling model matched quality, there was no cheap, honest way to decide whether to
switch, and no evidence that "high" reasoning bought quality worth its cost. A good
answer has to isolate the *model/tier* variable from the surrounding orchestration
and produce a decision, not a vibe.

## Guidance

Benchmark the model on the **exact peer task**, not the whole skill, and structure
it as a non-inferiority test.

1. **Isolate at the peer-worker layer.** Drive the peer's real invocation (same
   persona prompt, same input diff, same sandbox, same output schema) and swap
   *only* the model id and reasoning tier. This removes orchestration as a
   confounder — you are measuring the model on the persona's job, nothing else.
2. **Frame as non-inferiority, not a bake-off.** A "cheaper/faster" candidate wins
   only if quality stays within a pre-registered margin of the baseline. Speed and
   cost are near-deterministic and cheap to confirm; quality is the only real risk,
   so the whole question reduces to "is the candidate's quality non-inferior?"
3. **Build ground truth from reversed real bug-fixes.** For a real fix commit `C`,
   `git diff C C^` (restricted to the code file, excluding tests/changelog that
   name the bug) is a patch that **re-introduces** the exact defect the fix
   removed. Review that patch: a good reviewer flags the reintroduced bug, whose
   identity you know from `C`'s message. Cheap, realistic, and self-labeling.
   Supplement with a few seeded synthetic bugs for a controlled difficulty gradient
   and a clean-diff false-positive floor.
4. **Judge detection and assertion as separate metrics.** A blind judge (a non-arm
   model family, arms shuffled and unlabeled, majority vote over passes) scores
   each review as **finding** (asserted), **flagged risk** (hedged into a
   residual-risks / lower-priority channel), or **missed**. Report **detection**
   (surfaced anywhere = finding or flagged) separately from **assertion**
   (committed as a finding). Collapsing these into a findings-only score is the
   trap that produces a wrong verdict — see Why This Matters.
5. **Run trials and report medians.** Reviews are nondeterministic; a single run per
   cell cannot support a non-inferiority claim. Use n≥5 per (arm × diff) for a
   decision, plus a multi-vote judge. Report **median** tokens/latency — the
   high-reasoning tier has an expensive tail on hard diffs that inflates the mean.
6. **Pre-register the decision rule**, then confirm generality with a cross-language
   spot-check (same method, a second and third language in the same domain). A tie
   that holds across languages is a decision; a tie in one language is a lead.

## Why This Matters

- **Findings-only scoring conflates detection with assertiveness.** In this eval the
  candidate model repeatedly *detected* a vulnerability but hedged it into a
  residual-risk ("cannot confirm from the diff alone") instead of asserting a
  finding — defensible, since some reversed bugs genuinely cannot be proven from the
  diff. Scored on findings only, it looked far worse (e.g. 50% vs a true 79%
  detection) than it was. The detection-vs-assertion split is what keeps an
  epistemically cautious model from being unfairly killed, and what keeps an
  over-asserting model from looking better than it is.
- **Isolation is what makes the number trustworthy.** Benchmarking the whole skill
  mixes model quality with routing, disclosure, and dispatch — you cannot attribute
  a regression. Swapping only `-m`/effort on the real peer invocation attributes it.
- **Median, not mean.** The high tier's cost is dominated by a few very expensive
  hard-diff runs; the mean overstated savings by ~2x versus the median. The robust,
  defensible cost figure is the median.
- **The payoff is asymmetric.** The whole benchmark is cheap relative to the
  engineering it guides, and it caught that the *reasoning tier*, not the model, was
  the real cost lever — dropping the peer from high to medium reasoning held quality
  within noise at ~30-70% lower token cost, while the cheaper candidate model was
  rejected for weaker detection. The intuition ("high reasoning is worth it") was
  wrong and only a measurement showed it.

## When to Apply

- Setting or changing the model or reasoning tier for any skill that dispatches to a
  model (cross-model peers, graded subagents, judge/oracle panels).
- Any time a "cheaper/faster, same quality" claim needs to be believed or refuted on
  *your* task rather than a generic benchmark — model leaderboards do not measure
  your persona on your inputs.
- Not needed for a pure cost/latency change with no quality surface (those two axes
  are near-deterministic; a handful of runs confirms them).

## Examples

Reversed-fix corpus construction (the `+` side re-introduces the bug):

```bash
# C is a real bug-fix commit; review the patch that undoes it, code file only.
git -C repo diff <C> <C>^ -- path/to/file.js | grep -vE '^index ' > corpus/<bug>.diff
```

Judge output per review, kept channel-aware so hedging is scored fairly:

```
finding   -> asserted in the findings[] array
flagged   -> only in residual-risks / testing-gaps (detected but hedged)
missed    -> the specific defect is not identified anywhere
detection% = (finding + flagged) / n     assertion% = finding / n
```

Isolation: the arm differs only in the two swapped tokens on the real invocation —

```
codex exec ... -m gpt-5.6-sol   -c 'model_reasoning_effort="high"'    # baseline
codex exec ... -m gpt-5.6-sol   -c 'model_reasoning_effort="medium"'  # tier candidate
codex exec ... -m gpt-5.6-terra -c 'model_reasoning_effort="high"'    # model candidate
```

Concrete result shape (real bugs, blind 3-vote judge, medians), showing the tier
drop is a near-free win and the model swap is not:

| arm | detection | assertion | median tokens |
|---|---|---|---|
| sol high | 94-100% | 84-100% | 170k-616k |
| sol medium | 92-100% | 82-100% | 118k-189k |
| terra high | 67-100% | 67-100% | 70k-130k |

Full write-up and the shareable chart:
`docs/plans/2026-07-18-adversarial-peer-benchmark-report.md`; running phase log:
`docs/plans/2026-07-17-001-eval-cross-model-peer-model-config.md`. Runnable harness
(re-run when models change): `github.com/tmchow/cross-model-peer-eval` (private).
(Tier change applied in the working tree at time of writing; not yet merged.)

## Related

- `docs/solutions/skill-design/fake-cli-harness-for-skill-judgment-evals.md` —
  faking peer CLIs to eval *orchestration* correctness; complementary to this
  *quality/cost* benchmark of the real model behind the peer.
- `docs/solutions/skill-design/paired-old-vs-new-injection-skill-evals.md` —
  non-inferiority framing for skill *prose* changes; same "tie vs improvement"
  discipline applied to a model/tier change.
- `docs/solutions/skill-design/confidence-anchored-scoring.md` — judge-scoring
  rigor that pairs with the detection-vs-assertion split here.
- `docs/solutions/skill-design/requested-vs-verified-model-identity.md` — verifying
  which model actually served a cross-model run (the receipt layer this eval swaps
  models within).
