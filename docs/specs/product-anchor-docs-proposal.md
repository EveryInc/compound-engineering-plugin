# Proposal: one shared `VISION.md` for `vision`, `ce-strategy`, and `impeccable`

*Converge on a single repo-root document that all three skills read and write: a small set of universal sections every project has, conditional sections that appear only when they apply, and simple conduct rules so writers never collide.*

Status: draft for discussion, revision 2 · From: the compound-engineering maintainers · To: the maintainers of `vision` and `impeccable`

Revision 2 changes from the first draft: the filename is `VISION.md` (with `STRATEGY.md` considered and passed over); the doc is written for any project (framework, library, system, product), not only products; sections are split into universal and conditional; and linking between separate files is kept as the fallback.

## Why

Three coding-agent skills each write a repo-root markdown doc describing what a project is, so that other agents can ground their work in it:

| Skill | File today | What it captures | How it's produced |
|---|---|---|---|
| `vision` | `VISION.md` | North star: why it exists, who it serves, principles, non-goals, "aligns when / resist when" | Mined from merged-PR history, stress-tested with hypotheticals, author-approved; delta mode on rerun |
| `compound-engineering` / `ce-strategy` | `STRATEGY.md` | Direction: purpose, positioning, users, key metrics, tracks, boundaries | Repo-grounded interview with pushback; quarterly cadence |
| `impeccable` | `PRODUCT.md` | Truth for design work: users, purpose, positioning, platform, capabilities, brand commitments, evidence on hand | Repo scan + interview; never silently overwrites |

They overlap heavily on why the project exists, who it serves, what it commits to, and what it refuses. Today each skill only knows its own file, so a repo that already has one gets nothing when another skill runs.

The strong version of interop is one file every agent opens — north star, direction, and design truth together — where every skill run makes the same document better. Agents reason well over a document whose sections vary; what they need from us is agreement on the sections that overlap, and rules that keep three writers from stepping on each other. Linking three files together (`@VISION.md` from the others) avoids redundancy but leaves every reader assembling the picture from three places, and `@`-includes are not resolved by every agent harness; it is the fallback, not the goal.

## The document

**Filename: `VISION.md`** at the repo root. The deciding reason is adoption: large repos such as openclaw already ship a `VISION.md`, so agents and humans have learned to look for that name, and a convention is worth exactly as much as the number of people who already follow it. It is also semantically universal — a north star for a framework, a library, or a system as much as for a product, distinct from status quo and from how the team operates — and it is the `vision` author's filename, so the skill being asked to accept the most (other skills contributing to its doc) keeps its name.

