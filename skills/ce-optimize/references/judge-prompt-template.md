# Judge Evaluation Prompt Template

This template is used by the orchestrator to dispatch batched LLM-as-judge evaluation calls. Each judge sub-agent evaluates a batch of sampled output items and returns structured JSON scores.

The orchestrator:
1. Reads the experiment's output
2. Selects samples per the stratification config (using fixed seed)
3. Groups samples into batches of `judge.batch_size`
4. Dispatches `ceil(sample_size / batch_size)` parallel sub-agents using this template
5. Aggregates returned JSON scores

---

## Item Evaluation Template

```
You are a quality judge evaluating output items for an optimization experiment.

Your job is to score each item using the rubric below and return structured JSON. Be consistent and calibrated -- the same quality level should get the same score across items.

<rubric>
{rubric}
</rubric>

<items>
{items_json}
</items>

<output-contract>
Return ONLY a valid JSON array. No prose, no markdown, no explanation outside the JSON.

Each element must have:
- "item_id": the identifier of the item being evaluated (string or number, matching the input)
- All fields requested by the rubric (scores, counts, etc.)
- "feedback": one or two sentences naming what is wrong with this item and what change would fix it. For an item at the top of the scale, name what keeps it there. This text drives the next round of hypotheses, so name the defect, not the score.
- "ambiguous": true if you cannot confidently score this item (e.g., insufficient context, borderline case). When ambiguous, still provide your best-guess score but flag it.

Example output format (adapt field names to match the rubric):
[
  {"item_id": "cluster-42", "score": 4, "distinct_topics": 1, "outlier_count": 0, "feedback": "One PR about the release process sits among login issues; dropping it makes this a clean cluster.", "ambiguous": false},
  {"item_id": "cluster-17", "score": 2, "distinct_topics": 3, "outlier_count": 2, "feedback": "Three unrelated topics grouped on the shared word 'timeout'; splitting on the affected component would fix it.", "ambiguous": false},
  {"item_id": "cluster-99", "score": 3, "distinct_topics": 2, "outlier_count": 1, "feedback": "Two sub-topics (import and export failures) that could reasonably be one or two clusters.", "ambiguous": true}
]

Rules:
- Evaluate each item independently
- Score the same content the same way every time: the same item must receive the same score and the same fields on a repeat call
- Score based on the rubric, not on how other items in this batch scored
- If an item is empty or has only 1 element when it should have more, score it based on what is present
- For very large items (many elements), focus on a representative subset and note if quality varies across the item
- Every item in the batch MUST appear in your output
</output-contract>
```

## Singleton Evaluation Template

```
You are a quality judge evaluating singleton items -- items that are currently NOT in any group/cluster.

Your job is to determine whether each singleton should have been grouped with an existing cluster, or whether it is genuinely unique. Return structured JSON.

<rubric>
{singleton_rubric}
</rubric>

<singletons>
{singletons_json}
</singletons>

<existing-clusters>
A summary of existing clusters for reference (titles/themes only, not full contents):
{cluster_summaries}
</existing-clusters>

<output-contract>
Return ONLY a valid JSON array. No prose, no markdown, no explanation outside the JSON.

Each element must have:
- "item_id": the identifier of the singleton
- All fields requested by the singleton rubric (should_cluster, best_cluster_id, confidence, etc.)

Example output format (adapt field names to match the rubric):
[
  {"item_id": "issue-1234", "should_cluster": true, "best_cluster_id": "cluster-42", "confidence": 4},
  {"item_id": "issue-5678", "should_cluster": false, "best_cluster_id": null, "confidence": 5}
]

Rules:
- A singleton that genuinely has no match in existing clusters should get should_cluster: false
- A singleton that clearly belongs in an existing cluster should get should_cluster: true with the cluster ID
- High confidence (4-5) means you are very sure. Low confidence (1-2) means the item is borderline.
- Every singleton in the batch MUST appear in your output
</output-contract>
```

## Variable Reference

| Variable | Source | Description |
|----------|--------|-------------|
| `{rubric}` | Spec `metric.judge.rubric` | User-defined scoring rubric |
| `{items_json}` | Sampled output items | JSON array of items to evaluate (one batch worth) |
| `{singleton_rubric}` | Spec `metric.judge.singleton_rubric` | User-defined rubric for singleton evaluation |
| `{singletons_json}` | Sampled singleton items | JSON array of singleton items to evaluate |
| `{cluster_summaries}` | Experiment output | Summary of existing clusters (titles/themes) for singleton reference |

## Notes

- Written for the `cheap` judge tier by default (`metric.judge.model`) -- prompts are concise and well-structured for smaller models; the harness resolves the tier to a concrete model
- Where the dispatch surface exposes sampling controls, use the most deterministic setting available; the same item must score the same on a repeat call, which is what makes the run's judge cache and the calibration check valid
- The rubric is part of the immutable measurement harness -- the experiment agent cannot modify it
- The `feedback` field is required on every item. The orchestrator persists it under `judge.items[]`, groups it into the digest's failure themes, and generates hypotheses from those themes; a batch without feedback gives the loop nothing to act on
- The `ambiguous` flag on items helps the orchestrator identify noisy evaluations without forcing bad scores
- For singleton evaluation, the orchestrator provides cluster summaries (not full contents) to keep judge context lean
- Each sub-agent evaluates one batch independently -- sub-agents do not see each other's results
- **That independence is required, not merely preferred.** These scores decide accept or revert, so a judge must be a separate context from the one that authored the hypothesis and ran the experiment. Where no dispatch is available, block the judge pass rather than scoring inline. An orchestrator grading its own experiment is not a measurement.
