# Proposal: one product doc, shared by `ce-strategy`, `vision`, and `impeccable`

*Converge on a single repo-root product document that all three skills read and write — shared sections wherever our docs mean the same thing, room for each skill's own sections, and simple conduct rules so writers never collide.*

Status: draft for discussion · From: the compound-engineering maintainers · To: the maintainers of `vision` and `impeccable`

## Why

Three coding-agent skills each write a repo-root markdown doc describing the product, so that other agents can ground their work in it:

| Skill | File today | What it captures | How it's produced |
|---|---|---|---|
| `compound-engineering` / `ce-strategy` | `STRATEGY.md` | Direction: target problem, approach, primary persona, key metrics, tracks, not-working-on | Interview with pushback; quarterly cadence |
| `vision` | `VISION.md` | Identity and acceptance policy: why it exists, principles, non-goals, "aligns when / resist when" | Mined from merged-PR history, stress-tested with hypotheticals, author-approved; delta mode on rerun |
| `impeccable` | `PRODUCT.md` | Product truth for design work: users, purpose, positioning, platform, capabilities, brand commitments, evidence on hand | Repo scan + interview; never silently overwrites |

They overlap on three meanings — **purpose**, **who it's for**, **boundaries** — and are otherwise complementary. Today each skill only knows its own file. A repo that already has a good `STRATEGY.md` gets nothing when `impeccable init` runs; a repo with a `PRODUCT.md` gets nothing when `ce-plan` looks for strategy; vision's evidence mining never sees either.

The strong version of interop is not three files that peek at each other. It is **one file every agent opens** — purpose, users, boundaries, strategy, principles, and product truth together — where every skill run makes the same document better. Agents are good at reasoning over a document whose sections differ; what they need from us is agreement on the sections that overlap and rules that keep three writers from stepping on each other.

## The document

**Filename:** `PRODUCT.md` at the repo root. Impeccable already discovers this name; it is the most neutral of the three; and it is what a newcomer would look for.

**Frontmatter** (small, machine-readable):

```yaml
---
name: Ledgerly           # product name; same string in the H1
last_updated: 2026-08-17 # ISO date of the last write by any skill
---
```

That is the whole shared frontmatter. A skill that needs a private version stamp (impeccable's `<!-- impeccable:product-schema N -->`, which lets a later version tell a deliberately short section set from one written before a section existed) keeps it as an HTML comment beside its own sections; nobody else needs to read or agree on it.

**Shared sections.** If each of us is willing to change our own template, most of the three docs collapses into a common set. Laying every section from all three side by side, six meanings appear in two or three of them. Heading strings below are placeholders until we agree; the strongest existing framing is credited to whichever skill has it, and the merged section should keep it:

| Shared section (candidate heading) | Merges | Strongest current framing |
|---|---|---|
| **Purpose** — why it exists and the problem it solves | ce Target problem · vision identity opener · impeccable Product Purpose | vision's opener ("X exists so that … It owns exactly one thing: …") for the identity line; ce's diagnosis for the problem |
| **Users** — who it is for and the job they hire it for | ce Who it's for · vision "It serves …" · impeccable Users | impeccable's situation + job; ce's primary-persona rule (one primary, others secondary) |
| **Positioning** — the bet or mechanism that makes it different | ce Our approach · vision "owns exactly one thing" · impeccable Positioning | impeccable's "the claim a neighboring product could not truthfully copy"; ce's pushback that it must be a choice that rules things out |
| **Principles** — the durable commitments that decide changes | vision's 3–6 principle sections · impeccable Product Principles | vision's: declarative, testable, evidence-traced, author-approved; impeccable's derived 3–5 fold in or are superseded |
| **Boundaries** — what it is not, and how to judge a change | ce Not working on · vision Scope non-goals + "aligns when / resisted when" · the constraints/non-goals half of impeccable Capabilities and Constraints | vision's aligns/resist pair — the most agent-usable content in any of the three — with ce's "things the team is tempted by" as the non-goals list |
| **Brand** — name, voice, positioning language, binding assets | ce Marketing (one-liner, key message) · impeccable Brand Commitments | impeccable's (name, voice, assets, identity constraints); ce's one-liner and key message fold in |

Every writer fills a shared section when empty and merges into it when present. Exact strings matter: two of three ecosystems parse headings by name, and meaning-only agreement leaves scripts guessing.

**Skill-specific sections** — what is left after the merge is small, and stays under whatever exact headings that skill's parsers need, appended after the shared sections:

- `ce-strategy`: `## Key metrics`, `## Tracks`, `## Milestones` (optional)
- `impeccable`: `## Platform`, `## Operating Context`, the capabilities half of `## Capabilities and Constraints`, `## Evidence on Hand`, `## Accessibility & Inclusion`
- `vision`: nothing left over — its whole document *is* Purpose, Positioning, Principles, and Boundaries, which is a strong argument that those four are the heart of the shared doc

No registry, no ownership map, no fixed order beyond "shared sections first, then skill sections". A reader that meets a section it doesn't recognize reads it as prose. If a merge above is wrong — a meaning that only looks shared — say so and it moves to the skill-specific list; the point is to align on as much as genuinely overlaps, not to force it.

## Conduct rules

Four rules, each a paragraph in a skill's prose. They are what make N writers coexist.

1. **Read the whole document before writing.** Sections you did not create are someone else's captured intent. Seed your interview from them; cite them when an answer contradicts them.
2. **Write your own sections; merge into the shared ones.** Add or update shared sections from what your run learned, in the user's own words. Where a shared section already says something your run contradicts, that is a question for the user, not a silent overwrite.
3. **Preserve foreign sections; keep them true.** Do not restructure, restyle, or delete a section you don't own. If your run made a foreign section factually false, make the minimal edit that keeps its intent true and tell the user what you changed. Formatting rules (vision's one-sentence-per-line, for example) apply to that skill's sections, not to the document.
4. **Honor inline protection.** A skill whose content is author-ratified may mark a section with an HTML comment (`<!-- vision: author-approved 2026-07-10 -->`). Every writer treats marked sections as flag-don't-edit: report the conflict to the user and let that skill's own process resolve it. Protection is declared by the skill that needs it, inline, on the sections that need it — never a document-wide map.

