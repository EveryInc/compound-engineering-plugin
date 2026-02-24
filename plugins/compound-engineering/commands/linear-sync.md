---
name: linear:sync
description: Bidirectional sync between file todos and Linear
argument-hint: "[--dry-run]"
disable-model-invocation: true
---

# Linear Sync

Run bidirectional sync between file-based todos and Linear.

## Workflow

1. Run the sync command:

```bash
compound-plugin linear sync --todos-dir ./todos $ARGUMENTS
```

2. Report results to user:
   - Number of issues created in Linear (pushed)
   - Number of issues updated in Linear (pushed)
   - Number of files updated from Linear (pulled)
   - Number of new files created from Linear (pulled)
   - Number of comments pulled
   - Any conflicts resolved and how they were resolved

3. If `--dry-run` was passed, clarify that no changes were applied and show what would change.

4. Present next steps:
   - `ls todos/*-ready-*.md` — view ready items
   - `/linear:status` — see sync dashboard
   - `/triage` — triage pending items
