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

## Preflight Scope Stage

Required fields:

```json
{
  "stage": "preflight_scope",
  "status": "completed | failed",
  "planned_scope": {
    "created": [],
    "modified": [],
    "deleted": [],
    "test_paths": []
  },
  "overlap": {
    "tracked": [],
    "untracked_planned_collisions": []
  },
  "issues": []
}
```

When the plan declares mutation work but concrete safe scope cannot be extracted, this stage reports `failed` and the loop stops before mutation. The overlap check evaluates the union of all planned mutation and test paths before `ce-work` runs. `untracked_planned_collisions` contains untracked snapshot paths that intersect any planned Create, Modify, Delete, or Test path.

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

The `files` object is the simplification delta. Any created, modified, or deleted path in that delta must be folded into a refreshed manifest checkpoint before verification or review. A no-op simplification still produces a post-simplification checkpoint with the current manifest.

## Manifest Checkpoint Stage

Required fields:

```json
{
  "stage": "manifest_checkpoint",
  "label": "string",
  "manifest": {
    "created": [],
    "modified": [],
    "deleted": [],
    "temporarily_indexed": []
  },
  "validated": true
}
```

Manifest checkpoints are required after implementation, after simplification, after each fix wave, after each repair or revert, immediately before every verification, and immediately before every review attempt.

Terminal reports aggregate these records in `manifest_checkpoints`.

## Review Stage

Required fields:

```json
{
  "stage": "review",
  "status": "complete | failed | degraded | skipped",
  "verdict": "Ready to merge | Ready with fixes | Not ready",
  "run_id": "string",
  "artifact_path": "string",
  "plan_path": "string",
  "reviewed_manifest": {
    "created": [],
    "modified": [],
    "deleted": [],
    "temporarily_indexed": []
  },
  "findings": [],
  "actionable_findings": [],
  "plan_source": "explicit",
  "requirements_completeness": {},
  "coverage": {}
}
```

Every review stage is produced from `ce-code-review mode:agent plan:<plan-path> base:<stable-base> manifest:<manifest-path> run-id:<run-id> artifact-dir:<artifact-dir>`. `plan_path` must equal the original supplied plan path for every attempt. `artifact_path` must equal the exact per-attempt artifact directory supplied to `ce-code-review` with a trailing slash, and malformed-primary fallback reads only `<artifact_path>/review.json`. Review JSON must report requirements completeness from an explicit plan source via `plan_source: "explicit"` and non-null `requirements_completeness`; missing, malformed, or inferred plan context is terminal `failed` for `ce-codex-loop`.

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
  "compound_outputs": {
    "created": [],
    "modified": [],
    "deleted": []
  },
  "issues": []
}
```

Compounding is skipped for `already_satisfied`, `failed`, and `unverified` paths. A failed compound stage is not retried; it returns terminal `quality_verified_but_compound_failed` when the prior quality gates passed.
