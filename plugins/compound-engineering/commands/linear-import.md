---
name: linear:import
description: Import a Linear issue as a local todo file
argument-hint: "<linear-identifier e.g. ENG-123>"
disable-model-invocation: true
---

# Linear Import

Import a specific Linear issue as a local todo file.

## Workflow

1. Run the import command:

```bash
compound-plugin linear import $ARGUMENTS --todos-dir ./todos
```

2. Show the user the created file path and its contents.

3. Suggest next steps:
   - Review the imported todo
   - `/triage` to prioritize it
   - `/linear:sync` to sync all
