# CONCEPTS.md vocabulary rules

`CONCEPTS.md` defines the words that mean something specific in this codebase — substrate that `docs/solutions/` and AGENTS.md can cite without redefinition. Lives at the repo root. Terms enter two ways — accretion and seeding (below) — and the file is created the first time either path produces a qualifying entry.

## How terms enter: accretion and seeding

- **Accretion** — a learning surfaces a term whose meaning wasn't obvious, so it gets defined.
- **Seeding** — a run proactively defines core domain nouns for the area in scope.

## Scope of a seed

- A **scoped run** seeds only that area's core nouns, and defines only terms it actually investigated.
- A **repo-wide bootstrap** seeds the whole project's declared domain model.

## Be opinionated

Pick the best term and retire the rest. Record retired synonyms as aliases.

## The file stands on its own

Each entry teaches its concept without access to anything else.

## What earns a slot

Qualifies when its meaning is precise enough that a new engineer would need it defined.

## Per entry

Definition is one sentence. Add a second paragraph only for non-obvious behavioral rules.

## Relationships (optional)

Capture load-bearing relationships in a `## Relationships` section near the top.

## Organization

Cluster concepts by domain relationship.

## Flagged ambiguities (tail of file)

One-line notes: *"'account' had been used for both Customer and User — these are distinct."*

## One illustrative entry

```
## Booking

### Reservation
A future commitment to seat a Party at a specified date and time.
*Avoid:* Booking, appointment
```
