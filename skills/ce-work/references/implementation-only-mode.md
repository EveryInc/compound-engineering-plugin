# Implementation-Only Mode

`mode:implementation-only` is a composition mode for orchestrators that need implementation work without shipping behavior.

## Parsing

Strip `mode:implementation-only` before reading the remaining argument as the work document. The mode is valid only with a plan-file input. Reject bare prompts, blank invocation, unreadable plans, and knowledge-work plans in this mode.

Default behavior is unchanged when the token is absent.

## Behavior

Reuse normal plan reading, U-ID task derivation, execution posture, test discovery, test scenario completeness, and system-wide test checks.

Bypass shipping and branch behavior:

- Do not create or switch branches.
- Do not create commits.
- Do not invoke `ce-simplify-code`.
- Do not invoke `ce-code-review`.
- Do not load `references/shipping-workflow.md`.
- Do not push, create or edit a PR, watch CI, or run release automation.

## Structured Result

Return one JSON object or a clearly delimited JSON block with this shape:

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

`already_satisfied` is valid only with proof and identified files. A zero-diff result without proof is `failed`. Incomplete unit coverage is `partial`. Test or implementation failure is `failed`.
