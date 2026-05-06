---
name: ce:diagram:sync
description: "Fully regenerate architecture.excalidraw from scratch when the diagram has significantly drifted from the codebase. Use after major refactors, after 3+ update cycles, or when the diagram feels stale. Archives the existing diagram before regenerating. Prefer /ce:diagram:update for routine post-review maintenance."
---

# Architecture Diagram Sync

`/ce:diagram:sync` regenerates the architecture diagram from scratch by re-scanning the codebase. Use this when incremental updates have accumulated drift, after a major refactor, or when the diagram no longer accurately reflects the project structure.

**This is a destructive operation** — it archives and replaces the existing `architecture.excalidraw` and `architecture-constraints.md`. The archive is kept as `architecture.excalidraw.bak` if you need to roll back.

## Workflow

### Phase 0: Load Context

Read `references/workflow-context.md` to confirm the `:update` vs `:sync` decision criteria. If the user might actually want `:update`, mention the distinction before proceeding.

### Phase 1: Confirm Before Proceeding

Print a warning and ask the user (use `AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini):

"This will regenerate architecture.excalidraw from scratch by re-scanning the codebase.

- The existing architecture.excalidraw will be archived as architecture.excalidraw.bak
- architecture-constraints.md will be overwritten with a fresh scan
- The architecture-changelog.md will receive a sync entry

Proceed? If you want an incremental update instead, run /ce:diagram:update."

If the user declines, stop without making any changes.

### Phase 2: Archive Existing Diagram

If `architecture.excalidraw` exists in the project root:
- Rename it to `architecture.excalidraw.bak` (overwrite any existing `.bak` file)

If `architecture.excalidraw` does not exist, skip this step.

### Phase 3: Invoke Diagram Generator

Invoke agent `excalidraw-diagrams:diagram:diagram-generator` with:
- No `--feature` flag (full scan, all feature areas)
- The contents of `references/excalidraw-format.md` (schema reference)
- The contents of `references/constraints-template.md` (output template)
- The contents of `references/workflow-context.md` (quality rules)

The agent will write a fresh `architecture.excalidraw` and `architecture-constraints.md` to the project root.

### Phase 4: Log to Changelog

After the agent completes, read the generated `architecture-constraints.md` to count components and feature areas.

Prepend a new entry to `architecture-changelog.md` (create the file if it does not exist):

```markdown
## {YYYY-MM-DD} — /ce:diagram:sync (full regeneration)
- Previous diagram archived to architecture.excalidraw.bak
- {N} components found across {M} feature areas
- Feature areas: {list}
```

### Phase 5: Print Completion

```
Sync complete.

{N} components found across {M} feature areas.

Files written:
  architecture.excalidraw    (open at https://excalidraw.com to review)
  architecture-constraints.md
  architecture-changelog.md

Previous diagram archived at architecture.excalidraw.bak

Review architecture-constraints.md before running /ce:plan.
```
