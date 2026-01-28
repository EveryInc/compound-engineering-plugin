# VMark MCP Workflows

Detailed step-by-step patterns for common writing tasks.

---

## Workflow 1: AI Writing Partner

**Scenario:** Writer has a partial thought, wants AI to continue.

### Steps

```
1. READ CONTEXT
   ┌─────────────────────────────────────────────────────┐
   │ cursor_get_context(charsBefore: 500, charsAfter: 100)
   │                                                     │
   │ Returns: { before: "...", after: "...",            │
   │            currentBlock: {...}, position: 1234 }    │
   └─────────────────────────────────────────────────────┘

2. UNDERSTAND DOCUMENT STRUCTURE (if needed)
   ┌─────────────────────────────────────────────────────┐
   │ get_document_digest                                 │
   │                                                     │
   │ Returns: { title, wordCount, outline: [...],       │
   │            blockCounts: {paragraph: 12, ...} }      │
   └─────────────────────────────────────────────────────┘

3. GENERATE CONTINUATION
   ┌─────────────────────────────────────────────────────┐
   │ (AI reasoning based on context)                     │
   │ - Match tone and style of existing text             │
   │ - Consider document structure from digest           │
   │ - Generate appropriate continuation                 │
   └─────────────────────────────────────────────────────┘

4. INSERT AS SUGGESTION
   ┌─────────────────────────────────────────────────────┐
   │ document_insert_at_cursor(                          │
   │   text: "...generated content...",                  │
   │   mode: "suggest"                                   │
   │ )                                                   │
   └─────────────────────────────────────────────────────┘

5. COMMUNICATE TO WRITER
   ┌─────────────────────────────────────────────────────┐
   │ "I've suggested a continuation that [brief desc].   │
   │  Press Tab to accept or Escape to reject.           │
   │  Want me to try a different approach?"              │
   └─────────────────────────────────────────────────────┘
```

### Variations

**Continue with specific direction:**
- Writer says "continue, but make it more technical"
- AI adjusts tone in generated content

**Continue at specific location:**
- Use `cursor_set_position` first if cursor isn't at right place
- Or use `batch_edit` with insert operation targeting specific nodeId

---

## Workflow 2: Improve a Section

**Scenario:** Writer wants a specific section refined.

### Steps

```
1. GET DOCUMENT STRUCTURE
   ┌─────────────────────────────────────────────────────┐
   │ get_document_digest                                 │
   │                                                     │
   │ Look at outline to confirm section exists           │
   └─────────────────────────────────────────────────────┘

2. READ THE SECTION
   ┌─────────────────────────────────────────────────────┐
   │ get_section(heading: "Introduction")                │
   │                                                     │
   │ Returns: { heading: {...}, content: [...],         │
   │            markdown: "...", wordCount: 234 }        │
   └─────────────────────────────────────────────────────┘

3. ANALYZE AND IMPROVE
   ┌─────────────────────────────────────────────────────┐
   │ (AI reasoning)                                      │
   │ - Identify issues: wordiness, unclear points, etc.  │
   │ - Draft improved version                            │
   │ - Preserve writer's voice                           │
   └─────────────────────────────────────────────────────┘

4. PROPOSE REPLACEMENT
   ┌─────────────────────────────────────────────────────┐
   │ update_section(                                     │
   │   heading: "Introduction",                          │
   │   content: "...improved markdown...",               │
   │   mode: "suggest"                                   │
   │ )                                                   │
   └─────────────────────────────────────────────────────┘

5. EXPLAIN CHANGES
   ┌─────────────────────────────────────────────────────┐
   │ "I've suggested improvements to the Introduction:   │
   │  - Tightened the opening paragraph                  │
   │  - Clarified the thesis statement                   │
   │  - Removed redundant phrases                        │
   │                                                     │
   │  Review the highlighted suggestion to accept."      │
   └─────────────────────────────────────────────────────┘
```

### Handling Large Sections

For sections with many paragraphs, consider:

