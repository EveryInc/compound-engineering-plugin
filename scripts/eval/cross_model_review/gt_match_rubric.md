# GT-match rubric (code-review breakpoint)

The sharper known-failure metric a concrete fix commit unlocks. Where plan review can only
forward-rate whether a finding *looks* decision-changing, code review has a target: the bug
the fix proved mattered (`ground_truth.bug`). This rubric scores, per finding, whether the
arm surfaced **that** bug — the R7 primary signal, made objective.

Used only on the **known_failure** subset (documents that are culprit diffs with a
`ground_truth` block). Forward-rated and negative-control documents keep the
`decision_changing` classification in `judge_rubric.md`.

## Blinding (same contract as the main judge)

The judge sees the label-stripped finding only (`run_arms.py strip-labels`) — never the arm.
It is dispatched **per finding, independently**, never batched, so it cannot pattern-match
across an arm's findings. Per-finding verdicts are re-attached to arms afterward by
`run_arms.py gt-resolve` (which collapses to a per-(arm,doc) `gt_hit`); the arm is recovered
there, not exposed here. Disclose the judge's model family in the result; if it shares a
family with any arm, flag the run a blind-integrity risk and run the integrity probe.

## The match decision

Given one document's `ground_truth.bug` and one label-stripped finding, decide:

- `matches_bug: true` — the finding identifies the **same defect mechanism** the fix
  repaired. It must name the actual failure, not merely touch the same area.
- `matches_bug: false` — anything else.

Discipline (these are the failure modes that would inflate a hit rate):

- **Same file, different bug is not a match.** A finding flagging an unrelated issue in the
  culprit diff does not count, even if correct.
- **Generic caution is not a match.** "Validate inputs here" / "consider edge cases" does
  not match a specific bug unless it names the specific failure.
- **Surface-wording overlap is not a match.** Matching is on the defect, not shared nouns
  with the bug string.
- **Right mechanism, partial specificity can match.** If the finding correctly identifies
  the failure the fix addressed (e.g. "this UNION mixes collations and will error at
  runtime"), it matches even if worded differently from the fix subject.

Score confidence on the discrete anchors only — **0, 25, 50, 75, 100**. Only `75`/`100`
verdicts are eligible to be `matches_bug: true`; `50` and below are `false`.

## Output

One verdict per finding:

```json
{ "doc_id": "kf-7a6c84d", "finding_id": "f3", "matches_bug": true, "confidence": 100 }
```

Feed the verdicts to `run_arms.py gt-resolve <records.json> <verdicts.json>` to produce
per-(arm,doc) `gt_hit`, then `run_arms.py gt-score <manifest.json> <arm-matches.json>` for
the per-arm known-failure hit counts. Per R6, the human confirms the `true` verdicts and
samples the `false` set before the result is trusted — `trust: needs_confirmation` Tier-3
corpus items make this confirmation non-optional.
