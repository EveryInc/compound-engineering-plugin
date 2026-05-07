# Testing Anti-Patterns

Load this reference when writing or changing tests, adding mocks, or tempted to add test-only methods to production code.

Adapted from [Superpowers](https://github.com/obra/superpowers) `testing-anti-patterns` reference.

## The Iron Laws

```
1. NEVER test mock behavior
2. NEVER add test-only methods to production classes
3. NEVER mock without understanding dependencies
```

## Anti-Pattern 1: Testing Mock Behavior

**The violation:** Asserting that a mock exists rather than testing real component behavior.

```typescript
// BAD: Testing that the mock exists
test('renders sidebar', () => {
  render(<Page />);
  expect(screen.getByTestId('sidebar-mock')).toBeInTheDocument();
});
```

**Why it's wrong:** You're verifying the mock works, not that the component works. Test passes when mock is present, tells you nothing about real behavior.

**The fix:** Test real component behavior, or don't mock it.

```typescript
// GOOD: Test real component
test('renders sidebar', () => {
  render(<Page />);
  expect(screen.getByRole('navigation')).toBeInTheDocument();
});
```

**Gate:** Before asserting on any mock element, ask: "Am I testing real behavior or just mock existence?" If mock existence — delete the assertion.

## Anti-Pattern 2: Test-Only Methods in Production

**The violation:** Adding methods to production classes that only tests call (e.g., `destroy()`, `reset()`, `_testHelper()`).

**Why it's wrong:** Pollutes production code with test concerns. Dangerous if accidentally called in production. Confuses object lifecycle.

**The fix:** Put test cleanup and helpers in test utility files, not production classes.

**Gate:** Before adding any method to a production class, ask: "Is this only used by tests?" If yes — put it in test utilities instead.

## Anti-Pattern 3: Mocking Without Understanding

**The violation:** Over-mocking to "be safe" and accidentally removing behavior the test depends on.

```typescript
// BAD: Mock prevents config write that test depends on
vi.mock('ToolCatalog', () => ({
  discoverAndCacheTools: vi.fn().mockResolvedValue(undefined)
}));
// Test fails mysteriously because mocked method had a side effect
```

**Why it's wrong:** The mocked method had side effects the test depended on. Over-mocking breaks actual behavior.

**The fix:** Mock at the correct level — mock the slow/external operation, not the high-level method.

**Gate:** Before mocking any method:
1. What side effects does the real method have?
2. Does this test depend on any of those side effects?
3. If yes — mock at a lower level that preserves necessary behavior

Red flags: "I'll mock this to be safe", "This might be slow, better mock it", mocking without understanding the dependency chain.

## Anti-Pattern 4: Incomplete Mocks

**The violation:** Partial mocks that only include fields you think you need.

```typescript
// BAD: Missing metadata that downstream code uses
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' }
  // Missing: metadata.requestId consumed downstream
};
```

**Why it's wrong:** Partial mocks hide structural assumptions. Tests pass but integration fails.

**The fix:** Mirror the complete real data structure.

**Gate:** Before creating mock responses, check: "What fields does the real API response contain?" Include ALL fields the system might consume downstream.

## Anti-Pattern 5: Integration Tests as Afterthought

**The violation:** Claiming implementation is complete without writing tests.

**Why it's wrong:** Testing is part of implementation, not optional follow-up. TDD prevents this entirely.

**The fix:** Follow the TDD cycle. Tests come first, not after.

## Quick Reference

| Anti-Pattern | Fix |
|--------------|-----|
| Assert on mock elements | Test real component or unmock it |
| Test-only methods in production | Move to test utilities |
| Mock without understanding | Understand dependencies first, mock minimally |
| Incomplete mocks | Mirror real API completely |
| Tests as afterthought | TDD — tests first |
| Over-complex mocks | Consider integration tests |

## Red Flags

- Assertion checks for `*-mock` test IDs
- Methods only called in test files
- Mock setup is >50% of test code
- Test fails when you remove mock
- Can't explain why mock is needed
- Mocking "just to be safe"
