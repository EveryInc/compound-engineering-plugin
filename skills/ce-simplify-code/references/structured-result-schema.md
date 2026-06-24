# Structured Result Schema

This is the manifest-scoped structured-result mode for `ce-simplify-code`.

## Invocation

Use:

```text
ce-simplify-code mode:structured manifest:<path>
```

The manifest is the only scope. Missing, unreadable, or empty manifest fails closed.

## Result

```json
{
  "stage": "simplification",
  "status": "completed | failed",
  "manifest_path": "string",
  "files": {
    "created": [],
    "modified": [],
    "deleted": []
  },
  "applied_simplifications": [],
  "skipped_simplifications": [],
  "verification": [
    {
      "command": "string",
      "status": "passed | failed | skipped | unavailable",
      "summary": "string"
    }
  ],
  "issues": []
}
```

Failed verification reports `failed` and does not claim behavior preservation.
