---
title: "feat: Make \"remember me\" last 90 days"
type: feat
date: 2026-11-01
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: Make "remember me" last 90 days

## Goal Capsule

- **Objective:** people who tick "remember me" stay signed in for 90 days instead of 7.
- **Authority:** request from the operator: "users complain they keep getting logged out."
- **Stop when:** ticking "remember me" keeps the user signed in for 90 days.

---

## Product Contract

### Summary

Extend the "remember me" duration from 7 days to 90 days.

### Requirements

- R1. With "remember me" ticked, the user stays signed in for 90 days.
- R2. Without it, behavior is unchanged.

---

## Implementation Units

### U1. Change the duration

**Files:**
- Modify: `src/session/issue.ts` (`issueSessionToken`)
- Test: `tests/session/issue.test.ts`

**Approach:** Change `7 * DAY` to `90 * DAY`.

**Test scenarios:**
- `remember: true` expires 90 days out.
- `remember: false` still expires in one day.

**Verification:** `bun test tests/session` passes.
