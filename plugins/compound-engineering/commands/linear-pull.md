---
name: linear:pull
description: Pull Linear changes into local todo files
disable-model-invocation: true
---

# Linear Pull

Pull changes from Linear into local todo files. Updates state, priority, comments, and creates files for new issues.

## Workflow

1. Run the pull command:

```bash
compound-plugin linear pull --todos-dir ./todos
```

2. Report to the user:
   - State/priority changes applied to existing files
   - New comments appended to Work Logs
   - New todo files created from Linear issues
   - Any errors encountered

3. Suggest next steps:
   - `ls todos/*-ready-*.md` — view ready items
   - `/triage` — triage any newly pulled pending items
   - `/linear:status` — verify sync state
