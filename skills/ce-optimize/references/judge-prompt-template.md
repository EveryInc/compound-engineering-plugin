# Judge Evaluation Prompt Template

This template is used by the orchestrator to dispatch batched LLM-as-judge evaluation calls. Each judge sub-agent evaluates a batch of sampled output items and returns structured JSON scores.

---

## Item Evaluation Template

```
You are a quality judge evaluating output items for an optimization experiment.

Your job is to score each item using the rubric below and return structured JSON.

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
- "ambiguous": true if you cannot confidently score this item (e.g., insufficient context, borderline case). When ambiguous, still provide your best-guess score but flag it.

Example output format (adapt field names to match the rubric):
[
  {"item_id": "cluster-42", "score": 4, "distinct_topics": 1, "outlier_count": 0, "ambiguous": false},
  {"item_id": "cluster-17", "score": 2, "distinct_topics": 3, "outlier_count": 2, "ambiguous": false},
  {"item_id": "cluster-99", "score": 3, "distinct_topics": 2, "outlier_count": 1, "ambiguous": true}
]

Rules:
- Score each item against the rubric independently, not relative to how other items in this batch scored
- If an item is empty or has only 1 element when it should have more, score it based on what is present
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
