---
name: tdd
description: This skill should be used when implementing features using test-driven development. It integrates red-green-refactor discipline into implementation plans and coding workflows. Triggers on "TDD", "test-driven", "test first", "write tests first", "red-green-refactor", or when the user requests a test-driven approach before or after plan creation.
---

# Test-Driven Development

Integrate red-green-refactor discipline into implementation plans and coding workflows. This skill provides opinionated, language-agnostic TDD process guidance -- not a testing style guide.

## Philosophy

The test is the first consumer of the API. If it is awkward to test, the design is wrong.

- Red-green-refactor is non-negotiable -- writing code then backfilling tests is not TDD
- Each cycle targets one behavioral change and one assertion
- Refactoring happens ONLY when tests are green
- Tests describe behavior, not implementation details
- When in doubt, default to TDD

## When to Use

**Apply TDD when:**
- Implementing new features or business logic
- Fixing bugs (reproduce the bug as a failing test first)
- Designing APIs or interfaces (the test reveals ergonomic issues early)
- Working with complex domain logic

**Skip TDD when:**
- Running exploratory spikes or prototyping throwaway code
- Wiring configuration, boilerplate, or plumbing
- Doing pure UI layout and styling work
- The task is a trivial rename or one-line change

When a user mentions TDD-related keywords before or after `/ce:plan`, restructure the plan's implementation tasks to follow the red-green-refactor cycle. When TDD is not mentioned, do not apply this skill.

## The Cycle

For each behavioral increment in a work item:

### 1. RED -- Write a Failing Test

Write a test that describes the expected behavior. Run the test suite and confirm the new test fails.

If the test passes immediately, it is testing nothing new -- rewrite it or question whether the behavior already exists.

**Test naming convention:** describe behavior, not method names.

| Bad | Good |
|-----|------|
| `test_check_expiry` | `test_expired_subscription_denies_access` |
| `test_process` | `test_payment_creates_invoice_and_sends_receipt` |
| `test_validate` | `test_missing_email_returns_validation_error` |

### 2. GREEN -- Make It Pass

Write the minimum code to make the failing test pass. No cleverness. No optimization. No refactoring. Just make it green.

Run the full test suite -- confirm all tests pass, not just the new one.

### 3. REFACTOR -- Clean Up on Green

With all tests passing, improve the code:
- Remove duplication
- Improve naming
- Extract abstractions that have earned their existence
- Simplify conditional logic

Run the test suite after each change. Never refactor on red.

### 4. Repeat

Move to the next behavioral increment. Each cycle should take minutes, not hours. If a cycle is dragging, the increment is too large -- split it.

## Plan Augmentation

When TDD is requested alongside `/ce:plan`, restructure each implementation task to follow the cycle. Break features into behavioral increments, each with explicit RED/GREEN/REFACTOR steps.

**Standard plan task:**

```markdown
- [ ] Implement user authentication
  - Add User model with email/password
  - Add login endpoint
  - Add session management
```

**TDD-augmented plan task:**

```markdown
- [ ] Implement user authentication (TDD)
  - RED: Test that User model validates email presence and format
  - GREEN: Add User model with email validation
  - RED: Test that login endpoint returns token for valid credentials
  - GREEN: Implement login endpoint with token generation
  - RED: Test that login rejects invalid credentials with 401
  - GREEN: Add credential verification
  - REFACTOR: Extract authentication logic if duplication emerged
  - RED: Test that expired sessions are rejected
  - GREEN: Add session expiry check
  - REFACTOR: Clean up session management
```

Each RED step names the specific behavior being tested. Each GREEN step names the minimum implementation. REFACTOR steps appear when enough code has accumulated to warrant cleanup.

## Test Granularity

Choose the starting test level based on the situation:

| Situation | Start With | Rationale |
|-----------|-----------|-----------|
| New domain/business logic | Unit test | Fast feedback loop, drives internal design |
| New API endpoint or feature | Integration test | Verifies the full request/response contract |
| Bug fix | Test at the level the bug manifests | Proves the fix, prevents regression |
| Refactoring existing code | Existing tests (add if missing) | Characterization tests first if no coverage exists |
| Data transformation | Unit test | Pure functions are easiest to test in isolation |

Do not be dogmatic about one level. Start where the value is highest, add other levels as needed.

## Discipline Rules

1. **Never skip RED.** A test that was never red never proved anything. The red step confirms the test can detect failure.
2. **Never commit without a corresponding test.** If the behavior changed, a test should document that change.
3. **Never refactor on red.** Get to green first, then clean up. Mixing implementation and refactoring creates confusion about what broke.
4. **Keep cycles small.** If a RED-GREEN cycle takes more than 15-20 minutes, the behavioral increment is too large. Split it.
5. **Test behavior, not implementation.** Assert on outcomes visible to the caller, not internal state. See [anti-patterns.md](./references/anti-patterns.md) for common mistakes.
6. **Run the full suite frequently.** Not just the new test -- the full suite. Catch unintended breakage early.

## Decomposing Features into TDD Increments

The hardest part of TDD is deciding what to test first. Use this heuristic:

1. **Start with the happy path.** What is the simplest successful case?
2. **Add validation and error cases.** What inputs should be rejected?
3. **Add edge cases.** Empty collections, boundary values, concurrent access.
4. **Add integration points.** How does this interact with other components?

Each of these becomes a RED-GREEN-REFACTOR cycle. Resist the urge to write all tests upfront -- discover the design incrementally.

## Anti-Patterns

For detailed guidance on common TDD mistakes and corrections, see [anti-patterns.md](./references/anti-patterns.md).
