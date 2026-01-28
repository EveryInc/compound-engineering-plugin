# VMark MCP Tool Examples

Real tool call examples with parameters and expected responses.

---

## Reading the Document

### get_document_digest

**Call:**
```json
{
  "tool": "get_document_digest"
}
```

**Response:**
```json
{
  "title": "My Research Paper",
  "wordCount": 2450,
  "charCount": 14230,
  "outline": [
    { "level": 1, "text": "My Research Paper", "nodeId": "node_1" },
    { "level": 2, "text": "Introduction", "nodeId": "node_5" },
    { "level": 2, "text": "Methods", "nodeId": "node_23" },
    { "level": 3, "text": "Data Collection", "nodeId": "node_31" },
    { "level": 2, "text": "Results", "nodeId": "node_45" },
    { "level": 2, "text": "Conclusion", "nodeId": "node_67" }
  ],
  "blockCounts": {
    "paragraph": 28,
    "heading": 6,
    "bulletList": 3,
    "codeBlock": 2,
    "table": 1
  },
  "flags": {
    "hasImages": true,
    "hasTables": true,
    "hasCode": true,
    "hasMath": false
  },
  "revision": "rev_a7b3c9"
}
```

### get_section

**Call:**
```json
{
  "tool": "get_section",
  "heading": "Introduction"
}
```

**Response:**
```json
{
  "heading": {
    "nodeId": "node_5",
    "level": 2,
    "text": "Introduction"
  },
  "content": [
    { "nodeId": "node_6", "type": "paragraph", "text": "This paper explores..." },
    { "nodeId": "node_7", "type": "paragraph", "text": "Previous research has..." }
  ],
  "markdown": "## Introduction\n\nThis paper explores...\n\nPrevious research has...",
  "wordCount": 156,
  "revision": "rev_a7b3c9"
}
```

### list_blocks

**Call:**
```json
{
  "tool": "list_blocks",
  "query": {
    "type": "paragraph",
    "contains": "important"
  },
  "limit": 10
}
```

**Response:**
```json
{
  "revision": "rev_a7b3c9",
  "blocks": [
    {
      "id": "node_12",
      "type": "paragraph",
      "text": "This is an important finding that...",
      "position": { "from": 450, "to": 520 }
    },
    {
      "id": "node_34",
      "type": "paragraph",
      "text": "Another important consideration is...",
      "position": { "from": 890, "to": 945 }
    }
  ],
  "hasMore": false
}
```

### cursor_get_context

**Call:**
```json
{
  "tool": "cursor_get_context",
  "charsBefore": 200,
  "charsAfter": 50
}
```

**Response:**
```json
{
  "before": "...the data shows a clear trend toward increased adoption. The implications of this finding are significant for practitioners who need to",
  "after": " make informed decisions about...",
  "position": 1234,
  "currentBlock": {
    "nodeId": "node_28",
    "type": "paragraph",
    "text": "The implications of this finding are significant for practitioners who need to make informed decisions about implementation strategies."
  },
  "revision": "rev_a7b3c9"
}
```

---

## Making Edits

### batch_edit - Insert content

**Call:**
```json
{
  "tool": "batch_edit",
  "baseRevision": "rev_a7b3c9",
  "mode": "suggest",
  "operations": [
    {
      "type": "insert",
      "after": "node_12",
      "content": "Furthermore, this finding aligns with recent studies by Smith et al. (2023) which demonstrated similar patterns in controlled environments."
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "mode": "suggest",
  "operationResults": [
    {
      "type": "insert",
      "suggestionId": "sug_x7y8z9",
      "insertedNodeId": "node_13_new"
    }
  ],
  "newRevision": "rev_b8c4d0"
}
```

### batch_edit - Update content

**Call:**
```json
{
  "tool": "batch_edit",
  "baseRevision": "rev_a7b3c9",
  "mode": "suggest",
  "operations": [
    {
      "type": "update",
      "nodeId": "node_12",
      "text": "This is a critically important finding that demonstrates a clear correlation between the variables studied."
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "mode": "suggest",
  "operationResults": [
    {
      "type": "update",
      "nodeId": "node_12",
      "suggestionId": "sug_a1b2c3"
    }
  ],
  "newRevision": "rev_b8c4d0"
}
```

### batch_edit - Multiple operations

