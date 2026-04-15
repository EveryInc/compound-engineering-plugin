---
name: ce:diagram
description: "Generate or read an architecture diagram and produce architecture-constraints.md to anchor /ce:plan. Use when starting a new feature to establish component boundaries, when attaching an existing diagram image or .excalidraw file, or when no architecture-constraints.md exists in the project root."
argument-hint: "[optional: --feature <name> to scope to one feature area, --overwrite to skip confirmation if constraints file already exists]"
---

# Architecture Diagram

`/ce:diagram` creates the architectural spec that anchors `/ce:plan`. It produces two files in the project root:
- `architecture-constraints.md` — machine-readable spec consumed automatically by `/ce:plan`
- `architecture.excalidraw` — visual diagram (only when no attachment is provided)

**Run this before `/ce:plan`** to lock in component ownership, layer boundaries, and data flow directions upfront.

## Arguments

Parse `$ARGUMENTS` for these tokens:

| Token | Example | Effect |
|-------|---------|--------|
| `--feature <name>` | `--feature home` | Scope the generator to one feature area only |
| `--overwrite` | `--overwrite` | Skip confirmation if `architecture-constraints.md` already exists |

## Workflow

### Phase 0: Load Context

Read `references/workflow-context.md` to understand the philosophy, quality rules, and decision tree for this plugin.

### Phase 1: Determine Input Path

Check whether the current message includes an attached file.

**If an attachment is present** (`.excalidraw` file or image):
- Invoke agent `excalidraw-diagrams:diagram:diagram-reader`
- Pass to the agent:
  - The attached file path
  - The contents of `references/excalidraw-format.md` (schema reference)
  - The contents of `references/constraints-template.md` (output template)
  - The `--overwrite` flag if it was provided

**If no attachment is present**:
- Check whether `architecture-constraints.md` already exists in the project root
- If it exists and `--overwrite` was not passed: ask the user (use `AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini): "architecture-constraints.md already exists. Regenerate the diagram from scratch (overwrites existing constraints) or cancel?"
  - On cancel: stop and print "Cancelled. Run `/ce:diagram:update` to incrementally update the existing constraints, or pass `--overwrite` to force regeneration."
  - On regenerate: proceed
- Invoke agent `excalidraw-diagrams:diagram:diagram-generator`
- Pass to the agent:
  - The `--feature` value if it was provided
  - The contents of `references/excalidraw-format.md` (schema reference)
  - The contents of `references/constraints-template.md` (output template)

### Phase 2: Print Constraints Summary

After the agent completes, read `architecture-constraints.md` from the project root and print a human-readable summary:

```
Here's what I captured. Confirm before running /ce:plan:

Components ({N} total):
  Screen:     [ComponentName, ...]
  Bloc:       [ComponentName, ...]
  Repository: [ComponentName, ...]
  Service:    [ComponentName, ...]

Data flows:
  ComponentA -> ComponentB (trigger: EventName)
  ...

Explicit constraints:
  - constraint text
  ...

Open questions ({N}):
  - question text
  ...
```

### Phase 3: Human Confirmation Gate

After printing the summary, state:

"Does this match your intended architecture? If yes, run `/ce:plan` — it will automatically read `architecture-constraints.md` and respect these boundaries."

**Do NOT invoke `/ce:plan` automatically.** Always pause here for human confirmation. The user decides when to proceed.

If the user wants to make corrections:
- For small corrections (rename a component, change a layer): offer to edit `architecture-constraints.md` directly
- For major corrections (diagram is substantially wrong): suggest re-running `/ce:diagram` with the correct attachment or feedback
