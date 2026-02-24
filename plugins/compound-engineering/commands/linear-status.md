---
name: linear:status
description: Show sync status between file todos and Linear
disable-model-invocation: true
---

# Linear Status

Show the sync status dashboard comparing file-based todos with their Linear counterparts.

## Workflow

1. Run the status command:

```bash
compound-plugin linear status --todos-dir ./todos
```

2. Present the divergence table to the user showing:
   - Which files are in sync
   - Which files need pushing (file changed, Linear outdated)
   - Which files need pulling (Linear changed, file outdated)
   - Which files have conflicts (both changed)
   - Which files have no Linear counterpart yet

3. Suggest actions based on findings:
   - If items need sync: suggest `/linear:sync`
   - If items have no Linear link: suggest `/linear:sync` to create them
   - If conflicts exist: suggest `/linear:sync --dry-run` first to preview
