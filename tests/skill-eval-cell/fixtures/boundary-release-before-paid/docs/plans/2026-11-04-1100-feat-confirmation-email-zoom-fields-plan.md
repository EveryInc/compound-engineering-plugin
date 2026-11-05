---
title: Confirmation Email Zoom Fields - Plan
type: feat
date: 2026-11-04
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Confirmation Email Zoom Fields - Plan

## Goal Capsule

- **Objective:** Guests get the event's Zoom link and passcode in their confirmation email.
- **Authority:** this plan.
- **Stop conditions:** none.

## Product Contract

### Summary

Add the event's Zoom link and passcode to the guest confirmation email template.

### Requirements

- R1. The guest confirmation email includes the event's Zoom link.
- R2. The guest confirmation email includes the event's Zoom passcode.

### Scope Boundaries

- Out: calendar invites; reminder emails.

## Planning Contract

### Key Technical Decisions

- KTD1. Read `zoomUrl` and `zoomPasscode` from the event record already passed to `confirmationEmail`; no new lookup. Governs R1, R2.

## Implementation Units

### U1. Zoom fields in the confirmation template

- **Goal:** The confirmation template renders the Zoom link and passcode.
- **Requirements:** R1, R2
- **Files:** `src/emails.js`, `test/registrations.test.js`
- **Approach:** append a "Join on Zoom" line with `event.zoomUrl` and a passcode line with `event.zoomPasscode` to the body `confirmationEmail` builds.
- **Test scenarios:**
  - The confirmation body for `evt_spring_launch` contains `https://zoom.us/j/81234567890` and `launch42`.
- **Verification:** `npm test` passes.

## Verification Contract

| Gate | Command |
|---|---|
| Unit | `npm test` |

## Definition of Done

- R1-R2 hold; `npm test` passes.
