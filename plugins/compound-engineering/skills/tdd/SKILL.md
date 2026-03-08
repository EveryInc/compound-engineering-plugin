---
name: tdd
description: This skill should be used when implementing features using test-driven development. It integrates red-green-refactor discipline into implementation plans and coding workflows. Triggers on "TDD", "test-driven", "test first", "write tests first", "red-green-refactor", or when the user requests a test-driven approach before or after plan creation.
---

# Test-Driven Development

Integrate red-green-refactor discipline into implementation plans and coding workflows. This skill provides opinionated, language-agnostic TDD process guidance -- not a testing style guide.

## Philosophy

The test is the first consumer of the API. If it is awkward to test, the design is wrong.

This skill follows the Classical (Chicago) school of TDD: prefer real objects over test doubles, assert on state and outcomes, mock only at system boundaries. The London (Mockist) school -- which drives design through interaction-based testing with mocks for all collaborators -- is a valid alternative but is not the approach taught here.

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

When TDD is not mentioned, do not apply this skill.

## Activation

When this skill triggers:

1. **Detect the test runner.** Identify the project's test framework from configuration files (package.json, Gemfile, pyproject.toml, go.mod, Cargo.toml, pom.xml, etc.). Use the detected runner for all RED/GREEN verification steps.
2. **If a plan exists or is being created** (`/ce:plan`), restructure implementation tasks to follow the red-green-refactor cycle (see Restructuring Plans for TDD below).
3. **If no plan exists,** begin the first RED step for the current task.

## The Cycle

For each behavioral increment in a work item:

### 1. RED -- Write a Failing Test

Write a test that describes the expected behavior. Run the test suite and confirm the new test fails.

If the test passes immediately, investigate why. If the behavior already exists, skip this cycle and move to the next increment. If the test is not actually exercising the intended behavior, rewrite it until it fails. A test that was never red is not trustworthy.

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

## Restructuring Plans for TDD

When TDD is requested alongside `/ce:plan`, restructure each implementation task to follow the cycle. Break features into behavioral increments, each with explicit RED/GREEN/REFACTOR steps.

To decompose a feature into increments: start with the simplest happy path, then add validation and error cases, then edge cases, then integration points. Each becomes a RED-GREEN-REFACTOR cycle. Resist the urge to write all tests upfront -- discover the design incrementally.

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

### Adding TDD to Untested Code

When adding features to code with no test coverage, do not start TDD on the new feature immediately. First, write characterization tests -- tests that document the code's *current* behavior, whether correct or not:

1. Run the existing code and observe what it does
2. Write tests that assert the current behavior
3. Confirm these tests pass (they should -- they describe what already exists)
4. Now begin TDD for the new feature, with characterization tests as a safety net

Characterization tests prevent the new feature from accidentally breaking existing behavior that users depend on.

## Discipline Rules

1. **Never skip RED.** A test that was never red never proved anything. The red step confirms the test can detect failure.
2. **Never commit a behavioral change without a corresponding test.** Configuration, boilerplate, and trivial renames are exempt (see "Skip TDD when" above), but any change to how the system behaves needs a test.
3. **Never refactor on red.** Get to green first, then clean up. Mixing implementation and refactoring creates confusion about what broke.
4. **Keep cycles small.** If a RED-GREEN cycle takes more than 15-20 minutes, the behavioral increment is too large. Split it.
5. **Test behavior, not implementation.** Assert on outcomes visible to the caller, not internal state. A single behavior may have multiple observable effects worth asserting -- "one behavior per test" not "one assertion per test." See [anti-patterns.md](./references/anti-patterns.md) for common mistakes.
6. **Run the full suite frequently.** Not just the new test -- the full suite. Catch unintended breakage early.

