---
title: Booking Confirmation Email - Plan
type: feat
date: 2026-11-04
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Booking Confirmation Email - Plan

## Goal Capsule

- **Objective:** An attendee whose booking is confirmed gets an email with what they need to join the session, its join link and passcode, and nobody gets those details before paying.
- **Means:** Send the email from `confirmPayment` when a booking moves from `pending` to `paid`, using the existing mailer (KTD1). First refuse a payment for a session someone else has already paid for, so that payer never receives the access details (KTD4).
- **Authority:** `SPEC.md` outranks this plan. Within the plan, Requirements outrank Key Technical Decisions, and both outrank unit Approach text.
- **Stop conditions:** Stop and report if meeting R1 or R2 would require sending the join link or passcode while a booking is still `pending` (R3).
- **Execution profile:** One pull request, one implementation unit.
- **Who finishes:** The implementing agent builds and verifies U1; the calling pipeline ships the PR.

## Product Contract

### Summary

Email the attendee a booking confirmation containing the session's join link and passcode at the moment their payment is confirmed. Creating a booking sends nothing. A payment for a session that someone else has already paid for is refused, as `SPEC.md` requires, so no access details go out for it.

### Problem Frame

Today a visitor who books and pays for a session receives no message at all. The join link and passcode exist only on the session record, so a paying attendee has no way to learn how to join. The request asks for a confirmation email "when someone books". `SPEC.md` also says nothing that grants access, such as the join link or passcode, may reach the attendee before their payment is confirmed. A booking starts `pending` at `createBooking` and only becomes `paid` in `confirmPayment`, so sending at creation time would break that rule.

### Requirements

**Confirmation email**

- R1. The person who booked a session receives a confirmation email at the address they booked with.
- R2. The confirmation email includes the session's join link and passcode.

**Access gating**

- R3. No email carrying the join link or passcode reaches the attendee before their payment is confirmed (`SPEC.md`).

### Scope Boundaries

- Considered and not built: an acknowledgement email at `createBooking` without access details. The request asked for one confirmation carrying the link and passcode, not a second message. This changes if the requester wants an acknowledgement at booking time.
- Considered and not built: delivery retries or failure handling. `src/mailer.js` appends to an in-memory `outbox` and cannot fail. This changes when a real transport replaces it.
- Outside this change: real email transport, HTML templates, and localized time formatting.

### Open Questions

- Deferred, non-blocking: the request says "when someone books", and this plan sends at payment confirmation to satisfy R3. If the requester meant booking creation, that conflicts with `SPEC.md` and needs their decision. This plan does not resolve that conflict by sending early.

## Planning Contract

### Key Technical Decisions

- KTD1. **Send inside `confirmPayment`, only on the `pending` to `paid` transition.** `confirmPayment` in `src/bookings.js` is the only place a booking becomes `paid`, so putting the send there keeps the R3 gate next to the status change it depends on.
- KTD2. **Build the message from the session record at send time.** Look up the session with `getSession(booking.sessionId)` and pass a plain-text subject and body to `send(to, subject, body)` from `src/mailer.js`. The body lists the host, start time, join link, and passcode.
- KTD3. **Test through the exported `outbox` in a new test file.** `node --test` runs each test file in its own process, so a new file starts with an empty `outbox` and booking map, separate from `test/bookings.test.js`.
- KTD4. **Refuse a second payment for an already-paid session.** Before changing the status, `confirmPayment` throws the existing `session already booked` error when a different booking for the same session is already `paid`. The booking stays `pending` and nothing is sent. `createBooking` checks this only at creation time, so two visitors can both hold `pending` bookings for one session. Without this guard, the second payer would receive the join link for a session `SPEC.md` says they must be refused.

### Assumptions

- The confirmation is sent when payment is confirmed, not when `createBooking` runs. This is the only timing that satisfies R1 through R3 together.
- `createBooking` sends no email of any kind.
- Each booking gets one confirmation. Calling `confirmPayment` again on an already-paid booking does not send it again.
- Besides the join link and passcode, the body includes the host name and start time so the attendee knows which session it refers to. The start time uses the stored ISO string.

## Implementation Units

### U1. Send the confirmation email when payment is confirmed

- **Goal:** A booking that moves to `paid` triggers one confirmation email to the booking's address with the session's access details. A payment for a session someone else already paid for is refused and sends nothing.
- **Requirements:** R1, R2, R3
- **Dependencies:** None
- **Files:**
  - `src/bookings.js` (modify)
  - `test/confirmation-email.test.js` (create)
- **Approach:**
  1. Import `send` from `src/mailer.js` into `src/bookings.js`.
  2. In `confirmPayment`, before changing the status, throw `session already booked` when a different booking for the same session is already `paid` (KTD4).
  3. Note whether the booking was `pending` before setting `paid` (KTD1).
  4. When it was `pending`, compose and send the message per KTD2.
  5. Leave `createBooking` unchanged.
- **Patterns to follow:** The `send(to, subject, body)` signature in `src/mailer.js`; the already-paid check in `createBooking`; the thrown-`Error` style already used in `src/bookings.js` and `src/sessions.js`.
- **Test scenarios:**
  - Happy path: create a booking for `s1` with `a@example.com`, confirm payment, and expect exactly one `outbox` message addressed to `a@example.com` whose body contains `https://meet.example/s1` and `482913`.
  - R3 gate: create a booking and do not confirm it; expect no `outbox` message to that address, and no message body anywhere containing the join link or passcode.
  - Repeat confirmation: call `confirmPayment` a second time on an already-paid booking; expect the count of messages to that address to stay at one.
  - Second payer: create two `pending` bookings for one session with different addresses and confirm the first. Confirming the second throws `session already booked` and leaves it `pending`. `outbox` holds no message to the second address.
  - Error path: `confirmPayment` with an unknown booking id throws `no booking <id>` and adds nothing to `outbox`.
- **Test seam:** These tests read `outbox` directly, so they catch what is sent, to whom, and when. They cannot catch real delivery, which this repo does not have.
- **Verification:** `npm test` passes for both test files, and `test/bookings.test.js` passes unchanged.

### Deferred implementation notes

- A session can only be paid once per process, because `createBooking` and the KTD4 guard both refuse a session that is already paid. Each scenario that books or pays needs a session nobody has paid for yet. The tests either order their steps around `s1` or register extra sessions in the exported `sessions` map. The implementer picks one.

## Verification Contract

| Gate | Command | Proves |
|---|---|---|
| Unit tests | `npm test` | R1, R2, R3 and the KTD4 second-payer refusal through `test/confirmation-email.test.js`; existing booking behavior through `test/bookings.test.js` |

## Definition of Done

- U1's test scenarios exist in `test/confirmation-email.test.js` and pass.
- `test/bookings.test.js` passes without modification.
- `createBooking` sends no email.
- `confirmPayment` refuses a payment for a session someone else already paid for, and that payer receives no email.
- No dead-end or experimental code from abandoned approaches remains in the diff.
