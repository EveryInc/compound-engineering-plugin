# Structured Result Schema

This is the manifest-scoped structured-result mode for `ce-simplify-code`.

## Invocation

Use:

```text
ce-simplify-code mode:structured manifest:<path>
```

The manifest is the only scope. Missing, unreadable, or empty manifest fails closed.

Before any simplification work, validate every manifest entry. Each path must be a string, non-empty, repo-relative, POSIX-normalizable without `.` or `..` segments, inside the repository, and unique after normalization. Absolute paths, repo escapes, duplicate normalized paths, and non-string entries are unsafe and must fail before Step 1 or agent dispatch. Validation must not stage untracked files.

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

The `files` object is the simplification delta. Orchestrators must refresh their manifest after this stage even when every list is empty. If any list contains a path, downstream verification and review must receive the refreshed post-simplification manifest rather than the pre-simplification input manifest.
