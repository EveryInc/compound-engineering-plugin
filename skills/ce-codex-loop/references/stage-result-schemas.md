# Stage Result Schemas

These text schemas are the structured contract for `ce-codex-loop`. The orchestrator consumes JSON-shaped stage results and fails closed on missing fields. Malformed or prose-only stage output is terminal `failed`.

## Implementation Stage

Required fields:

```json
{
  "stage": "implementation",
  "status": "completed | already_satisfied | partial | failed",
  "files": {
    "created": [],
    "modified": [],
    "deleted": []
  },
  "verification": [
    {
      "command": "string",
      "status": "passed | failed | skipped | unavailable",
      "summary": "string"
    }
  ],
  "issues": [],
  "already_satisfied_proof": null
}
```

`already_satisfied` requires proof and identified files. A zero-diff result without `already_satisfied_proof` and at least one related path is terminal `failed`.

## Simplification Stage

Required fields:

```json
{
  "stage": "simplification",
  "status": "completed | failed",
  "files": {
    "created": [],
    "modified": [],
    "deleted": []
  },
  "applied_simplifications": [],
  "skipped_simplifications": [],
  "verification": [],
  "issues": []
}
```

Failed verification reports `failed` and does not claim behavior preservation.

## Review Stage

Required fields:

```json
{
  "stage": "review",
  "status": "complete | failed | degraded | skipped",
  "verdict": "Ready to merge | Ready with fixes | Not ready",
  "run_id": "string",
  "artifact_path": "string",
  "findings": [],
  "actionable_findings": [],
  "coverage": {}
}
```

Clean review requires all three predicates: status == complete, verdict == Ready to merge, and actionable_findings.length == 0.

## Verification Stage

Required fields:

```json
{
  "stage": "verification",
  "status": "passed | failed | unavailable",
  "commands": [
    {
      "command": "string",
      "status": "passed | failed | skipped | unavailable",
      "summary": "string"
    }
  ],
  "issues": []
}
```

If no relevant command can be identified after implementation or simplification, the loop returns terminal `unverified`.

## Compound Stage

Required fields:

```json
{
  "stage": "compound",
  "status": "completed | failed | skipped",
  "issues": []
}
```

Compounding is skipped for `already_satisfied`, `failed`, and `unverified` paths.
