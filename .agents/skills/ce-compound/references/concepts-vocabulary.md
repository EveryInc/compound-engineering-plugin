# CONCEPTS.md vocabulary rules

`CONCEPTS.md` defines the words that mean something specific in this codebase — substrate that `docs/solutions/` and AGENTS.md can cite without redefinition. Lives at the repo root. Terms enter two ways — accretion and seeding (below) — and the file is created the first time either path produces a qualifying entry.

## How terms enter: accretion and seeding

Two paths populate the file, and they cover different gaps:

- **Accretion** — a learning surfaces a term whose meaning wasn't obvious, so it gets defined. This reliably catches *peripheral* terms, because friction is what surfaces them.
- **Seeding** — a run proactively defines the **core domain nouns** of the area it is working in. This catches the *stable-central* terms accretion never reaches: the nouns a system is built around rarely break, so they rarely appear in a learning, yet they are exactly what a reader needs to orient. Without seeding, the file fills with peripheral mechanics and never names what the project is about.

### Seed goal

Define the core domain nouns the area's **declared domain model** exposes that meet the qualifying bar (see "What earns a slot"). The codebase sets the count: seed every term that genuinely qualifies, none added to reach a number and none pulled from beyond the declared model to inflate one. A small domain yields a few; a large one, more. The bound is the **source** (the declared domain model of the area in scope — schema, core types, primary models, top-level domain docs — not a full-codebase trawl) and the **bar** (the same "a new engineer would need this defined" test), never a fixed quantity.

### Scope of a seed

- A **scoped run** — a learning capture, or a refresh narrowed to an area — seeds only that area's core nouns, and defines only terms it actually investigated against code. It does not reach for repo-wide nouns it never touched.
- A **repo-wide bootstrap** — an explicit "create CONCEPTS.md" request — seeds the whole project's declared domain model. This is the only path that produces a coherent "what is this project" glossary; a scoped run cannot, and should not pretend to.

## Be opinionated

When the team uses several words for the same concept, pick the best one and retire the rest. Record retired synonyms as aliases on the entry (see "Per entry"). Settled distinctions go to the Flagged ambiguities tail. The glossary is not a record of all words the team has ever used — it is the team's agreed-upon vocabulary.

## The file stands on its own

Each entry teaches its concept to a reader with no access to anything else — no codebase, no PR history, no architecture meetings, no Slack. This rules out:

- Implementation specifics (file paths, class names, function signatures, table names, library calls)
- Status fields, dates, owners on the entries
- Examples or current-config values drawn from the code — specific thresholds, counts, or enum values that will change. State the behavior, not the number: "each skill sets its own actionable threshold" rather than "surfaces at 50, fixes at 75."
- Links to PRs, issues, channels, or roadmap milestones
- Version-specific claims ("currently uses X; migrating to Y")

Cross-references between entries within `CONCEPTS.md` are fine — they resolve internally. General programming vocabulary (caches, queues, jobs, sessions) and everyday domain English need no redefinition either. But if an entry leans on another *project-specific* term to make sense, that term must be defined here too — an undefined project-specific sibling is itself a candidate to add.

## What earns a slot

A term qualifies when its meaning here is precise enough that a new engineer would need it defined to follow conversations, tickets, or code. General programming vocabulary does not belong, even when used heavily.

## Per entry

Definition is one sentence — what the term means in this domain, what makes it distinct from neighbors. A term with non-obvious behavioral rules (lifecycle, cancellation semantics, ownership invariants) earns a second paragraph for those rules — never for elaborating the definition itself.

When retired synonyms exist, list them as an aliases line directly under the definition: *Avoid: Booking, appointment*. Entities typically need more depth than value types; status concepts may need transition notes.

## Relationships (optional)

When relationships between entries carry load-bearing meaning (ownership, cardinality, lifecycle dependencies that span entries), capture them in a `## Relationships` section near the top of the file or its cluster. Skip when entries stand on their own without structural context — relationships are a lift for domains where structure is part of what makes terms meaningful, not a routine section.

## Organization

Cluster concepts by domain relationship — entities with their states, processes with their stages — so a reader sees structure without effort. A flat list works when the file is small. Reshape as the file grows.

## Flagged ambiguities (tail of file)

When two terms were used interchangeably and the team settled on a distinction, record the resolution as a one-line note: *"'account' had been used for both Customer and User — these are distinct."* This section is the audit trail for opinions the team has formed.

## One illustrative entry — the shape, not a template

```
## Booking

### Reservation
A future commitment to seat a Party at a specified date and time.
*Avoid:* Booking, appointment

A Reservation owns its Party but does not own a Table — Tables are acquired only when the Party arrives, through a Seating. Lifecycle: Booked, Seated, Completed, No-Show. Cancellation before a Seating is non-destructive; cancellation after a Seating is recorded as a No-Show.

### Party
The guests committed to a Reservation. Each Reservation has exactly one Party. Party size is the count promised at booking, not the count who arrive.

### Table
A physical seating unit with fixed capacity. Tables are shared resources — they do not belong to Reservations and are allocated only on the day-of through Seatings.

### Seating
The act of placing a Party at a Table once the Party arrives. A Reservation has at most one Seating; a Table accumulates many Seatings across its lifetime.
```