**Call:**
```json
{
  "tool": "batch_edit",
  "baseRevision": "rev_a7b3c9",
  "mode": "suggest",
  "operations": [
    {
      "type": "update",
      "nodeId": "node_12",
      "text": "Improved paragraph one..."
    },
    {
      "type": "update",
      "nodeId": "node_13",
      "text": "Improved paragraph two..."
    },
    {
      "type": "delete",
      "nodeId": "node_14"
    }
  ]
}
```

### batch_edit - Dry run

**Call:**
```json
{
  "tool": "batch_edit",
  "baseRevision": "rev_a7b3c9",
  "mode": "dryRun",
  "operations": [
    {
      "type": "update",
      "nodeId": "node_12",
      "text": "New content..."
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "mode": "dryRun",
  "preview": {
    "operationCount": 1,
    "affectedNodes": ["node_12"],
    "estimatedChanges": {
      "deletions": 45,
      "insertions": 52
    }
  }
}
```

### apply_diff - Find and replace

**Call:**
```json
{
  "tool": "apply_diff",
  "baseRevision": "rev_a7b3c9",
  "original": "machine learning",
  "replacement": "ML",
  "matchPolicy": "all",
  "mode": "suggest"
}
```

**Response:**
```json
{
  "success": true,
  "matchCount": 7,
  "suggestionIds": ["sug_1", "sug_2", "sug_3", "sug_4", "sug_5", "sug_6", "sug_7"],
  "newRevision": "rev_c9d5e1"
}
```

### apply_diff - Scoped replacement

**Call:**
```json
{
  "tool": "apply_diff",
  "baseRevision": "rev_a7b3c9",
  "scopeQuery": {
    "type": "heading",
    "level": 2
  },
  "original": "Section",
  "replacement": "Chapter",
  "matchPolicy": "all",
  "mode": "suggest"
}
```

### replace_text_anchored

**Call:**
```json
{
  "tool": "replace_text_anchored",
  "baseRevision": "rev_a7b3c9",
  "anchor": {
    "text": "machine learning",
    "beforeContext": "advances in the field of ",
    "afterContext": " have revolutionized",
    "maxDistance": 50
  },
  "replacement": "artificial intelligence",
  "mode": "suggest"
}
```

**Response:**
```json
{
  "success": true,
  "matched": true,
  "confidence": 0.95,
  "suggestionId": "sug_d4e5f6",
  "matchPosition": { "from": 234, "to": 250 }
}
```

---

## Section Operations

### update_section

**Call:**
```json
{
  "tool": "update_section",
  "heading": "Introduction",
  "content": "## Introduction\n\nThis completely rewritten introduction provides a clearer overview of the research objectives.\n\nThe study aims to investigate three key areas...",
  "mode": "suggest"
}
```

### move_section

**Call:**
```json
{
  "tool": "move_section",
  "heading": "Conclusion",
  "before": "Methods"
}
```

**Response:**
```json
{
  "success": true,
  "movedSection": "Conclusion",
  "newPosition": "before Methods",
  "newRevision": "rev_e0f6g2"
}
```

### insert_section

**Call:**
```json
{
  "tool": "insert_section",
  "heading": "Literature Review",
  "level": 2,
  "content": "Previous studies have examined...",
  "after": "Introduction"
}
```

---

## Formatting

### format_toggle

**Call:**
```json
{
  "tool": "format_toggle",
  "mark": "bold"
}
```

**Response:**
```json
{
  "success": true,
  "mark": "bold",
  "applied": true
}
```

### format_set_link

**Call:**
```json
{
  "tool": "format_set_link",
  "url": "https://example.com/paper",
  "title": "Reference Paper"
}
```

### block_set_type

**Call:**
```json
{
  "tool": "block_set_type",
  "type": "heading",
  "attrs": {
    "level": 2
  }
}
```

### block_set_type - Code block

**Call:**
```json
{
  "tool": "block_set_type",
  "type": "codeBlock",
  "attrs": {
    "language": "python"
  }
}
```

---

## Lists

### list_toggle

**Call:**
```json
{
  "tool": "list_toggle",
  "type": "bulletList"
}
```

### list_modify - Batch operations

**Call:**
```json
{
  "tool": "list_modify",
  "operations": [
    { "type": "addItem", "after": "item_3", "content": "New list item" },
    { "type": "updateItem", "itemId": "item_1", "content": "Updated first item" },
    { "type": "toggleCheck", "itemId": "item_2", "checked": true }
  ]
}
```