1. **Preview first:** `update_section(..., mode: "dryRun")`
2. **Split if needed:** Multiple `batch_edit` calls targeting specific paragraphs
3. **Max 100 operations per batch**

---

## Workflow 3: Reorganize Document

**Scenario:** Writer wants to reorder sections.

### Steps

```
1. GET CURRENT STRUCTURE
   ┌─────────────────────────────────────────────────────┐
   │ get_document_digest                                 │
   │                                                     │
   │ outline: [                                          │
   │   { level: 1, text: "Title" },                     │
   │   { level: 2, text: "Introduction" },              │
   │   { level: 2, text: "Methods" },                   │
   │   { level: 2, text: "Results" },                   │
   │   { level: 2, text: "Conclusion" }                 │
   │ ]                                                   │
   └─────────────────────────────────────────────────────┘

2. CONFIRM MOVE WITH WRITER
   ┌─────────────────────────────────────────────────────┐
   │ "I see the current order is:                        │
   │  1. Introduction                                    │
   │  2. Methods                                         │
   │  3. Results                                         │
   │  4. Conclusion                                      │
   │                                                     │
   │  You want to move 'Conclusion' before 'Methods'?"   │
   └─────────────────────────────────────────────────────┘

3. EXECUTE MOVE
   ┌─────────────────────────────────────────────────────┐
   │ move_section(                                       │
   │   heading: "Conclusion",                            │
   │   before: "Methods"                                 │
   │ )                                                   │
   └─────────────────────────────────────────────────────┘

4. CONFIRM NEW STRUCTURE
   ┌─────────────────────────────────────────────────────┐
   │ get_document_digest                                 │
   │                                                     │
   │ "Done. New order:                                   │
   │  1. Introduction                                    │
   │  2. Conclusion                                      │
   │  3. Methods                                         │
   │  4. Results"                                        │
   └─────────────────────────────────────────────────────┘
```

---

## Workflow 4: Find and Replace

**Scenario:** Writer wants to change a term throughout the document.

### Steps

```
1. GET REVISION
   ┌─────────────────────────────────────────────────────┐
   │ get_document_revision                               │
   │                                                     │
   │ Returns: { revision: "rev_abc123" }                │
   └─────────────────────────────────────────────────────┘

2. PREVIEW MATCHES
   ┌─────────────────────────────────────────────────────┐
   │ apply_diff(                                         │
   │   baseRevision: "rev_abc123",                       │
   │   original: "machine learning",                     │
   │   replacement: "ML",                                │
   │   matchPolicy: "error_if_multiple",                 │
   │   mode: "dryRun"                                    │
   │ )                                                   │
   │                                                     │
   │ Returns: { matchCount: 7, matches: [...] }         │
   └─────────────────────────────────────────────────────┘

3. CONFIRM WITH WRITER
   ┌─────────────────────────────────────────────────────┐
   │ "Found 7 occurrences of 'machine learning'.         │
   │  Replace all with 'ML'?"                            │
   └─────────────────────────────────────────────────────┘

4. EXECUTE REPLACEMENT
   ┌─────────────────────────────────────────────────────┐
   │ apply_diff(                                         │
   │   baseRevision: "rev_abc123",                       │
   │   original: "machine learning",                     │
   │   replacement: "ML",                                │
   │   matchPolicy: "all",                               │
   │   mode: "suggest"                                   │
   │ )                                                   │
   └─────────────────────────────────────────────────────┘

5. REPORT
   ┌─────────────────────────────────────────────────────┐
   │ "Created 7 suggestions. Review and accept each,     │
   │  or use 'accept all' to apply them at once."        │
   └─────────────────────────────────────────────────────┘
```

### Match Policy Options

| Policy | Use When |
|--------|----------|
| `first` | Only want the first occurrence |
| `all` | Replace every match |
| `nth` | Replace specific occurrence (0-indexed) |
| `error_if_multiple` | Need to disambiguate before replacing |

---

## Workflow 5: Convert Notes to Prose

