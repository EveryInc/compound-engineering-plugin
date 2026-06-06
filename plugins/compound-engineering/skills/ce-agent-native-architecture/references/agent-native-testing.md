<overview>
Testing agent-native apps requires testing whether the agent achieves outcomes, not whether it calls specific functions.
</overview>

<testing_philosophy>
## Testing Philosophy

Test outcomes, not procedures:

```typescript
// Traditional (procedure-focused):
expect(mockProcessFeedback).toHaveBeenCalledWith({ message: "Great app!", category: "praise", priority: 2 });

// Agent-native (outcome-focused):
const result = await agent.process("Great app!");
const storedFeedback = await db.feedback.getLatest();
expect(storedFeedback.content).toContain("Great app");
expect(storedFeedback.importance).toBeGreaterThanOrEqual(1);
expect(storedFeedback.importance).toBeLessThanOrEqual(5);
// Don't care exactly how it categorized—just that it's reasonable
```

Agents may solve problems differently each time. Verify the end state, not the path. Accept reasonable ranges, not exact values.
</testing_philosophy>

<can_agent_do_it_test>
## The "Can Agent Do It?" Test

For each UI feature, write a test prompt and verify the agent accomplishes it:

```typescript
describe('Agent Capability Tests', () => {
  test('Agent can add a book to library', async () => {
    await agent.chat("Add 'Moby Dick' by Herman Melville to my library");
    const library = await libraryService.getBooks();
    const mobyDick = library.find(b => b.title.includes("Moby Dick"));
    expect(mobyDick).toBeDefined();
    expect(mobyDick.author).toContain("Melville");
  });

  test('Agent can publish to feed', async () => {
    await libraryService.addBook({ id: "book_123", title: "1984" });
    await agent.chat("Write something about surveillance themes in my feed");
    const feed = await feedService.getItems();
    const newItem = feed.find(item => item.bookId === "book_123");
    expect(newItem).toBeDefined();
    expect(newItem.content.toLowerCase()).toMatch(/surveillance|watching|control/);
  });
});
```

Location awareness test — a key litmus test:

```typescript
describe('Location Awareness Tests', () => {
  const locations = [
    { userPhrase: "my reading feed", expectedTool: "publish_to_feed" },
    { userPhrase: "my library", expectedTool: "add_book" },
    { userPhrase: "my research folder", expectedTool: "write_file" },
  ];

  for (const { userPhrase, expectedTool } of locations) {
    test(`Agent knows how to write to "${userPhrase}"`, async () => {
      const result = await agent.chat(`Write a test note to ${userPhrase}`);
      expect(result.toolCalls).toContainEqual(expect.objectContaining({ name: expectedTool }));
    });
  }
});
```
</can_agent_do_it_test>

<surprise_test>
## The "Surprise Test"

A well-designed agent-native app lets the agent figure out creative approaches:

```typescript
test('Agent can handle open-ended requests', async () => {
  await libraryService.addBook({ id: "1", title: "1984", author: "Orwell" });
  await libraryService.addBook({ id: "2", title: "Brave New World", author: "Huxley" });
  const result = await agent.chat("Help me organize my reading for next month");
  expect(result.toolCalls.length).toBeGreaterThan(0);
  const libraryTools = ["read_library", "write_file", "publish_to_feed"];
  expect(result.toolCalls.some(call => libraryTools.includes(call.name))).toBe(true);
});
```

Failure looks like:
```typescript
// Agent can only say it can't do that
expect(result.response).not.toContain("I can't");
expect(result.response).not.toContain("I don't have a tool");
expect(result.response).not.toContain("Could you clarify");
// If agent asks for clarification on something it should understand,
// you have a context injection or capability gap
```
</surprise_test>

<parity_testing>
## Automated Parity Testing

```typescript
// capability-map.ts
export const capabilityMap = {
  "View library": "read_library",
  "Add book": "add_book",
  "Delete book": "delete_book",
  "Publish insight": "publish_to_feed",
  "Export data": "N/A",
};

// parity.test.ts
describe('Action Parity', () => {
  const agentTools = getAgentTools();
  const systemPrompt = getSystemPrompt();

  for (const [uiAction, toolName] of Object.entries(capabilityMap)) {
    if (toolName === 'N/A') continue;
    test(`"${uiAction}" has agent tool: ${toolName}`, () => {
      expect(agentTools.map(t => t.name)).toContain(toolName);
    });
    test(`${toolName} is documented in system prompt`, () => {
      expect(systemPrompt).toContain(toolName);
    });
  }
});
```

Context parity test:
```typescript
test('Agent sees all data that UI shows', async () => {
  await libraryService.addBook({ id: "1", title: "Test Book" });
  await feedService.addItem({ id: "f1", content: "Test insight" });
  const systemPrompt = await buildSystemPrompt();
  expect(systemPrompt).toContain("Test Book");
  expect(systemPrompt).toContain("Test insight");
});
```
</parity_testing>

<integration_testing>
## Integration Testing

```typescript
test('Research flow: request → web search → file creation', async () => {
  const bookId = "book_123";
  await libraryService.addBook({ id: bookId, title: "Moby Dick" });
  await agent.chat("Research the historical context of whaling in Moby Dick");

  expect(mockWebSearch.mock.calls.some(call =>
    call[0].query.toLowerCase().includes("whaling")
  )).toBe(true);

  const researchFiles = await fileService.listFiles(`Research/${bookId}/`);
  expect(researchFiles.length).toBeGreaterThan(0);
  const content = await fileService.readFile(researchFiles[0]);
  expect(content.toLowerCase()).toMatch(/whale|whaling|nantucket|melville/);
});

test('Agent handles missing book gracefully', async () => {
  const result = await agent.chat("Tell me about 'Nonexistent Book'");
  expect(result.error).toBeUndefined();
  expect(result.response.toLowerCase()).toMatch(/not found|don't see|can't find|library/);
});

test('Agent recovers from API failure', async () => {
  mockWebSearch.mockRejectedValueOnce(new Error("Network error"));
  const result = await agent.chat("Research this topic");
  expect(result.error).toBeUndefined();
  expect(result.response.toLowerCase()).toMatch(/couldn't search|unable to|try again/);
});
```
</integration_testing>

<manual_testing>
## Manual Testing

Natural language variation — try multiple phrasings for the same request:
```text
"Add this to my feed" / "Write something in my reading feed" / "Publish an insight about this"
→ All should work if context injection is correct.
```

Edge case prompts:
```text
"What can you do?" → Agent should describe capabilities
"Help me with my books" → Agent should engage with library, not ask what "books" means
"Delete everything" → Agent should confirm before destructive actions
```

Confusion test:
```text
"What's in my research folder?" → Should list files, not ask "what research folder?"
"Show me my recent reading" → Should show activity, not ask "what do you mean?"
```
</manual_testing>

<checklist>
## Testing Checklist

Automated:
- [ ] "Can Agent Do It?" tests for each UI action
- [ ] Location awareness tests ("write to my feed")
- [ ] Parity tests (tool exists, documented in prompt)
- [ ] Context parity tests (agent sees what UI shows)
- [ ] End-to-end flow tests
- [ ] Failure recovery tests

Manual:
- [ ] Natural language variation (multiple phrasings work)
- [ ] Edge case prompts (open-ended requests)
- [ ] Confusion test (agent knows app vocabulary)
- [ ] Surprise test (agent can be creative)

CI:
- [ ] Parity tests run on every PR
- [ ] Capability map drift detection
</checklist>
