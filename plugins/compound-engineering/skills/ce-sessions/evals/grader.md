# ce-sessions terminology-preservation grader

This grader evaluates whether ce-sessions findings preserve enough terminology resolution context to make downstream vocabulary capture (ce-compound Phase 2.4) work. It is NOT a general quality grader for ce-sessions; the narrow question is "would Phase 2.4 be able to extract qualifying domain terms from these findings?"

## Inputs to the grader

For each eval run, the grader receives:

1. **The eval definition** from `evals.json` (terms, tiers, expected_context, notes).
2. **The findings text** that ce-sessions returned to the orchestrating agent.
3. **(Optional) The full agent transcript** for the ce-sessions invocation, if available — useful for distinguishing "ce-sessions returned this and the agent paraphrased it" from "ce-sessions returned this verbatim."

## Two-stage grading

### Stage 1 — Programmatic term recall (substring match)

For each entry in `expected_terms`:
- Score 1 if the term (case-insensitive, substring match) appears anywhere in the findings text.
- Score 0 otherwise.

Aggregate by tier:
- `must_recall` = (count of must-tier terms scored 1) / (total must-tier terms)
- `should_recall` = (count of should-tier terms scored 1) / (total should-tier terms)
- `may_recall` = (count of may-tier terms scored 1) / (total may-tier terms)

**Stage 1 pass criterion:** `must_recall == 1.0` (every must-tier term appears).

If Stage 1 fails, ce-sessions is dropping the most distinctive coined terms — synthesis loss is severe and Stage 2 is moot. Record the failure and stop.

### Stage 2 — Context preservation (LLM-graded)

For each entry in `expected_context`:

Read the findings text. Decide whether the expected context item is **preserved with rationale** or **mentioned without context**. Apply this rubric:

- **`preserved` (1.0)** — the finding text discusses the term AND its meaning, role, or the reasoning behind it. Example: "synthesis gate was introduced to prevent ce-plan from silently proceeding past synthesis without showing the user a Stated/Inferred/Out of scope summary."
- **`keyword_only` (0.0)** — the finding mentions the term but in a way that doesn't convey why it matters or what it means. Example: "the user worked on the synthesis gate."
- **`absent` (0.0)** — the term doesn't appear in the relevant section at all.

**Stage 2 pass criterion:** every entry in `expected_context` scores `preserved`.

For eval id #4 (near-miss-false-positive), Stage 2 instead checks `must_not_contain_in_relevant_findings`:
- For each `must_not` entry, search the findings.
- If the entry appears **as a relevant result** (not, e.g., as a "not relevant — different context" caveat), Stage 2 fails.
- "Not relevant" mentions are fine; surfacing the ce-compound feature PR work as if it answered a CI/CD deployment query is the failure mode.

## Aggregating across runs (variance)

For each eval, run the prompt N times (default 3 from `variance_protocol.runs_per_eval`).

Per run, capture:
- `must_recall`, `should_recall`, `may_recall` from Stage 1
- `context_preservation_rate` from Stage 2 (count preserved / count expected_context)
- `stage_1_pass` (bool), `stage_2_pass` (bool)

Per eval, compute:
- `mean_must_recall`, `stddev_must_recall`
- `mean_context_preservation`, `stddev_context_preservation`
- `runs_passed` (count where both stage_1_pass and stage_2_pass were true)

**Eval-level pass criteria:**
- `mean_must_recall >= 0.80`
- `stddev_must_recall < 0.20`
- `runs_passed >= 2 of 3` (or proportionally for higher N)

## Outputs

Write per-run grades to `<workspace>/iteration-N/eval-<ID>/grading.json`:

```json
{
  "eval_id": 1,
  "eval_name": "synthesis-gate-recovery",
  "run_index": 0,
  "stage_1": {
    "must_recall": 1.0,
    "should_recall": 0.83,
    "may_recall": 0.33,
    "passed": true,
    "matched_terms_by_tier": {
      "must": ["synthesis gate", "ce-plan"],
      "should": ["Phase 0.7", "Stated", "Inferred", "Out of scope", "Phase 5.1.5"],
      "may": ["synthesis-summary.md"]
    },
    "missed_terms_by_tier": {
      "should": ["call-outs"],
      "may": ["silent proceeding is not allowed"]
    }
  },
  "stage_2": {
    "context_results": [
      {"item": "synthesis gate purpose preserved", "verdict": "preserved", "evidence": "<quoted snippet from findings>"},
      {"item": "Stated/Inferred/Out of scope as buckets", "verdict": "keyword_only", "evidence": "<quoted snippet>"}
    ],
    "context_preservation_rate": 0.5,
    "passed": false
  },
  "overall_passed": false
}
```

Then aggregate across runs to a per-eval summary at `<workspace>/iteration-N/eval-<ID>/summary.json`.

## Surfacing the three risks separately

The eval design separates signal so a failure points at one risk:

| Risk | Signal | Where it surfaces |
|------|--------|-------------------|
| Synthesis loss (distinctive terms dropped) | Stage 1 must-tier fails on eval #1 or #2 | grading.json `stage_1.must_recall < 1.0` |
| Synthesis loss (nuance lost, term kept) | Stage 1 passes, Stage 2 fails on eval #1 or #2 | grading.json `stage_1.passed: true, stage_2.passed: false` |
| Indexing gap (tangential terminology not surfaced) | Eval #3 fails Stage 1 should-tier | grading.json eval-3 `should_recall == 0` despite related sessions existing |
| Variance | Same eval passes on some runs, fails on others | summary.json `stddev_must_recall >= 0.20` or `runs_passed < N` |
| False positive | Eval #4 surfaces the ce-compound mode:headless work as relevant to CI/CD deployment query | grading.json eval-4 `stage_2.passed: false` |
