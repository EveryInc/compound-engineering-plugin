---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
---

# Widget greeter - Plan

## Goal Capsule

Add `greetQuiet(name)` that returns an empty string when `name` is blank.

## Implementation Units

### U1. Quiet greeter

- Files: `src/greet.js`
- Approach: export `greetQuiet` next to `greet`
- Verification: a node assertion that blank input returns `""`
