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

## Planned Scope

Before mutation, parse every implementation unit's `Files:` entry into separate sets:

```json
{
  "created": [],
  "modified": [],
  "deleted": [],
  "test_paths": []
}
```

Recognize Create, Modify, Delete, Test labels and equivalent inline test path phrases inside the `Files:` section. Do not guess paths from ambiguous prose in `Test Scenarios`, `Approach`, or `Verification`.

The overlap gate evaluates the union of `created`, `modified`, `deleted`, and `test_paths` before `ce-work` runs. Staged and unstaged tracked edits to any planned implementation or test path block mutation. Existing untracked files at planned Create paths block mutation. A plan that declares mutation work but lacks concrete safe scope fails closed before mutation. Test paths remain overlap-relevant even when declared in a different implementation unit from the production file.

## Ownership Rules

- Plan file scope is the starting allow-list.
- Stage structured file lists from implementation, simplification, review fixes, and repair passes refresh ownership.
- The working-tree delta classifies created, modified, and deleted paths after each stage.
- Pre-existing overlapping tracked edit means stop before mutation.
- Pre-existing unrelated edits remain excluded from the manifest and must not enter simplify or review.
- Loop-created untracked files are included in the manifest and review scope without staging.
- Deletions are explicit manifest entries, not inferred from absence.

Refresh the manifest after implementation, simplification, each fix wave, and each repair-or-revert pass.

## Terminal Deltas

The terminal report separates repository state by lifecycle boundary:

- `reviewed_manifest` is the exact refreshed loop-owned manifest supplied to the final code-review attempt and used for simplification, review-followup, and final code verification.
- `compound_outputs` is the repository delta between the immediate pre-compound and post-compound snapshots.
- `final_repository_delta` is the full delta from the initial workflow snapshot to terminal completion.

`compound_outputs` must never be folded into `reviewed_manifest`. `final_repository_delta` may be the union of reviewed implementation changes and later permitted compound outputs.
