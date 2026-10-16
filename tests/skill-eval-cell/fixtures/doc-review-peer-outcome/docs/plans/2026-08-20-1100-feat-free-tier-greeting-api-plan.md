---
title: Free Tier For The Greeting API - Plan
type: feat
date: 2026-08-20
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Free Tier For The Greeting API - Plan

## Goal Capsule

- **Objective:** Hobby developers can call the greeting API without a card on file, and paid conversion from that tier reaches 5% within one quarter.
- **Authority:** this plan.
- **Stop conditions:** stop if the free tier would require a new billing provider.

## Product Contract

### Summary

Add a free tier capped at 1,000 greetings per month. Ship the cap and the signup path first; ship usage emails and the upgrade prompt after.

### Problem Frame

Signups stall at the card form. We believe most of those visitors are hobby developers who would convert later if they could try the API first. A free tier is the cheapest way to find out.

### Requirements

- R1. A new account can call `/greet` without payment details until it has made 1,000 calls in the calendar month.
- R2. The 1,001st call in a month returns `402` with an upgrade link.
- R3. Free-tier usage is visible on the account page.
- R4. Conversion from free to paid is tracked per cohort month.

### Key Decisions

- **Cap before emails.** The cap and signup path ship first; usage emails and the in-app upgrade prompt are deferred to a second release, because the cap is what proves the hypothesis. Governs R1, R2.
- **Card-free signup is the default path**, not an experiment flag. Governs R1.

### Success Criteria

- Card-form abandonment drops by half within two weeks of launch.
- Free-to-paid conversion reaches 5% per cohort within one quarter.

### Scope Boundaries

- Out: team accounts on the free tier; changing the paid plans; a new billing provider.

## Planning Contract

### Key Technical Decisions

- KTD1. Count calls in the existing `usage` table keyed by account and month; no new store. Governs R1, R2.
- KTD2. Return `402` from the existing rate-limit middleware rather than a new layer. Governs R2.

## Implementation Units

### U1. Monthly call counter and cap

- **Goal:** Free accounts are capped at 1,000 calls per month.
- **Requirements:** R1, R2
- **Files:** `src/middleware/rate-limit.js`, `src/usage.js`, `test/rate-limit.test.js`
- **Approach:** read the month's count from `usage`; return `402` with the upgrade link past the cap.
- **Test scenarios:**
  - Call 1,000 succeeds; call 1,001 returns `402` with the upgrade link.
  - The counter resets on the first call of a new month.
- **Verification:** `npm test` passes.

### U2. Card-free signup

- **Goal:** A new account can be created without payment details.
- **Requirements:** R1
- **Files:** `src/signup.js`, `test/signup.test.js`
- **Approach:** make the payment step optional and default new accounts to the free tier.
- **Test scenarios:**
  - Signup without a card creates a free-tier account.
  - Signup with a card still creates a paid account.
- **Verification:** `npm test` passes.

### U3. Usage on the account page and cohort tracking

- **Goal:** Free usage is visible and conversion is measurable.
- **Requirements:** R3, R4
- **Files:** `src/account-page.js`, `src/analytics.js`, `test/account-page.test.js`
- **Approach:** render the month's count and cap; emit a conversion event tagged with the signup month.
- **Test scenarios:**
  - The account page shows `412 / 1,000 greetings this month`.
  - Upgrading emits a conversion event carrying the signup cohort month.
- **Verification:** `npm test` passes.

## Verification Contract

| Gate | Command |
|---|---|
| Unit | `npm test` |

## Definition of Done

- R1-R4 hold; `npm test` passes; the cap ships before the emails and upgrade prompt.
