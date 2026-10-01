---
title: Nightly charging of overdue invoices
date: 2026-09-20
topic: nightly-invoice-charging
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Nightly charging of overdue invoices

## Goal Capsule

- **Objective:** Overdue open invoices get collected every night without anyone charging them by hand, and no customer is ever charged twice for one invoice.
- **Product authority:** Billing lead.
- **Open blockers:** None.

## Product Contract

### Summary

An unattended nightly job charges each overdue open invoice to the customer's saved card and marks it paid only when the charge succeeds. The billing team gets a morning list of failed charges with reasons.

### Problem Frame

Every morning someone on the billing team spends about an hour charging overdue invoices by hand in the payment provider's dashboard. The work is mechanical, and when it is skipped, collection slips.

### Requirements

- R1. Each night, charge every overdue open invoice to its customer's saved card.
- R2. Mark an invoice paid only when its charge succeeds.
- R3. A customer is never charged twice for the same invoice, including when a run is retried or overlaps another run.
- R4. Each morning the billing team can see which charges failed and why.

### Scope Boundaries

- Automatic retry schedules, customer emails, an admin UI, and audit logs are out of scope for this release.

### Key Decisions

- Failed charges stay open for the team to follow up by hand, rather than being retried automatically.
