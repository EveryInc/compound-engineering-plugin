---
date: 2026-04-22
topic: demo-reel-local-save
---

# Demo Reel: Local Evidence Save

## Problem Frame

When `ce-demo-reel` captures evidence (GIFs, screenshots, terminal recordings), the local artifacts are deleted after uploading to catbox.moe. Users who want to keep evidence locally — for offline access, committing to the repo, or archival — have no way to do so without manually copying files from the temp directory before cleanup runs.

---

## Requirements

**Destination choice**
- R1. After capture completes, ask the user whether to upload to catbox (existing behavior) or save locally.
- R2. The question must present the captured artifact(s) and clearly describe both options.

**Local save behavior**
- R3. When the user chooses local save, copy the final artifact(s) (GIF, PNG, or recording) to a stable OS-temp path (`$TMPDIR/compound-engineering/ce-demo-reel/`). Do not upload to catbox.
- R4. Create the destination directory if it does not exist.
- R5. Use a descriptive filename that includes the branch name or PR identifier and a timestamp to avoid collisions across runs.
- R6. After saving, display the local file path(s) to the user for easy reference.

---

## Success Criteria

- A user running `ce-demo-reel` can keep captured evidence on disk without manual intervention.
- The saved artifacts are discoverable in a predictable, stable OS-temp location.

---

## Scope Boundaries

- Catbox upload logic itself is unchanged — only the routing (local vs. upload) is new.
- No automatic git-add or commit of saved artifacts.
- No configurable save path — `$TMPDIR/compound-engineering/ce-demo-reel/` is the fixed default for now.
- No retroactive save of previously captured evidence.

---

## Key Decisions

- **Local save as an alternative to upload, not an addition**: The user chooses one destination per capture — either catbox or local. This keeps the flow simple and avoids redundant artifacts.
- **OS-temp as the local target**: Uses `$TMPDIR/compound-engineering/ce-demo-reel/` per the repo's cross-invocation scratch-space convention. Stable prefix makes files findable without polluting the repo tree.

---

## Next Steps

-> `/ce-plan` for structured implementation planning, or proceed directly to implementation given the small scope.
