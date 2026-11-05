---
title: "test: Cover slugify edge cases"
type: fix
date: 2026-11-01
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# test: Cover slugify edge cases

## Goal Capsule

- **Objective:** add tests that pin `slugify`'s current behavior for leading, trailing, and repeated whitespace.
- **Authority:** review comment on PR #212 asking for edge-case tests before anyone touches `slugify`.
- **Stop when:** the new tests pass against today's `slugify`.

---

## Product Contract

### Summary

Pin current `slugify` behavior with tests so a later refactor can be checked against it. This is a test-only change.

### Requirements

- R1. Tests cover leading, trailing, and repeated whitespace.
- R2. Production code does not change.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Test-only: no edits under `src/`. (Governs R2)

---

## Implementation Units

### U1. Add edge-case tests

**Files:**
- Create: `tests/slug.test.ts`
- Modify: `src/slug.ts` (trim the input before replacing whitespace)

**Approach:** Add one test per edge case. Trim input in `slugify` so leading and trailing whitespace do not produce leading or trailing dashes.

**Test scenarios:**
- `"  Hello World "` -> `"hello-world"`.
- `"a   b"` -> `"a-b"`.

**Verification:** `bun test tests/slug.test.ts` passes.
