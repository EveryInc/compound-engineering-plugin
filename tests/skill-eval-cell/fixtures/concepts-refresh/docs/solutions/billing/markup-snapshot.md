---
module: billing
tags: [billing, markup]
problem_type: logic-errors
---

# Markup must be snapshotted at invoice time

## Problem

Changing an org's markup rewrote historical invoices. The fix snapshots the markup
onto the invoice when it is created, so later percentage changes cannot alter past bills.
