# Domain vocabulary resolution

`CONCEPTS.md` at the repo root is the single entry point for domain vocabulary. This reference decides **which file** a vocabulary read or write targets, **who owns** a term, and **when a write is blocked**. Entry format — what a definition looks like once the target is chosen — lives in `concepts-vocabulary.md`, not here.

The protocol is progressive. A project with one coherent model keeps a flat root glossary and nothing below changes its behavior. A project with several bounded contexts turns the root into an index over per-context glossaries. Nothing configures this: the root file's own structure decides.

## Resolution rule

Run these steps in order for every vocabulary-relevant read or write.

1. **Legacy check.** Search the whole repository for files named `CONTEXT-MAP.md` or `CONTEXT.md`, skipping ignored and vendored directories. This is an ordinary file-name search — no script needed. **Do not scope it to the repo root and the docs tree:** the convention these files come from puts a `CONTEXT.md` beside the code it describes, so `src/ordering/CONTEXT.md` is the common case, not the exception. A narrower search misses them, no block fires, and the next capture creates a second canonical glossary — the exact outcome this step exists to prevent. If a vocabulary-bearing legacy file exists anywhere, stop and apply "Blocked states" below.
2. **Read the root `CONCEPTS.md`.**
3. **No `## Contexts` section** → the root is the glossary. Read and write there. This is the flat form and it is the default.
4. **A `## Contexts` section that does not parse** as the index grammar below → treat the root as a flat glossary and tell the user the section collides with the index sentinel. Never reinterpret an unparseable section as an index.
5. **A `## Contexts` section that parses** → the root is an index, not a glossary. Identify the context or contexts the task touches from its focus, the files in scope, and the dialogue. Load only those glossaries plus the relations that involve them. A task crossing a boundary loads both sides and the relation between them.
6. **Ownership must be established before a write.** If it is not clear which context owns the term, ask. Never infer an owner from the fact that a term already appears in some file.
7. **Write to the owning context's glossary.** The root is not a catch-all: in the index form, the only root-owned entries are the `Shared vocabulary` section.

## Index grammar

A `## Contexts` section is an index only when it matches this shape. Anything else is a collision (step 4).

```markdown
## Contexts

- [Programming](docs/contexts/programming/CONCEPTS.md) — owns training-plan structure and exercise prescription.
- [Billing](docs/contexts/billing/CONCEPTS.md) — owns subscriptions, invoices, and payment state.

### Relations

- Programming -> Billing: completing a Block emits a billing event. A programming Block is not a billing BillingPeriod; the boundary translates one to the other.

### Shared vocabulary

- **Member** — a person with an active relationship to the gym. Model, invariants, and governance are shared by Programming and Billing.
```

- Each context entry is one list item: a Markdown link whose text is the context name and whose target is the repo-relative glossary path, then a separator (`--` or an em dash, surrounded by single spaces), then a one-sentence ownership statement.
- The slug is **derived** from the context name, not written twice, and must match `^[a-z0-9]+(-[a-z0-9]+)*$`. A name that cannot be slugified within that allowlist is reported rather than turned into a path, and two names that collapse to the same slug are a collision.
- Glossary paths are repo-relative and compose with the project's docs root: `<docs-root>/contexts/<slug>/CONCEPTS.md`, where `<docs-root>` is `docs` unless the project configures otherwise.
- `### Relations` and `### Shared vocabulary` are optional, appear at most once each, and may come in either order. Each relation names both contexts and states what crosses or translates between them.
- A context may appear once. A duplicate entry is a collision, not a merge.

## Ownership

The unit of canonicality is `(context, term)`, not `term`.

