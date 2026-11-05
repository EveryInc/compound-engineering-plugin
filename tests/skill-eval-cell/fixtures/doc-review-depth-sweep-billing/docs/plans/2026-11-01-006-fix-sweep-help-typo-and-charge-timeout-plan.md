---
title: "fix: Sweep — help-text typo and invoice charge timeout"
type: fix
date: 2026-11-01
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# fix: Sweep — help-text typo and invoice charge timeout

## Goal Capsule

- **Objective:** clear two small items from the backlog sweep.
- **Authority:** sweep list for the week of 2026-10-27, items 3 and 7.
- **Stop when:** both items are fixed and tests pass.

---

## Product Contract

### Summary

Item 3: the CLI help text says "comand". Item 7: when the payment gateway times out, `chargeInvoice` marks the invoice failed; retry the charge once on a timeout before marking it failed.

### Requirements

- R1. Help text reads "command".
- R2. A gateway timeout during `chargeInvoice` is retried once before the invoice is marked failed.

---

## Implementation Units

### U1. Fix the typo

**Files:** Modify `src/cli/help.ts`

**Approach:** Change "comand" to "command".

**Test scenarios:** help snapshot updated.

### U2. Retry a timed-out charge once

**Files:** Modify `src/billing/charge-invoice.ts`; Test `tests/billing/charge-invoice.test.ts`

**Approach:** Wrap `gateway.charge` in a loop that retries once when the error is a timeout.

**Test scenarios:**
- A timeout followed by success marks the invoice paid.
- Two timeouts mark it failed.

**Verification:** `bun test tests/billing` passes.
