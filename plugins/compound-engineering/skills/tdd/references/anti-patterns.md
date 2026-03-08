# TDD Anti-Patterns

Common mistakes that undermine test-driven development, and how to correct them.

## Testing Implementation Instead of Behavior

**Problem:** Tests are coupled to internal details -- private methods, internal state, specific data structures. Any refactoring breaks tests even when behavior is unchanged.

**Example (bad):**
```
# Tests that the internal cache hash has a specific key
assert user._cache[:permissions] == [:read, :write]
```

**Correction:** Assert on outcomes visible to the caller.
```
# Tests that the user has the expected permissions
assert user.can?(:read)
assert user.can?(:write)
```

**Rule of thumb:** If renaming a private method or changing an internal data structure breaks a test, the test is coupled to implementation.

## Writing All Tests First, Then All Code

**Problem:** Writing a full test suite upfront before any implementation. This front-loads design decisions and eliminates the feedback loop that makes TDD valuable.

**Correction:** One cycle at a time. Write one failing test, make it pass, refactor, then write the next test. Let each passing test inform the next one.

## Mocking Everything

**Problem:** Every dependency is mocked, so tests pass but the system does not actually work. Tests verify that mocks return what they were told to return.

**Correction:** Mock at boundaries (external APIs, file systems, third-party services). Use real objects for internal collaborators. If a test requires more than 2-3 mocks, the code under test may have too many dependencies -- that is a design signal, not a testing problem.

## Skipping the Refactor Step

**Problem:** RED-GREEN without REFACTOR. The code works but accumulates duplication, unclear naming, and tangled logic. Technical debt compounds with every cycle.

**Correction:** Refactoring is not optional. After each GREEN, ask: Is there duplication? Are names clear? Is there an abstraction trying to emerge? Even if the answer is "no changes needed," the pause to evaluate is part of the discipline.

## Testing Framework Code

**Problem:** Writing tests that verify the framework does its job -- e.g., testing that Rails validates presence when `validates :name, presence: true` is declared.

**Correction:** Test _your_ logic, not the framework's. If the framework has a well-tested feature and the code simply declares it, trust the framework. Focus tests on business rules, edge cases, and custom behavior.

## Gold-Plating Tests

**Problem:** Over-specified assertions that check every detail of the response. Tests break when irrelevant fields change.

**Example (bad):**
```
assert response == {
  id: 1, name: "Alice", email: "alice@example.com",
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  role: "admin", last_login: nil, avatar_url: nil
}
```

**Correction:** Assert on what matters to the behavior being tested.
```
assert response[:name] == "Alice"
assert response[:role] == "admin"
```

## Slow Test Suites

**Problem:** Tests take so long that developers stop running them frequently. The feedback loop -- the core value of TDD -- breaks down.

**Correction:**
- Prefer unit tests (fast) over integration tests (slower) for logic-heavy code
- Use integration tests strategically for critical paths, not for every code path
- Avoid unnecessary database hits in unit tests
- If the suite takes more than 30 seconds locally, investigate what is slow

## The Test-After Trap

**Problem:** Writing implementation first, then retrofitting tests. The tests end up verifying the implementation rather than specifying behavior. Tests shaped by existing code cannot drive design.

**Correction:** Commit to writing the test first, even when the implementation seems obvious. The discipline of writing the test first often reveals edge cases and API awkwardness that would otherwise be missed.

## Testing Too Many Things at Once

**Problem:** A single test verifies multiple behaviors. When it fails, it is unclear which behavior broke.

**Example (bad):**
```
test "user registration" do
  # Creates user, sends email, logs event, redirects -- all in one test
end
```

**Correction:** One behavior per test. Split into: "registration creates user," "registration sends welcome email," "registration logs signup event." Each test is a sentence that describes one thing.

## Ignoring Test Failure Messages

**Problem:** Tests fail with unhelpful messages like "expected true, got false" or "assertion failed." Debugging requires reading the test source.

**Correction:** Write assertion messages that explain what went wrong in business terms. Good failure messages save time during debugging and serve as documentation.
