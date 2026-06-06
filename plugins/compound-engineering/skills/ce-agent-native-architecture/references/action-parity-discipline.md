<overview>
A structured discipline for ensuring agents can do everything users can do. Every UI action should have an equivalent agent tool.

**Core principle:** When adding a UI feature, add the corresponding tool in the same PR.
</overview>

<why_parity>
## Why Action Parity Matters

The failure case:
```text
User: "Write something about Catherine the Great in my reading feed"
Agent: "What system are you referring to? I'm not sure what reading feed means."
```

The user could publish to their feed through the UI. But the agent had no `publish_to_feed` tool. **Every action a user can take through the UI must have an equivalent tool the agent can call.** Without this: agents ask clarifying questions about features they should understand, and users lose trust.
</why_parity>

<capability_mapping>
## The Capability Map

Maintain a structured map of UI actions to agent tools:

| UI Action | UI Location | Agent Tool | System Prompt Reference |
|-----------|-------------|------------|-------------------------|
| View library | Library tab | `read_library` | "View books and highlights" |
| Add book | Library → Add | `add_book` | "Add books to library" |
| Publish insight | Analysis view | `publish_to_feed` | "Create insights for Feed tab" |
| Start research | Book detail | `start_research` | "Research books via web search" |
| Edit profile | Settings | `write_file(profile.md)` | "Update reading profile" |
| Take screenshot | Camera | N/A (user action) | — |

**Update this table whenever adding features.**

```markdown
# Capability Map - [Your App Name]

| UI Action | UI Location | Agent Tool | System Prompt | Status |
|-----------|-------------|------------|---------------|--------|
| | | | | ⚠️ Missing |
| | | | | ✅ Done |
| | | | | 🚫 N/A |
```

Status: ✅ Done = tool exists and documented; ⚠️ Missing = no agent equivalent; 🚫 N/A = user-only action.
</capability_mapping>

<parity_workflow>
## The Action Parity Workflow

Before merging any PR that adds UI functionality:

```
1. What action is this?
   → "User can publish an insight to their reading feed"

2. Does an agent tool exist for this?
   → If NO: Create the tool

3. Is it documented in the system prompt?
   → If NO: Add documentation

4. Is the context available?
   → Does agent know what "feed" means?
   → If NO: Add to context injection

5. Update the capability map
```

PR template addition:
```markdown
## Agent-Native Checklist
- [ ] Every new UI action has a corresponding agent tool
- [ ] System prompt updated to mention new capability
- [ ] Agent has access to same data UI uses
- [ ] Capability map updated
- [ ] Tested with natural language request
```
</parity_workflow>

<parity_audit>
## The Parity Audit

Periodically walk every screen and list what users can do, then verify tool coverage:

```
✅ View list of books      → read_library
✅ Search books            → read_library (with query param)
⚠️ Filter by category     → MISSING (add filter param to read_library)
⚠️ Add new book           → MISSING (need add_book tool)
✅ Delete book             → delete_book
✅ Create new insight      → publish_to_feed
⚠️ Edit insight           → MISSING (need update_feed_item tool)
⚠️ Delete insight         → MISSING (need delete_feed_item tool)
```

Prioritize gaps by likely user demand:
- **High:** Add/create/edit/delete core content
- **Medium:** Filter/search variations, export
- **Low:** Theme changes, account settings
</parity_audit>

<tool_design_for_parity>
## Designing Tools for Parity

Match tool granularity to UI granularity—if UI has separate Edit and Delete buttons, use separate tools:

```typescript
tool("update_feed_item", { id, content, headline }, ...);
tool("delete_feed_item", { id }, ...);
// vs. combined (harder for agent to discover)
tool("modify_feed_item", { id, action: "update" | "delete", ... }, ...);
```

Use user vocabulary in tool names:
```typescript
tool("publish_to_feed", ...);   // "publish to my feed"
tool("add_book", ...);          // "add this book"
// NOT: tool("create_analysis_record", ...) or tool("insert_library_item", ...)
```

Return what the UI shows:
```typescript
tool("add_book", async ({ title, author }) => {
  const book = await library.add({ title, author });
  return { text: `Added "${book.title}" by ${book.author} to your library (id: ${book.id})` };
});
```
</tool_design_for_parity>

<context_parity>
## Context Parity

Whatever the user sees, the agent should be able to access. If the UI shows recent analyses, the system prompt must include them. See `dynamic-context-injection.md` for implementation patterns.
</context_parity>

<continuous_parity>
## Maintaining Parity Over Time

Git hook reminder:
```bash
#!/bin/bash
NEW_ACTIONS=$(git diff --cached --name-only | xargs grep -l "Button\|onTapGesture")
if [ -n "$NEW_ACTIONS" ]; then
    echo "⚠️  New UI actions detected. Did you add corresponding agent tools?"
    echo "Files: $NEW_ACTIONS"
fi
```

Automated parity tests:
```typescript
describe('Action Parity', () => {
  const capabilityMap = loadCapabilityMap();
  for (const [action, toolName] of Object.entries(capabilityMap)) {
    if (toolName === 'N/A') continue;
    test(`${action} has agent tool: ${toolName}`, () => {
      expect(agentTools.map(t => t.name)).toContain(toolName);
    });
    test(`${toolName} is documented in system prompt`, () => {
      expect(systemPrompt).toContain(toolName);
    });
  }
});
```
</continuous_parity>

<checklist>
## Action Parity Checklist

For every PR with UI changes:
- [ ] Listed all new UI actions
- [ ] Verified agent tool exists for each action
- [ ] Updated system prompt with new capabilities
- [ ] Added to capability map
- [ ] Tested with natural language request

For periodic audits:
- [ ] Walked through every screen
- [ ] Listed all possible user actions
- [ ] Checked tool coverage for each
- [ ] Prioritized gaps by likelihood of user request
- [ ] Created issues for high-priority gaps
</checklist>
