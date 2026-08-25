# CONCEPTS.md vocabulary rules

`CONCEPTS.md` defines the words that mean something specific in this codebase — substrate that `<root>/solutions/` and AGENTS.md can cite without redefinition. Lives at the repo root. Terms enter two ways — accretion and seeding (below) — and the file is created the first time either path produces a qualifying entry.

## The supported mutations

A run may **add** an entry, **refine** one, **fold** one into the entry that already carries its meaning, **retire** one to `## Retired`, **delete** one, or **scrub** violations from one it touched. Which subset a given run may perform is stated where that run is defined, and is not re-listed anywhere else.

**Update-only** names what a run withholds, never what it grants: no creation and no seeding. It does not widen the subset that run's own definition permits.

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

When the team uses several words for the same concept, pick the best one and drop the rest. Dropping a synonym is not a retirement: the surviving entry still carries that meaning, so the word becomes an aliases line on it (see "Per entry") and never goes to `## Retired`, which is only for a concept the project no longer has. Settled distinctions go to the Flagged ambiguities tail. The glossary is not a record of all words the team has ever used — it is the team's agreed-upon vocabulary.

## The file stands on its own

Each entry teaches its concept to a reader with no access to anything else — no codebase, no PR history, no architecture meetings, no Slack. This rules out:

- Implementation specifics (file paths, class names, function signatures, table names, library calls)
- Status fields, dates, owners on the entries
- Examples or current-config values drawn from the code — specific thresholds, counts, or enum values that will change. State the behavior, not the number: "each skill sets its own actionable threshold" rather than "surfaces at 50, fixes at 75."
- Links to PRs, issues, channels, or roadmap milestones
- Version-specific claims ("currently uses X; migrating to Y")

Cross-references between entries within `CONCEPTS.md` are fine — they resolve internally. General programming vocabulary (caches, queues, jobs, sessions) and everyday domain English need no redefinition either. But if an entry leans on another *project-specific* term to make sense, that term must be defined here too — an undefined project-specific sibling is itself a candidate to add.

## What earns a slot — and what keeps one

A term qualifies on two counts: its meaning here is precise enough that a new engineer would need it defined to follow conversations, tickets, or code, and it is a concept in its own right rather than a property of one already defined. General programming vocabulary does not belong, even when used heavily.

Both counts apply at both moments — admitting a term the work surfaced, and deciding whether an existing entry keeps its heading.

An entry that loses its heading still has to resolve for whoever meets the term next in an old ticket, learning, or commit. Ask which surviving entry can carry it; usually one can — the neighbor whose property it always was, or the concept that replaced it. **Fold** it there: the meaning moves into that entry, cross-references repoint, and the old term is named on that entry, worded so a reader can tell whether it meant this entry or was replaced by it. When nothing can carry it, the term **retires** to `## Retired` at the tail if readers will still meet it in the project's own material, and is deleted if they will not — version history is the archive.

Removing an entry acts only on positive contrary evidence, and uncertainty leaves it standing. Name where the concept went — what replaced it, what absorbed it, what took it out. Being unable to find it is not the same as it being gone: a deleted class, path, or symbol is never that evidence (an entry is meant to outlive the code that implemented it, which is what standing on its own means), and neither is the absence of corroboration.

## The coherence neighborhood

The neighborhood of an entry is its cluster siblings plus the terms it cross-references or that reference it. It bounds a capture-time pass: act only on evidence already in hand, never audit the whole file, and flag for `ce-compound-refresh` anything whose judgment would need investigation this run did not do.

## Per entry

Definition is one sentence — what the term means in this domain, what makes it distinct from neighbors. A term with non-obvious behavioral rules (lifecycle, cancellation semantics, ownership invariants) earns a second paragraph for those rules — never for elaborating the definition itself.

When dropped synonyms exist, list them as an aliases line directly under the definition: *Avoid: Booking, appointment*. Entities typically need more depth than value types; status concepts may need transition notes.

## Relationships (optional)

When relationships between entries carry load-bearing meaning (ownership, cardinality, lifecycle dependencies that span entries), capture them in a `## Relationships` section near the top of the file or its cluster. Skip when entries stand on their own without structural context — relationships are a lift for domains where structure is part of what makes terms meaningful, not a routine section.

## Organization

Cluster concepts by domain relationship — entities with their states, processes with their stages — so a reader sees structure without effort. A flat list works when the file is small. Reshape as the file grows.

## Flagged ambiguities (tail of file)

When two terms were used interchangeably and the team settled on a distinction, record the resolution as a one-line note: *"'account' had been used for both Customer and User — these are distinct."* This section is the audit trail for opinions the team has formed.

## Retired (tail of file, present only when it has entries)

One line per concept the project no longer has and nothing replaced: what the term meant, and what removed it. Enough that someone meeting it in an old ticket understands what they were reading and why it is not current — not the original entry carried over.

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

## Vocabulary capture during a refresh (relocated from the body)

After the per-doc actions execute, reconcile the domain terms flagged during investigation with `CONCEPTS.md`.

**First, read `references/concepts-vocabulary.md` — unconditionally.** Its qualifying criteria are non-obvious; a "nothing qualifies" judgment without reading it is a shortcut, not a result.

1. **Aggregate** qualifying terms across the learnings in scope; when one term surfaced with different shades of precision, union the shades into one entry.
2. **If `CONCEPTS.md` exists:** add missing terms, refine entries where the corpus surfaced new precision, then reconcile every entry this run's scope reaches against **What earns a slot — and what keeps one** above: backfill central-but-missing core nouns, then route each entry that fails the bar to the outcome that condition names — fold into the surviving entry that can carry it, retire to `## Retired` when readers will still meet the term, delete when they will not. An unscoped refresh reads the whole store, so its reconcile covers the whole file — that is the pass an accreted glossary needs; a scoped one stays in its area and leaves the rest untouched. Retention reads the same **declared domain model** the Seed goal seeds from, so presence and absence are judged against one source.
3. **If it doesn't exist** and at least one term qualified: bootstrap it — seed the in-scope area's core domain nouns per the Seed goal alongside the surfaced terms, holding the bar conservatively for borderline terms at creation. Start the file with this preamble under a `# Concepts` heading:

   > Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

   1-4 terms → flat headings; more → cluster by domain relationship per the reference.
4. **Scrub violations** per the reference's criteria (implementation specifics, config values that drift, status/owner/date metadata, duplicates, undefined project-specific siblings) in the same entries step 2 reconciled — the whole file on an unscoped run, because refresh is an audit; the area's entries on a scoped one.
5. Do not expand beyond what this run's scope reaches, and do not retroactively inject `(see CONCEPTS.md)` pointers into learnings.

Report what this run did to `CONCEPTS.md`. "scanned, no qualifying terms" is correct only when the file is byte-for-byte as the run found it; any change at all reports its counts, whichever step made it. The visible record is the audit signal that the reference was consulted, and it is what keeps a silent glossary mutation from going unreported. Apply vocabulary edits silently in every mode — no user prompt.
