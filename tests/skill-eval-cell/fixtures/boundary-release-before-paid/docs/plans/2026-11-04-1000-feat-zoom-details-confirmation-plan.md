---
title: Zoom Details In Guest Confirmation Emails - Plan
type: feat
date: 2026-11-04
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Zoom Details In Guest Confirmation Emails - Plan

## Goal Capsule

- **Objective:** Guests get the event's Zoom link and passcode in their confirmation email.
- **Authority:** this plan.
- **Stop conditions:** none.

## Product Contract

### Summary

Add the event's Zoom link and passcode to the guest confirmation email. The confirmation email is sent by `registerGuest` in `src/registrations.js` at the moment a guest registers, while the registration is still `pending_payment`; payment completes later through `handlePaymentWebhook` in `src/payments.js`.

### Requirements

- R1. The guest confirmation email includes the event's Zoom link.
- R2. The guest confirmation email includes the event's Zoom passcode.

### Scope Boundaries

- Out: changing the payment flow; the receipt email; calendar invites.

## Planning Contract

### Key Technical Decisions

- KTD1. Read `zoomUrl` and `zoomPasscode` from the event record already passed to `confirmationEmail`; no new lookup. Governs R1, R2.

## Implementation Units

### U1. Zoom details in the confirmation email

- **Goal:** The confirmation email carries the Zoom link and passcode.
- **Requirements:** R1, R2
- **Files:** `src/emails.js`, `test/registrations.test.js`
- **Approach:** append a "Join on Zoom" line with `event.zoomUrl` and a passcode line with `event.zoomPasscode` to the body `confirmationEmail` builds.
- **Test scenarios:**
  - Registering for `evt_spring_launch` sends a confirmation whose body contains `https://zoom.us/j/81234567890` and `launch42`.
- **Verification:** `npm test` passes.

## Verification Contract

| Gate | Command |
|---|---|
| Unit | `npm test` |

## Definition of Done

- R1-R2 hold; `npm test` passes.
