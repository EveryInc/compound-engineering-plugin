# Implementation-Only Mode

`mode:implementation-only` is a composition mode for orchestrators that need implementation work without shipping behavior.

## Parsing

This reference is loaded only after the top-level argument parser has detected exactly one standalone `mode:implementation-only` token and stripped it from raw `$ARGUMENTS`.

Required parsing order:

1. Capture raw `$ARGUMENTS`.
2. Detect `mode:implementation-only` as one standalone token.
3. Reject duplicate mode tokens.
4. Strip the token before Phase 0 input triage.
5. Normalize the remaining value as the work-document input.
6. Require exactly one readable plan-file path remains.
7. Reject blank input, bare prompts, unreadable paths, directories, and knowledge-work plans before mutation.
8. Activate implementation-only mode.
9. Only then enter Phase 0 plan-file triage with the stripped path.

The mode token may appear before or after the plan path, but it must be a complete token. Preserve quoted paths containing spaces. Do not activate this mode for token-like substrings inside filenames or prose, such as `docs/plans/mode:implementation-only-plan.md` or `implement mode:implementation-onlyish behavior`.

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