---

## Tables

### table_insert

**Call:**
```json
{
  "tool": "table_insert",
  "rows": 4,
  "cols": 3
}
```

### table_modify

**Call:**
```json
{
  "tool": "table_modify",
  "operations": [
    { "type": "updateCell", "row": 0, "col": 0, "content": "Name" },
    { "type": "updateCell", "row": 0, "col": 1, "content": "Value" },
    { "type": "updateCell", "row": 0, "col": 2, "content": "Status" },
    { "type": "addRow", "position": "after", "rowIndex": 3 },
    { "type": "updateCell", "row": 4, "col": 0, "content": "Total" }
  ]
}
```

---

## Suggestions

### suggestion_list

**Call:**
```json
{
  "tool": "suggestion_list"
}
```

**Response:**
```json
{
  "count": 3,
  "suggestions": [
    {
      "id": "sug_a1b2c3",
      "type": "replace",
      "position": { "from": 234, "to": 289 },
      "original": "This is an important finding...",
      "replacement": "This is a critically important finding...",
      "createdAt": "2024-01-15T10:30:00Z"
    },
    {
      "id": "sug_d4e5f6",
      "type": "insert",
      "position": { "from": 450, "to": 450 },
      "content": "Furthermore, this aligns with...",
      "createdAt": "2024-01-15T10:30:05Z"
    }
  ]
}
```

### suggestion_accept

**Call:**
```json
{
  "tool": "suggestion_accept",
  "suggestionId": "sug_a1b2c3"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Suggestion sug_a1b2c3 accepted and applied"
}
```

### suggestion_accept_all

**Call:**
```json
{
  "tool": "suggestion_accept_all"
}
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "message": "Accepted 3 suggestion(s)"
}
```

---

## Workspace & Tabs

### tabs_list

**Call:**
```json
{
  "tool": "tabs_list"
}
```

**Response:**
```json
{
  "tabs": [
    { "id": "tab_1", "title": "Research Paper.md", "path": "/docs/paper.md", "active": true, "dirty": false },
    { "id": "tab_2", "title": "Notes.md", "path": "/docs/notes.md", "active": false, "dirty": true },
    { "id": "tab_3", "title": "Untitled", "path": null, "active": false, "dirty": false }
  ]
}
```

### tabs_switch

**Call:**
```json
{
  "tool": "tabs_switch",
  "tabId": "tab_2"
}
```

### workspace_open_document

**Call:**
```json
{
  "tool": "workspace_open_document",
  "path": "/Users/writer/Documents/reference.md"
}
```

### workspace_save_document

**Call:**
```json
{
  "tool": "workspace_save_document"
}
```

---

## Special Content

### insert_math_inline

**Call:**
```json
{
  "tool": "insert_math_inline",
  "latex": "E = mc^2"
}
```

### insert_math_block

**Call:**
```json
{
  "tool": "insert_math_block",
  "latex": "\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}"
}
```

### insert_mermaid

**Call:**
```json
{
  "tool": "insert_mermaid",
  "code": "graph TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Action 1]\n    B -->|No| D[Action 2]"
}
```

### insert_wiki_link

**Call:**
```json
{
  "tool": "insert_wiki_link",
  "target": "Related Concepts",
  "alias": "see also"
}
```

---

## Error Responses

### Conflict Error

```json
{
  "error": "CONFLICT",
  "message": "Document revision changed from rev_a7b3c9 to rev_f1g2h3",
  "currentRevision": "rev_f1g2h3"
}
```

**Action:** Re-read document, get new revision, retry.

### Node Not Found

```json
{
  "error": "NODE_NOT_FOUND",
  "message": "Node node_999 does not exist",
  "nodeId": "node_999"
}
```

**Action:** Re-query with `list_blocks` to find current node IDs.

### Invalid Operation

```json
{
  "error": "INVALID_OPERATION",
  "message": "Cannot apply 'bold' mark to codeBlock node"
}
```

**Action:** Check node type before applying formatting.

### Max Operations Exceeded

```json
{
  "error": "LIMIT_EXCEEDED",
  "message": "Maximum 100 operations per batch",
  "limit": 100,
  "requested": 150
}
```

**Action:** Split into multiple batch_edit calls.
