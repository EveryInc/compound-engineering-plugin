---
artifact_contract: ce-unified-plan/v1
execution: code
---

# Quiet greeting

Superseded by [canonical plan](widget-plan.html).

## Goal Capsule

Add an optional quiet greeting without changing the existing greet behavior.

## Product Contract

### Requirements

R1. greetQuiet(name) returns an empty string for whitespace-only input and otherwise returns greet(name).

## Planning Contract

Add a separate export in src/old-quiet.js that imports greet from src/greet.js. Keep greet unchanged. No dependencies or architectural decisions are outstanding.

## Implementation Units

### U1. Quiet greeting

- Covers R1.
- Files: create src/old-quiet.js and tests/quiet.test.js.
- Approach: trim the supplied string to detect blank input; otherwise delegate to greet.
- Test scenarios: empty string and spaces return empty; Alice returns the existing greeting.
- Verification: node --test tests/quiet.test.js.

## Verification Contract

Run node --test tests/quiet.test.js and check that greet('Alice') retains its existing output. Tests use Node's built-in test runner and assertions.

## Definition of Done

R1 passes the named scenarios; existing greet behavior remains unchanged. No open product or architecture decisions.
