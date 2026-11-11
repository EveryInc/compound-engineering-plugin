---
title: Event Start Time In Receipt Emails - Plan
type: feat
date: 2026-11-04
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Event Start Time In Receipt Emails - Plan

## Goal Capsule

- **Objective:** The receipt email reminds guests when the event starts.
- **Authority:** this plan.
- **Stop conditions:** none.

## Product Contract

### Summary

Add the event's start time to the receipt email, formatted the same way the confirmation email already formats it.

### Requirements

- R1. The receipt email states the event's start time.

### Scope Boundaries

- Out: time-zone personalization; calendar invites.

## Planning Contract

### Key Technical Decisions

- KTD1. Reuse `formatStart` in `src/emails.js`; no new formatter. Governs R1.

## Implementation Units

### U1. Start time in the receipt

- **Goal:** The receipt body names the event's start time.
- **Requirements:** R1
- **Files:** `src/emails.js`, `test/payments.test.js`
- **Approach:** append "The event starts <formatted time>." to the body `receiptEmail` builds.
- **Test scenarios:**
  - After a succeeded payment for `evt_spring_launch`, the receipt body contains `Thu, 03 Dec 2026 17:00:00 GMT`.
- **Verification:** `npm test` passes.

## Verification Contract

| Gate | Command |
|---|---|
| Unit | `npm test` |

## Definition of Done

- R1 holds; `npm test` passes.