**Reader conduct** for consumers: read `PRODUCT.md`; use whatever sections exist; require none of them; when sections disagree on a meaning, surface it rather than pick silently.

## How each skill's core rules survive

- **Vision's traceability** ("every line traces to evidence or the author's recorded answer"): lines other skills write into shared sections come from the author's own interview answers, which meets that bar; vision's delta mode treats them as new evidence, and any it disputes becomes a hypothetical for its board. Sections it has ratified — Principles especially — carry the inline marker, so no other skill edits them.
- **Impeccable's "never silently overwrite"** and `## Platform` parsing: unchanged — its sections keep their exact headings, its parser keeps working, and rule 3 forbids anyone else touching them silently.
- **`ce-strategy`'s consumers** (`## Key metrics`, the persona section, frontmatter `name`): readers switch filename and follow whatever heading we agree for Users.

## Migration

- Readers accept the legacy filenames (`STRATEGY.md`, `VISION.md`) during a transition; when one is found and no `PRODUCT.md` exists, the writing skill offers to migrate it into `PRODUCT.md` (moving its sections into the layout above) and confirms before writing.
- Writers create `PRODUCT.md` if absent, otherwise update it in place.
- If any of us cannot converge on the file yet, the fallback is the read-side version of this proposal: a discovery set (`STRATEGY.md | VISION.md | PRODUCT.md`) plus the alias table above, and "seed from a sibling, don't write it". That is a step toward the shared file, not a substitute for it.

## What each of us gives up, and gets

- **vision** gives up the standalone `VISION.md` brand and the tidy 40–70-line artifact; its content lives inside a longer doc. It gains an author-approved identity that every other agent in the repo actually reads, and stated intent (strategy, product truth) as first-class evidence.
- **impeccable** gives up almost nothing — same filename, same sections, same parser — and gains strategy and vision context for design without asking the user twice.
- **compound-engineering** renames `STRATEGY.md`, retires four of its eight section headings into shared ones, updates its readers, and gives up "one short doc that reads in five minutes"; it gains a strategy that sits next to the principles and product truth its planning skills need anyway.

## Open questions for you

1. Is `PRODUCT.md` acceptable as the shared filename? If not, what would you accept?
2. Which of the six shared sections are genuinely shared, which merges are wrong, and what exact heading strings? Argue for your own framing where it is stronger — the table already credits several of yours.
3. Is inline protection (a per-section HTML comment your skill writes) enough to keep author-ratified content safe from foreign edits, or do you need more?
4. Where should this convention live once agreed — a small shared spec repo, or a copy in each project's docs?

If this lands, an agent in any harness opens one file and has the whole product in front of it, and every run of any of our skills leaves that file better than it found it.
