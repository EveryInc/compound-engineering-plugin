---
name: vmark-mcp
description: AI writing assistant for VMark editor. Use when helping users write, edit, reorganize, or format markdown documents through the VMark MCP tools.
---

# VMark MCP Writing Assistant

## When to Use This Skill

Use this skill when the user wants AI help with:
- Writing or expanding content in VMark
- Editing, refining, or improving existing text
- Reorganizing document structure (moving sections, reordering)
- Formatting (headings, lists, tables, emphasis)
- Multi-document workflows (working across tabs/windows)

## Core Principles

### 1. Read Before Write

**Always** understand the document before making changes:

```
get_document_digest  →  understand structure
get_section          →  read specific content
THEN propose changes
```

Never edit blind. The digest gives you: title, word count, outline, block counts.

### 2. Suggest, Don't Force

Use `mode: "suggest"` for content changes. Let the writer decide:

```
batch_edit(
  mode: "suggest",      ← Writer reviews before applying
  operations: [...]
)
```

The writer sees highlighted suggestions and accepts/rejects them.

### 3. Respect Revision History

Every mutation needs `baseRevision` for conflict detection:

```
1. get_document_revision → "rev_abc123"
2. batch_edit(baseRevision: "rev_abc123", ...)
   → If doc changed: CONFLICT (re-read and retry)
   → If unchanged: SUCCESS
```

### 4. Work with Structure, Not Positions

Target nodes by ID, not character offsets:

```
✓ batch_edit(operations: [{nodeId: "node_123", ...}])
✗ "Replace characters 450-500"
```

Use `list_blocks` or `get_document_ast` to find node IDs.

## Quick Reference: Intent → Tool

| You Want To... | Use This Tool | Mode |
|----------------|---------------|------|
| Understand the document | `get_document_digest` | - |
| Find specific content | `list_blocks` with query | - |
| Read a section | `get_section` | - |
| Insert/update/delete content | `batch_edit` | suggest |
| Find and replace | `apply_diff` | suggest |
| Replace with context anchors | `replace_text_anchored` | suggest |
| Move a section | `move_section` | apply |
| Toggle formatting | `format_toggle` | apply |
| Change block type | `block_set_type` | apply |
| Work with lists | `list_toggle`, `list_modify` | apply |
| Work with tables | `table_modify` | apply |
| Check pending suggestions | `suggestion_list` | - |
| Preview changes | Any mutation tool | dryRun |

## The Fundamental Workflow

Every AI writing task follows this cycle:

```
┌─────────────────────────────────────────────────────────┐
│  1. READ         get_document_digest / get_section      │
│                  Understand what exists                 │
├─────────────────────────────────────────────────────────┤
│  2. LOCATE       list_blocks / resolve_targets          │
│                  Find the nodes you'll modify           │
├─────────────────────────────────────────────────────────┤
│  3. PLAN         (AI reasoning)                         │
│                  Decide what changes to make            │
├─────────────────────────────────────────────────────────┤
│  4. PREVIEW      batch_edit with mode: "dryRun"         │
│                  (Optional) Verify targets are correct  │
├─────────────────────────────────────────────────────────┤
│  5. SUGGEST      batch_edit with mode: "suggest"        │
│                  Propose changes for writer approval    │
├─────────────────────────────────────────────────────────┤
│  6. WAIT         Writer accepts/rejects suggestions     │
│                  Don't assume acceptance                │
└─────────────────────────────────────────────────────────┘
```

## Common Workflows

### Expand/Continue Writing

```
1. cursor_get_context     → Get text around cursor
2. (AI generates continuation)
3. document_insert_at_cursor(text, mode: "suggest")
4. Tell writer: "I've suggested a continuation. Press Tab to accept or Escape to reject."
```

### Improve a Section

```
1. get_document_digest    → Find section heading
2. get_section("Introduction")  → Read full content
3. (AI analyzes and improves)
4. update_section(heading: "Introduction", content: "...", mode: "suggest")
5. Tell writer what you changed and why
```

### Reorganize Document

```
1. get_document_digest    → See outline
2. move_section(heading: "Conclusion", before: "Methods")
3. Confirm new structure to writer
```

### Find and Replace

```
1. apply_diff(
     original: "old phrase",
     replacement: "new phrase",
     matchPolicy: "all",
     mode: "suggest"
   )
2. Report: "Found X occurrences. Review suggestions to accept."
```

### Format Content

```
1. list_blocks(query: {contains: "important term"})
2. batch_edit(operations: [
     {type: "format", nodeId: "...", marks: [{type: "bold"}]}
   ])
```

## What This Skill Cannot Do

Be honest about limitations:

| Request | Reality |
|---------|---------|
| "Type along with me" | No real-time streaming. AI responds to requests. |
| "Show me 3 alternatives" | One suggestion at a time. Iterate if needed. |
| "Watch for errors as I type" | No document events. Must be asked to check. |
| "Track all my changes" | Suggestions are accept/reject, not diff view. |

## Handling Conflicts

If `batch_edit` returns a conflict error:

```
1. Re-read: get_document_digest or get_section
2. Re-analyze: the content may have changed
3. Re-propose: new batch_edit with fresh baseRevision
4. Tell writer: "The document changed. Here's my updated suggestion."
```

## Multi-Document Workflows

When working across files:

```
1. workspace_list_windows  → See all open windows
2. tabs_list(windowId)     → See tabs in a window
3. tabs_switch(tabId)      → Switch to target document
4. (Perform operations)
5. tabs_switch back if needed
```

Always specify `windowId` when not working in the focused window.

## References

- `references/tools-by-intent.md` — Complete tool mapping by writer intent
- `references/workflows.md` — Detailed step-by-step patterns
- `references/examples.md` — Real tool call examples with parameters