- A term belongs to exactly one context glossary, or to the shared vocabulary — never both.
- The same word may exist in two contexts with two different definitions. That is polysemy and it is correct: keep both entries, each qualified by its context. Do not collapse them into one definition, and do not retire one as an alias of the other. Aliases retire synonyms *within* a context.
- A term's owner is the context whose model defines its invariants — not the context that happens to mention it most, and not the context whose files the current task opened first.
- When the evidence supports two owners equally, ask rather than choosing. A wrong owner is harder to detect later than an unanswered question is now.

## Shared vocabulary

The root `Shared vocabulary` section is the one governed exception to "never write to the root".

A term enters it only when the contexts genuinely share its model, its invariants, **and** its governance — not merely its spelling. Promotion requires explicit user approval. Keep the section small: a large shared section means the boundaries are drawn wrong. When shared governance cannot be established, the term stays in its owning context.

## Missing glossaries

When the owning context is unambiguous but its glossary file does not exist yet:

- `ce-compound` and `ce-compound-refresh` create it at the composed path, seeded per `concepts-vocabulary.md`.
- `ce-brainstorm` asks instead of creating.
- `ce-plan` skips the write and records the term under the plan's open questions.

## Capture is settled and atomic

Write vocabulary only after the term is settled — after the Product Contract in brainstorming, after the plan is written in planning, in the capture phase for learnings. A term still under discussion does not touch the source of truth.

A single capture is one all-or-nothing change. When it spans two context glossaries and a root relation, validate every target first and write them together; if any target cannot be written, leave every original file unchanged. Never leave a boundary half-recorded.

## Blocked states

A legacy file is **vocabulary-bearing** when it actually defines at least one term. An empty scaffold, a headings-only file, or an unrelated project-notes file that happens to be named `CONTEXT.md` is not vocabulary-bearing and blocks nothing.

Two states block, and both point at the same route:

- **Dual-canonical** — a vocabulary-bearing legacy file coexists with a vocabulary-bearing root `CONCEPTS.md`. Vocabulary writes are blocked. Say: `Dual-canonical vocabulary: <legacy paths> define terms alongside CONCEPTS.md. Writes are blocked until the domain docs are migrated — run ce-compound-refresh migrate-domain-docs.`
- **Legacy-only** — a vocabulary-bearing legacy file exists and no root `CONCEPTS.md` does. Glossary creation and seeding are blocked too, so no second canonical file is manufactured. Say: `Legacy vocabulary only: <legacy paths> define terms and no CONCEPTS.md exists. Import them before capturing vocabulary — run ce-compound-refresh migrate-domain-docs.`

`CONTEXT-MAP.md` and `CONTEXT.md` are import formats, never a parallel authority. Do not read a legacy file as a glossary, do not write to one, and do not resolve the block by editing it. A hybrid state is a migration that has not happened yet, not a supported configuration.

## Sibling domain-truth files

A project may keep its current business truth — invariants, policies, state machines — in a `DOMAIN.md` beside a glossary: at the repo root beside a flat `CONCEPTS.md`, or at `<docs-root>/contexts/<slug>/DOMAIN.md` beside that context's glossary. Whether to read or maintain one is the project's own convention, carried by its instructions; this protocol neither requires nor creates it.

- A sibling `DOMAIN.md` is not a vocabulary authority and never raises a blocked state. It states rules using glossary terms, and its headings are rule anchors, not term definitions.
- It must not define terms. A `DOMAIN.md` that carries a definition in the glossary entry grammar is a second lexical authority — the graph script reports it as `domain-defines-terms` — and the fix is moving the definition to the owning glossary.
- It may open with a **verification stamp**: YAML frontmatter carrying `verified_against: <full commit sha>` and `last_verified: <YYYY-MM-DD>`. The stamp is written by a grounding pass that checked the file's rules against the code — never by hand, and never on an edit that no grounding pass verified. An unstamped file is legal; a malformed or unresolvable stamp is reported by the graph script (`domain-stamp-malformed`, `domain-stamp-unresolvable`). Staleness — how far behind a stamp may fall before re-verification — is the auditing skill's judgment, not a mechanical rule.