**Scenario:** Writer has bullet points, wants them as paragraphs.

### Steps

```
1. FIND THE BULLET LIST
   ┌─────────────────────────────────────────────────────┐
   │ list_blocks(query: { type: "bulletList" })          │
   │                                                     │
   │ Returns: [{ id: "node_456", text: "- Point one..." }]
   └─────────────────────────────────────────────────────┘

2. GET FULL CONTENT
   ┌─────────────────────────────────────────────────────┐
   │ get_document_ast(                                   │
   │   filter: { type: "bulletList" },                   │
   │   projection: ["id", "text", "children"]            │
   │ )                                                   │
   └─────────────────────────────────────────────────────┘

3. TRANSFORM TO PROSE
   ┌─────────────────────────────────────────────────────┐
   │ (AI reasoning)                                      │
   │ - Understand relationships between points           │
   │ - Create flowing paragraphs                         │
   │ - Add transitions                                   │
   └─────────────────────────────────────────────────────┘

4. REPLACE LIST WITH PARAGRAPHS
   ┌─────────────────────────────────────────────────────┐
   │ batch_edit(                                         │
   │   baseRevision: "...",                              │
   │   mode: "suggest",                                  │
   │   operations: [                                     │
   │     { type: "delete", nodeId: "node_456" },        │
   │     { type: "insert", after: "node_455",           │
   │       content: "...prose paragraphs..." }           │
   │   ]                                                 │
   │ )                                                   │
   └─────────────────────────────────────────────────────┘
```

---

## Workflow 6: Multi-Document Reference

**Scenario:** Writer needs to reference content from another open document.

### Steps

```
1. LIST AVAILABLE DOCUMENTS
   ┌─────────────────────────────────────────────────────┐
   │ tabs_list                                           │
   │                                                     │
   │ Returns: [                                          │
   │   { id: "tab_1", title: "Draft.md", active: true }, │
   │   { id: "tab_2", title: "Notes.md", active: false } │
   │ ]                                                   │
   └─────────────────────────────────────────────────────┘

2. REMEMBER CURRENT POSITION
   ┌─────────────────────────────────────────────────────┐
   │ activeTab = "tab_1"                                 │
   └─────────────────────────────────────────────────────┘

3. SWITCH TO SOURCE DOCUMENT
   ┌─────────────────────────────────────────────────────┐
   │ tabs_switch(tabId: "tab_2")                         │
   └─────────────────────────────────────────────────────┘

4. READ FROM SOURCE
   ┌─────────────────────────────────────────────────────┐
   │ get_section(heading: "Key Points")                  │
   └─────────────────────────────────────────────────────┘

5. SWITCH BACK
   ┌─────────────────────────────────────────────────────┐
   │ tabs_switch(tabId: "tab_1")                         │
   └─────────────────────────────────────────────────────┘

6. INSERT REFERENCE
   ┌─────────────────────────────────────────────────────┐
   │ document_insert_at_cursor(                          │
   │   text: "...content from notes...",                 │
   │   mode: "suggest"                                   │
   │ )                                                   │
   └─────────────────────────────────────────────────────┘
```

---

## Workflow 7: Format Cleanup

**Scenario:** Writer wants consistent formatting applied.

### Steps

```
1. FIND CONTENT TO FORMAT
   ┌─────────────────────────────────────────────────────┐
   │ list_blocks(query: { contains: "important" })       │
   │                                                     │
   │ Returns: [                                          │
   │   { id: "node_101", text: "This is important..." }, │
   │   { id: "node_205", text: "Another important..." }  │
   │ ]                                                   │
   └─────────────────────────────────────────────────────┘

2. BATCH APPLY FORMATTING
   ┌─────────────────────────────────────────────────────┐
   │ batch_edit(                                         │
   │   baseRevision: "...",                              │
   │   mode: "apply",   // Formatting is immediate      │
   │   operations: [                                     │
   │     { type: "format", nodeId: "node_101",          │
   │       marks: [{ type: "bold" }] },                  │
   │     { type: "format", nodeId: "node_205",          │
   │       marks: [{ type: "bold" }] }                   │
   │   ]                                                 │
   │ )                                                   │
   └─────────────────────────────────────────────────────┘

3. CONFIRM
   ┌─────────────────────────────────────────────────────┐
   │ "Applied bold formatting to 2 paragraphs            │
   │  containing 'important'."                           │
   └─────────────────────────────────────────────────────┘
```

