# Domaine — Billing

## Invariants

### Invoice immutability

- A finalized **Invoice** never changes its amount.

**Dunning** (relance):
The escalation cycle applied to an unpaid invoice after its due date.

- **Grace period** — the three business days between the due date and the first dunning step.
