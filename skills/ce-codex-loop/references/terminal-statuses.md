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
  "raw_plan_argument": "string",
  "canonical_plan_path": "string",
  "plan_path": "string",
  "stable_review_base": "string",
  "planned_scope": {
    "created": [],
    "modified": [],
    "deleted": [],
    "test_paths": []
  },
  "reviewed_manifest": {
    "created": [],
    "modified": [],
    "deleted": [],
    "temporarily_indexed": []
  },
  "manifest_checkpoints": [
    {
      "label": "string",
      "manifest": {
        "created": [],
        "modified": [],
        "deleted": [],
        "temporarily_indexed": []
      },
      "validated": true
    }
  ],
  "compound_outputs": {
    "created": [],
    "modified": [],
    "deleted": []
  },
  "final_repository_delta": {
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

`plan_path` is the terminal-report alias for `canonical_plan_path`. `raw_plan_argument` is recorded for audit only and must not be used for review correlation comparisons.

`reviewed_manifest` is the exact refreshed loop-owned manifest supplied to the final `ce-code-review mode:agent` attempt. It contains only files that were included in simplification, review, review-followup, and final code verification.

`manifest_checkpoints` records every refreshed manifest used at orchestration gates. The checkpoint immediately before the final review attempt must equal `reviewed_manifest`.

`compound_outputs` is captured by comparing repository state immediately before and after the single `ce-compound mode:headless` invocation. These paths are post-review outputs and must not be represented as reviewed.

`final_repository_delta` is the complete repository delta from the initial workflow snapshot to terminal completion. It may contain both reviewed implementation files and later permitted compound outputs.

## Status Meanings

- `success` - implementation, simplification verification, clean review, final verification, and compounding all completed.
- `failed` - invalid input, missing composition contract, unsafe overlap, malformed stage output, failed verification, exhausted review attempts, no eligible finding after non-clean review, or unresolved actionable findings.
- `unverified` - implementation produced changes but no relevant verification command was available.
- `already_satisfied` - implementation proved the plan was already satisfied, with proof and identified files; simplify, review, and compound did not run.
- `quality_verified_but_compound_failed` - implementation quality gates passed, clean review passed, final verification passed, and only post-success compounding failed.
