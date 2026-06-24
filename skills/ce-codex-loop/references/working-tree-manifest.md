# Working Tree Manifest

`ce-codex-loop` separates pre-existing user work from loop-owned work before mutation and after every mutating stage.

## Snapshot

Capture these fields before mutation:

```json
{
  "head_sha": "git rev-parse HEAD",
  "stable_review_base": "merge-base or explicit base ref",
  "staged": [],
  "unstaged": [],
  "untracked": []
}
```

The original staged state must be unchanged by review preparation.

## Manifest

The loop-owned manifest has these categories:

```json
{
  "created": [],
  "modified": [],
  "deleted": [],
  "temporarily_indexed": []
}
```

v1 keeps `temporarily_indexed` empty because manifest-scoped review includes untracked content explicitly without staging.

## Ownership Rules

- Plan file scope is the starting allow-list.
- Stage structured file lists from implementation, simplification, review fixes, and repair passes refresh ownership.
- The working-tree delta classifies created, modified, and deleted paths after each stage.
- Pre-existing overlapping tracked edit means stop before mutation.
- Pre-existing unrelated edits remain excluded from the manifest and must not enter simplify or review.
- Loop-created untracked files are included in the manifest and review scope without staging.
- Deletions are explicit manifest entries, not inferred from absence.

Refresh the manifest after implementation, simplification, each fix wave, and each repair-or-revert pass.
