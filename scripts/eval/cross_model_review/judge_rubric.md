# Blinded judge rubric (U5)

The orchestrator dispatches this judge **per finding, independently** — never batched.
Batching lets the judge pattern-match across findings and recreates the cross-finding bias
blinding exists to escape (H3 / per `confidence-anchored-scoring`).

The judge sees only the label-stripped finding (`run_arms.py strip-labels` removes arm,
trial, latency, model, cost, producer, status). It must not be told which arm produced it.
Disclose the judge's own model family in the result; if it shares a family with any arm
(e.g., a Claude judge over the Claude baseline / self-critic), flag the run as a
blind-integrity risk and run the integrity probe below.

## Per-finding classification

Classify each finding on three axes:

- **uniqueness**: `unique` | `duplicate` (of another finding in the same document's pool)
- **actionability**: `actionable` | `generic` (a generic "be careful" / "ensure X" with no
  specific, addressable claim is `generic`)
- **decision-changing**: `decision_changing` | `not` — would acting on this finding change
  the plan/implementation decision? On the known-failure subset, the bar is: does it
  surface the issue the post-hoc failure proved mattered?

Score confidence on the discrete anchors only — **0, 25, 50, 75, 100** (no continuous
values, no "high"/"medium"/"low"). Anchors:

- `100` — certain; evidence in the finding directly confirms it.
- `75` — double-checked; a competent implementer/reader concretely hits this.
- `50` — verified but advisory ("nothing breaks, but…"); not decision-changing on its own.
- `25` / `0` — not confident / false positive — do not surface.

Only findings at `75`/`100` that are `unique` and `actionable` are eligible to be
`decision_changing`; the human confirms these (and samples the judge-rejected set) in U6.

## Blind-integrity probe (R5)

After classification, ask the judge to guess each finding's arm. Feed the guesses to
`run_arms.py integrity-verdict <correct> <total> <n_arms>`. If `confounded` is true (the
judge identifies arms above chance), the per-arm metric is treated as confounded and the
decision is `inconclusive`, not a build/no-build call.
