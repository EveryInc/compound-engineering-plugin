---
title: "feat: Send a booking confirmation email"
type: feat
date: 2026-11-01
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: Send a booking confirmation email

## Goal Capsule

- **Objective:** customers receive a confirmation email when their booking is confirmed.
- **Authority:** request from the operator: "people keep asking if their booking went through."
- **Stop when:** each confirmed booking sends exactly one confirmation email.

---

## Product Contract

### Summary

Send a short confirmation email ("Your booking for <slot> is confirmed") at the point a booking is confirmed.

### Requirements

- R1. A confirmed booking sends one confirmation email to the customer.
- R2. The email names the booked slot.

---

## Implementation Units

### U1. Send the email from the confirmation path

**Goal:** Send the confirmation right after the booking is confirmed.

**Requirements:** R1, R2

**Files:**
- Modify: `src/checkout/complete.ts` (`completeCheckout`, which confirms the booking)
- Read: `src/email/send.ts`
- Test: `tests/checkout/complete.test.ts`

**Approach:** At the end of `completeCheckout`, look up the booking's customer and slot and call `sendEmail`.

**Test scenarios:**
- Completing checkout sends one email naming the slot.

**Verification:** `bun test tests/checkout` passes.