---

## Workflow 8: Handling Conflicts

**Scenario:** Document changed while AI was processing.

### Detection

```
batch_edit(...) returns:
{
  "error": "CONFLICT",
  "message": "Document revision changed from rev_abc to rev_xyz"
}
```

### Recovery Steps

```
1. ACKNOWLEDGE
   ┌─────────────────────────────────────────────────────┐
   │ "The document changed while I was working.          │
   │  Let me re-read and update my suggestion."          │
   └─────────────────────────────────────────────────────┘

2. RE-READ
   ┌─────────────────────────────────────────────────────┐
   │ get_document_digest  // or get_section if targeted  │
   │ get_document_revision → "rev_xyz"                   │
   └─────────────────────────────────────────────────────┘

3. RE-ANALYZE
   ┌─────────────────────────────────────────────────────┐
   │ (AI re-examines content with fresh state)           │
   │ - Check if original target still exists             │
   │ - Adjust suggestion if content changed              │
   └─────────────────────────────────────────────────────┘

4. RE-PROPOSE
   ┌─────────────────────────────────────────────────────┐
   │ batch_edit(                                         │
   │   baseRevision: "rev_xyz",  // New revision        │
   │   ...                                               │
   │ )                                                   │
   └─────────────────────────────────────────────────────┘

5. COMMUNICATE
   ┌─────────────────────────────────────────────────────┐
   │ "Updated my suggestion based on your recent edits." │
   └─────────────────────────────────────────────────────┘
```

---

## Workflow 9: Creating Tables

**Scenario:** Writer wants to create or modify a table.

### Creating a New Table

```
1. INSERT TABLE
   ┌─────────────────────────────────────────────────────┐
   │ table_insert(rows: 3, cols: 4)                      │
   └─────────────────────────────────────────────────────┘

2. POPULATE WITH CONTENT
   ┌─────────────────────────────────────────────────────┐
   │ table_modify(                                       │
   │   operations: [                                     │
   │     { type: "updateCell", row: 0, col: 0,          │
   │       content: "Header 1" },                        │
   │     { type: "updateCell", row: 0, col: 1,          │
   │       content: "Header 2" },                        │
   │     // ... more cells                               │
   │   ]                                                 │
   │ )                                                   │
   └─────────────────────────────────────────────────────┘

3. SET HEADER ROW
   ┌─────────────────────────────────────────────────────┐
   │ table_toggle_header_row                             │
   └─────────────────────────────────────────────────────┘
```

### Modifying Existing Table

```
table_modify(
  operations: [
    { type: "addRow", position: "after", rowIndex: 2 },
    { type: "updateCell", row: 3, col: 0, content: "New data" },
    { type: "deleteColumn", colIndex: 4 }
  ]
)
```

---

## Anti-Patterns to Avoid

### Don't: Edit without reading first

```
❌ batch_edit(operations: [...])  // Where does this go?

✓ get_document_digest            // Understand structure
✓ list_blocks(...)               // Find target
✓ batch_edit(operations: [...])  // Now edit
```

### Don't: Use apply mode for content changes

```
❌ batch_edit(mode: "apply", operations: [{type: "update", ...}])

✓ batch_edit(mode: "suggest", operations: [{type: "update", ...}])
```

### Don't: Assume suggestions are accepted

```
❌ "I've made the changes to your document."

✓ "I've suggested changes. Review the highlights to accept or reject."
```

### Don't: Ignore conflicts

```
❌ (Conflict error) → Retry immediately with same content

✓ (Conflict error) → Re-read → Re-analyze → Re-propose
```
