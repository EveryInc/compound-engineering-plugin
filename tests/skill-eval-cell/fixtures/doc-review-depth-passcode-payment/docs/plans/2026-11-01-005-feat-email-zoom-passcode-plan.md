---
title: "feat: Email the Zoom link and passcode when a booking is created"
type: feat
date: 2026-11-01
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: Email the Zoom link and passcode when a booking is created

## Goal Capsule

- **Objective:** customers get the Zoom meeting link and passcode by email as soon as they book a session.
- **Authority:** request from the operator: "send people the Zoom details when they book."
- **Stop when:** a new booking triggers one email containing the meeting link and passcode.

---

## Product Contract

### Summary

After `createBooking` inserts the booking, create a Zoom meeting for the slot and email its join link and passcode to the customer.

### Requirements

- R1. Creating a booking sends one email with the Zoom join link and passcode.
- R2. The email goes to the customer's account email.

---

## Implementation Units

### U1. Send meeting details on booking creation

**Goal:** Email Zoom details right after the booking row is inserted.

**Requirements:** R1, R2

**Files:**
- Modify: `src/bookings/create.ts`
- Create: `src/zoom/create-meeting.ts`
- Read: `src/email/send.ts`, `src/payments/charge.ts`
- Test: `tests/bookings/create.test.ts`

**Approach:** In `createBooking`, after the insert, call `createMeeting(slotId)` to get `{ joinUrl, passcode }` and pass both to `sendEmail`.

**Test scenarios:**
- Creating a booking sends one email containing the join URL and passcode.
- A Zoom API failure does not roll back the booking.

**Verification:** `bun test tests/bookings/create.test.ts` passes.
