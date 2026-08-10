# Concepts

Domain vocabulary index for a repository that holds several bounded contexts.

## Contexts

- [Scheduling](docs/contexts/scheduling/CONCEPTS.md) -- owns reservation lifecycle, seating, and table allocation.
- [Billing](docs/contexts/billing/CONCEPTS.md) — owns invoicing, payment capture, and refunds.

### Relations

- Scheduling -> Billing: Scheduling publishes a completed Seating and Billing translates it into a billable visit.

### Shared vocabulary

- **Venue** -- the physical restaurant every context partitions its data by.
