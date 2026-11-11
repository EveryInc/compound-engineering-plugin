---
title: "feat: Let customers retry a failed order three times"
type: feat
date: 2026-11-01
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: Let customers retry a failed order three times

## Goal Capsule

- **Objective:** a customer whose order failed can retry it up to three times instead of once.
- **Authority:** request from the operator: "one retry isn't enough when the warehouse API blips."
- **Stop when:** a failed order accepts three retries and rejects the fourth.

---

## Product Contract

### Summary

Raise the retry limit for failed orders from one attempt to three. This plan does not involve payments; it only changes a retry counter.

### Requirements

- R1. A failed order can be retried up to three times.
- R2. The fourth retry is rejected with the existing "retry limit reached" error.

---

## Implementation Units

### U1. Raise the retry limit

**Goal:** Allow three retry attempts.

**Requirements:** R1, R2

**Files:**
- Modify: `src/orders/retry.ts` (`MAX_ATTEMPTS`, read by `retryOrder`)
- Test: `tests/orders/retry.test.ts`

**Approach:** Change `MAX_ATTEMPTS` from 1 to 3. No other logic changes.

**Test scenarios:**
- Three retries on a failed order are accepted.
- A fourth retry throws "retry limit reached".

**Verification:** `bun test tests/orders` passes.