Two alternatives were considered and passed over. `PRODUCT.md` is awkward for React, and equally awkward for a design system, a docs site, or an internal tool — the non-product repos impeccable also works in. `STRATEGY.md` is arguably the better superset (a strategy — Rumelt's diagnosis, guiding policy, coherent action — contains the vision and extends naturally to tracks and metrics, so nothing in the doc would be a guest), but it has no comparable precedent as a repo-root file, and precedent is what makes a shared name useful.

The north-star sections come first, so a human can stop after the first screen and still have read the vision; direction and design sections follow, clearly headed and present only when they apply — that ordering is what keeps a `VISION.md` that also carries metrics and platform honest to its name.

**Frontmatter** (small, machine-readable):

```yaml
---
name: React              # project name; same string in the H1
last_updated: 2026-08-17 # ISO date of the last write by any skill
---
```

That is the whole shared frontmatter. A skill that needs a private version stamp (impeccable's `<!-- impeccable:product-schema N -->`, which lets a later version tell a deliberately short section set from one written before a section existed) keeps it as an HTML comment beside its own sections; nobody else needs to read or agree on it.

**Universal sections** — every project has these, so every writer fills them when empty and merges into them when present, and readers may rely on them. Heading strings are placeholders until we agree; the strongest existing framing is credited to whichever skill has it, and the merged section keeps it:

| Section (candidate heading) | Meaning | Merges | Strongest current framing |
|---|---|---|---|
| **Purpose** | Why it exists and the problem it solves; the identity paragraph | vision identity opener · ce Purpose · impeccable Product Purpose | vision's opener ("X exists so that … It owns exactly one thing: …") for identity; ce's diagnosis for the problem |
| **Users** | Who it serves and the job they hire it for — developers for a library, operators for a system, customers for a product | vision "It serves …" · ce Users · impeccable Users | impeccable's situation + job; ce's one-primary-persona rule |
| **Positioning** | The bet or mechanism that makes it different from the alternatives | vision "owns exactly one thing" · ce Positioning · impeccable Positioning | impeccable's "the claim a neighbor could not truthfully copy"; ce's pushback that it must be a choice that rules things out |
| **Principles** | The durable commitments that decide changes | vision's 3–6 principle sections · impeccable Product Principles | vision's: declarative, testable, evidence-traced, author-approved |
| **Boundaries** | What it is not, what it declines, and how to judge a change | vision Scope non-goals + "aligns when / resisted when" · ce Boundaries · impeccable constraints/non-goals | vision's aligns/resist pair — the most agent-usable content in any of the three — with ce's "things the team is tempted by" as the list |

Notably, this is almost exactly the `vision` skill's document today. That is the argument for these five as the heart of the doc, whatever the file is called.

**Conditional sections** — present only when the skill that writes them has run *and* they apply to this project. Absent means "not applicable or not yet captured"; no reader may require them. Each keeps the exact heading its writer's parsers need, appended after the universal sections:

- Direction (`ce-strategy`, for anything maintained with a direction): `## Key metrics`, `## Tracks`, `## Milestones`
- Design truth (`impeccable`, only when an interface is in scope — a product, a design system, a docs site, a dashboard, an internal tool): `## Platform`, `## Operating Context`, `## Capabilities and Constraints`, `## Evidence on Hand`, `## Accessibility & Inclusion`
- Brand (`ce-strategy` Brand · `impeccable` Brand Commitments; either writer, when a name, voice, or binding assets exist): `## Brand`

No registry, no ownership map, no fixed order beyond "universal first, then conditional". A reader that meets a section it doesn't recognize reads it as prose. If a universal section turns out not to be universal, or a conditional one is genuinely shared, say so and it moves; the point is to align on what genuinely overlaps, not to force it.

## Conduct rules

Four rules, each a paragraph in a skill's prose. They are what make N writers coexist.

1. **Read the whole document before writing.** Sections you did not create are someone else's captured intent. Seed your interview from them; cite them when an answer contradicts them.
2. **Write your own sections; merge into the universal ones.** Add or update universal sections from what your run learned, in the author's own words. Where a section already says something your run contradicts, that is a question for the user, not a silent overwrite.
3. **Preserve foreign sections; keep them true.** Do not restructure, restyle, or delete a section you don't own. If your run made a foreign section factually false, make the minimal edit that keeps its intent true and tell the user what you changed. Formatting rules (vision's one-sentence-per-line, for example) apply to that skill's sections, not to the document.
4. **Honor inline protection.** A skill whose content is author-ratified may mark a section with an HTML comment (`<!-- vision: author-approved 2026-07-10 -->`). Every writer treats marked sections as flag-don't-edit: report the conflict to the user and let that skill's own process resolve it. Protection is declared by the skill that needs it, inline, on the sections that need it — never a document-wide map.

**Reader conduct** for consumers: read `VISION.md`; use whatever sections exist; require none of them; when sections disagree on a meaning, surface it rather than pick silently.

## How each skill's core rules survive

- **Vision's traceability** ("every line traces to evidence or the author's recorded answer"): lines other skills write into universal sections come from the author's own interview answers, which meets that bar; vision's delta mode treats them as new evidence, and any it disputes becomes a hypothetical for its board. Sections it has ratified — Principles especially — carry the inline marker, so no other skill edits them. Its "north star, not how-to-operate" semantics are kept by ordering: the direction and design sections sit after, headed as such, and are absent in repos where they don't apply.
- **Impeccable's "never silently overwrite"** and `## Platform` parsing: unchanged — its sections keep their exact headings and its parser keeps working; the discovery list gains `VISION.md`.
- **`ce-strategy`'s consumers** (`## Key metrics`, `## Users`, frontmatter `name`): unchanged headings; readers switch filename.

## Migration

- Readers accept the legacy filenames (`STRATEGY.md`, `PRODUCT.md`) during a transition; when one is found and no `VISION.md` exists, the writing skill offers to fold it into `VISION.md` in the layout above and confirms before writing. Where a `VISION.md` already exists, the other skills add their sections to it under the conduct rules.
- Writers create `VISION.md` if absent, otherwise update it in place.
- **Fallback if any of us cannot converge:** keep separate files, and link. `STRATEGY.md` and `PRODUCT.md` open with a plain markdown link to `VISION.md` and do not restate what it says; each skill reads the others' files by section meaning and seeds from them without writing them. That is a step toward the shared file, not a substitute for it.

## What each of us gives up, and gets

- **vision** keeps its filename, its anatomy, and its process; it accepts direction and design sections living below its north star when they apply, and other skills contributing to the universal sections under the conduct rules. It gains its vision being the file every other agent in the repo actually reads, and stated intent (strategy, design truth) as first-class evidence.
- **impeccable** adds `VISION.md` to discovery and moves its universal sections (Users, Purpose, Positioning, Principles) into the shared ones; its design-truth sections are unchanged and appear only where an interface is in scope. It gains vision and strategy context for design without asking the user twice.
- **compound-engineering** renames `STRATEGY.md`, folds Purpose / Positioning / Users / Boundaries into the shared sections, and gives up "one short doc that reads in five minutes"; it gains a strategy that sits under the principles its planning skills need anyway. We are already reading `VISION.md` and `PRODUCT.md` as stated intent and have moved our headings toward the shared candidates.

## Open questions for you

1. `VISION.md` as the shared filename — agreed? Any objection to direction and design sections living below the north star when they apply?
2. Are the five universal sections right, and the heading strings? Argue for your own framing where it is stronger — the table already credits several of yours.
3. Is inline protection (a per-section HTML comment your skill writes) enough to keep author-ratified content safe from foreign edits?
4. For impeccable: are there interface-bearing repos where even Users or Positioning don't apply, or where a design section should be considered universal?
5. Where should this convention live once agreed — a small shared spec page each project links to, or a copy in each project's docs?

If this lands, an agent in any harness opens one file and has the whole project in front of it — north star first, direction and design truth after — and every run of any of our skills leaves that file better than it found it.
