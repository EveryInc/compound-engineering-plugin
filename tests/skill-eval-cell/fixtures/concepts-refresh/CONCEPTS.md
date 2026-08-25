# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Glossary only, not a spec or catch-all.

## Delivery

### Delivery Run

One execution of the outbound delivery pipeline for a single recipient list.

A run freezes its recipient set when queued, so editing a list never races a live run. Lifecycle: queued, sending, settled.

### Suppression

A standing rule that removes an address from every Delivery Run regardless of which list names it. Suppressions are permanent once recorded; there is no un-suppress.

## Billing

### Markup

The org-specific percentage added on top of a vendor's raw cost when billing. Snapshotted at invoice time so later changes do not rewrite past bills.

### Invoice Period

The calendar month a set of charges is grouped into for billing. Periods close on the first of the following month and never reopen.
