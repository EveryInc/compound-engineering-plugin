# Terminal Statuses

Terminal status enum is exact:

- `success`
- `failed`
- `unverified`
- `already_satisfied`
- `quality_verified_but_compound_failed`

No other terminal status is valid.

## Terminal Report

Every terminal report includes:

```json
{
  "terminal_status": "success | failed | unverified | already_satisfied | quality_verified_but_compound_failed",
  "plan_path": "string",
  "stable_review_base": "string",
  "manifest": {
    "created": [],
    "modified": [],
    "deleted": [],
    "temporarily_indexed": []
  },
  "stage_results": [],
  "verification": [],
  "review_attempts": [
    {
      "attempt": 1,
      "run_id": "string",
      "artifact_path": "string",
      "status": "string",
      "verdict": "string"
    }
  ],
  "finding_decisions": [],
  "compound": {
    "status": "completed | failed | skipped",
    "issues": []
  }
}
```

## Status Meanings

- `success` - implementation, simplification verification, clean review, final verification, and compounding all completed.
- `failed` - invalid input, missing composition contract, unsafe overlap, malformed stage output, failed verification, exhausted review attempts, no eligible finding after non-clean review, or unresolved actionable findings.
- `unverified` - implementation produced changes but no relevant verification command was available.
- `already_satisfied` - implementation proved the plan was already satisfied, with proof and identified files; simplify, review, and compound did not run.
- `quality_verified_but_compound_failed` - implementation quality gates passed, clean review passed, final verification passed, and only post-success compounding failed.
