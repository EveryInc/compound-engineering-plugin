# Proposal: one shared `STRATEGY.md` for `vision`, `ce-strategy`, and `impeccable`

*Converge on a single repo-root document that all three skills read and write: a small set of universal sections every project has, conditional sections that appear only when they apply, and simple conduct rules so writers never collide.*

Status: agreed in principle, revision 4 (2026-08-18) · From: the compound-engineering maintainers · To: the maintainers of `vision` and `impeccable`

Revision 4: the three maintainers agreed on `STRATEGY.md` as the shared filename; the rest of the design is unchanged. Revision 2 changes from the first draft: two filenames were laid out (`VISION.md`, `STRATEGY.md`); the doc is written for any project (framework, library, system, product), not only products; sections are split into universal and conditional; and linking between separate files is kept as the fallback. Revision 3 adds the rule that decides everything else: the document's *meaning* is the contract, its *shape* belongs to whoever created it — house format when a skill authors from scratch, adapt-in-place when a doc already exists, and readers require nothing but meaning.

## Why

Three coding-agent skills each write a repo-root markdown doc describing what a project is, so that other agents can ground their work in it:

| Skill | File today | What it captures | How it's produced |
|---|---|---|---|
| `vision` | `VISION.md` | North star: why it exists, who it serves, principles, non-goals, "aligns when / resist when" | Mined from merged-PR history, stress-tested with hypotheticals, author-approved; delta mode on rerun |
| `compound-engineering` / `ce-strategy` | `STRATEGY.md` | Direction: purpose, positioning, users, key metrics, tracks, boundaries | Repo-grounded interview with pushback; quarterly cadence |
| `impeccable` | `PRODUCT.md` | Truth for design work: users, purpose, positioning, platform, capabilities, brand commitments, evidence on hand | Repo scan + interview; never silently overwrites |

They overlap heavily on why the project exists, who it serves, what it commits to, and what it refuses. Today each skill only knows its own file, so a repo that already has one gets nothing when another skill runs.

The strong version of interop is one file every agent opens — north star, direction, and design truth together — where every skill run makes the same document better. Agents reason well over a document whose sections vary; what they need from us is agreement on the sections that overlap, and rules that keep three writers from stepping on each other. Linking three files together (`@STRATEGY.md` from the others) avoids redundancy but leaves every reader assembling the picture from three places, and `@`-includes are not resolved by every agent harness; it is the fallback, not the goal.

## The document

**Filename: `STRATEGY.md`** at the repo root — agreed by all three maintainers. A strategy, in Rumelt's sense (diagnosis, guiding policy, coherent action), contains the vision and extends naturally to tracks, metrics, and constraints, so nothing in the doc is a guest; it is equally universal for a framework, a library, or a system; and `ce-strategy` already writes it, so one of the three writers needs no migration.

Two alternatives were considered. `PRODUCT.md` is awkward for React, and equally awkward for a design system, a docs site, or an internal tool — the non-product repos impeccable also works in. `VISION.md` has the stronger precedent as a repo-root file (openclaw and others) and a clean north-star semantic, but a vision that also carries metrics and platform stretches the word; the group weighed precedent against fit and chose fit.

The north-star sections still come first, so a human can stop after the first screen and have read the vision; direction and design sections follow, clearly headed and present only when they apply.

**Frontmatter** (small, machine-readable):

```yaml
---
name: React              # project name; same string in the H1
last_updated: 2026-08-17 # ISO date of the last write by any skill
---
```

That is the whole shared frontmatter. A skill that needs a private version stamp (impeccable's `<!-- impeccable:product-schema N -->`, which lets a later version tell a deliberately short section set from one written before a section existed) keeps it as an HTML comment beside its own sections; nobody else needs to read or agree on it.

**Universal sections** — every project has these, so readers may rely on the *meaning* being present, and a writer creating the doc from scratch lays them out under these headings. Heading strings are placeholders until we agree; the strongest existing framing is credited to whichever skill has it, and the merged section keeps it:

| Section (candidate heading) | Meaning | Merges | Strongest current framing |
|---|---|---|---|
| **Purpose** | Why it exists and the problem it solves; the identity paragraph | vision identity opener · ce Purpose · impeccable Product Purpose | vision's opener ("X exists so that … It owns exactly one thing: …") for identity; ce's diagnosis for the problem |
| **Users** | Who it serves and the job they hire it for — developers for a library, operators for a system, customers for a product | vision "It serves …" · ce Users · impeccable Users | impeccable's situation + job; ce's one-primary-persona rule |
| **Positioning** | The bet or mechanism that makes it different from the alternatives | vision "owns exactly one thing" · ce Positioning · impeccable Positioning | impeccable's "the claim a neighbor could not truthfully copy"; ce's pushback that it must be a choice that rules things out |
| **Principles** | The durable commitments that decide changes | vision's 3–6 principle sections · impeccable Product Principles | vision's: declarative, testable, evidence-traced, author-approved |
| **Boundaries** | What it is not, what it declines, and how to judge a change | vision Scope non-goals + "aligns when / resisted when" · ce Boundaries · impeccable constraints/non-goals | vision's aligns/resist pair — the most agent-usable content in any of the three — with ce's "things the team is tempted by" as the list |

Notably, this is almost exactly the `vision` skill's document today, which is why these five are the heart of the doc regardless of filename.

**Conditional sections** — present only when the skill that writes them has run *and* they apply to this project. Absent means "not applicable or not yet captured"; no reader may require them. Each keeps the exact heading its writer's parsers need, appended after the universal sections:

- Direction (`ce-strategy`, for anything maintained with a direction): `## Key metrics`, `## Tracks`, `## Milestones`
- Design truth (`impeccable`, only when an interface is in scope — a product, a design system, a docs site, a dashboard, an internal tool): `## Platform`, `## Operating Context`, `## Capabilities and Constraints`, `## Evidence on Hand`, `## Accessibility & Inclusion`
- Brand (`ce-strategy` Brand · `impeccable` Brand Commitments; either writer, when a name, voice, or binding assets exist): `## Brand`

No registry, no ownership map, no fixed order beyond "universal first, then conditional". A reader that meets a section it doesn't recognize reads it as prose. If a universal section turns out not to be universal, or a conditional one is genuinely shared, say so and it moves; the point is to align on what genuinely overlaps, not to force it.

## Conduct rules

**The rule that decides the rest: meaning is the contract, shape belongs to the creator.** Two cases:

- **Authoring from scratch** (no `STRATEGY.md`, and no legacy sibling to fold in): write the house format above — frontmatter, universal sections under the agreed headings, your conditional sections after. Downstream readers get a predictable shape and nothing is inherited.
- **A `STRATEGY.md` already exists** — hand-written, or written by another skill, in whatever shape (openclaw's `VISION.md`, for example, has no frontmatter, an H2 title, and topical sections like `## Security` and `## Plugins & Memory` with priorities and contribution rules in prose; a hand-written `STRATEGY.md` can look the same): adapt to it. Read it by meaning; a universal meaning counts as present when the doc expresses it anywhere, under any heading or in prose, so never add a duplicate heading for it. Make only additive changes, in the doc's own idiom, and confirm before writing; do not add frontmatter, an H1, or heading renames uninvited; do not restructure. When the user isn't the doc's owner (a contributor in someone else's repo), default to leaving `STRATEGY.md` untouched and writing your sections to your own file with a link at the top. A one-time restructure into the house format is something the user opts into, never a side effect. The worst outcome this convention can produce is a skill "improving" a maintainer's existing vision doc into a template and breaking whatever already reads it.

Four rules follow, each a paragraph in a skill's prose. They are what make N writers coexist.

1. **Read the whole document before writing.** Sections you did not create are someone else's captured intent. Seed your interview from them; cite them when an answer contradicts them.
2. **Write your own sections; merge into the universal ones by meaning.** Add or update universal content from what your run learned, in the author's own words, in the doc's existing shape. Where the doc already says something your run contradicts, that is a question for the user, not a silent overwrite.
3. **Preserve foreign sections; keep them true.** Do not restructure, restyle, or delete a section you don't own. If your run made a foreign section factually false, make the minimal edit that keeps its intent true and tell the user what you changed. Formatting rules (vision's one-sentence-per-line, for example) apply to that skill's sections, not to the document.
4. **Honor inline protection.** A skill whose content is author-ratified may mark a section with an HTML comment (`<!-- vision: author-approved 2026-07-10 -->`). Every writer treats marked sections as flag-don't-edit: report the conflict to the user and let that skill's own process resolve it. Protection is declared by the skill that needs it, inline, on the sections that need it — never a document-wide map.

**Reader conduct** for consumers: read `STRATEGY.md`; extract meaning from whatever is there, under any headings; require no section and no frontmatter (use `name` and `last_updated` when present, else the title line and the file's own date); when parts of the doc disagree on a meaning, surface it rather than pick silently. This is what lets every skill work with an existing hand-written vision doc today, before anyone adopts the house format.

## How each skill's core rules survive

- **Vision's traceability** ("every line traces to evidence or the author's recorded answer"): lines other skills write into universal sections come from the author's own interview answers, which meets that bar; vision's delta mode treats them as new evidence, and any it disputes becomes a hypothetical for its board. Sections it has ratified — Principles especially — carry the inline marker, so no other skill edits them. One honest caveat, seen when vision was run against a repo carrying our strategy doc: an interview answer is *stated* intent, while vision mines *revealed* values from what actually shipped; when a repo's history is thin, the strategy lines dominate the evidence, so vision may want to mark which drafted lines rest on stated intent alone. Its "north star, not how-to-operate" semantics are kept by ordering: the direction and design sections sit after, headed as such, and are absent in repos where they don't apply.
- **Impeccable's "never silently overwrite"** and `## Platform` parsing: unchanged — its sections keep their exact headings and its parser keeps working; the discovery list gains `STRATEGY.md`.
- **`ce-strategy`'s consumers** (`## Key metrics`, `## Users`, frontmatter `name`): unchanged headings and unchanged filename.

## Migration

- Readers accept the legacy filenames (`VISION.md`, `PRODUCT.md`) during a transition; when one is found and no `STRATEGY.md` exists, the writing skill offers to fold it into `STRATEGY.md` in the layout above and confirms before writing. Where a `STRATEGY.md` already exists, the other skills add their sections to it under the conduct rules.
- Writers create `STRATEGY.md` if absent, otherwise update it in place.
- **Fallback if a skill cannot converge yet:** keep separate files, and link. `VISION.md` and `PRODUCT.md` open with a plain markdown link to `STRATEGY.md` and do not restate what it says; each skill reads the others' files by section meaning and seeds from them without writing them. That is a step toward the shared file, not a substitute for it.

## What each of us gives up, and gets

- **vision** renames its output to `STRATEGY.md` (reading `VISION.md` as legacy) and keeps its anatomy and process; it accepts direction and design sections living below its north star when they apply, and other skills contributing to the universal sections under the conduct rules. It gains its vision being the file every other agent in the repo actually reads, and stated intent (strategy, design truth) as first-class evidence.
- **impeccable** adds `STRATEGY.md` to discovery and moves its universal sections (Users, Purpose, Positioning, Principles) into the shared ones; its design-truth sections are unchanged and appear only where an interface is in scope. It gains vision and strategy context for design without asking the user twice.
- **compound-engineering** keeps its filename; its Purpose / Positioning / Users / Boundaries are the universal sections, and it gives up "one short doc that reads in five minutes" once other skills add theirs; it gains a strategy that sits next to the principles its planning skills need anyway. Its readers already read `VISION.md` and `PRODUCT.md` as legacy siblings.

## Adoption checklist, per skill

The filename settles discovery. The shared file only works if each skill's own instructions carry the conduct rules; a skill that keeps its from-scratch writer unchanged will overwrite or compete with the file another skill wrote. Each of us adopts these in our SKILL.md (or equivalent):

| Rule | `vision` | `impeccable` | `ce-strategy` |
|---|---|---|---|
| Discover `STRATEGY.md` first; read `VISION.md` / `PRODUCT.md` as legacy siblings; offer (never force) to fold a legacy file in | rename output; read `VISION.md` as legacy | add `STRATEGY.md` to `context.mjs` discovery ahead of `PRODUCT.md`; read `PRODUCT.md` as legacy | done — reads all three; writes `STRATEGY.md` |
| Read the whole doc before writing; seed from it; cite it in pushback | delta mode already treats an existing file as baseline — extend it to a `STRATEGY.md` written by others | init's explore step reads it | done |
| Create the house format only when the file is absent; otherwise adapt in place: no restructure, no uninvited frontmatter/headings, no duplicate heading for a meaning already present | from-scratch mode runs only when no `STRATEGY.md` exists; otherwise contribute sections | same for `init` | done (principle 6) |
| Preserve sections you did not write; keep them true with minimal, disclosed edits; never edit an author-approved-marked section or a doc the user does not own | mark your ratified sections inline; do not touch others' | do not restate strategy sections in Users/Purpose; add only your conditional sections | done |
| Fill universal sections by meaning (Purpose, Users, Positioning, Principles, Boundaries): merge into what is there, in the author's words; a contradiction is a question for the user | you are the strongest writer for Principles and Boundaries | Users, Purpose, Positioning | Purpose, Positioning, Users, Boundaries; does not write Principles |
| Formatting rules apply to your own sections only | one-sentence-per-line stays yours | — | — |
| Readers require no section and no frontmatter | — | `## Platform` parse unchanged | `ce-product-pulse` reads `## Key metrics` when ce-strategy wrote it, else the section listing the success measures, by meaning |

## Adopting the shared file in your skill — the short version

You know your skill; this is the minimum that keeps three writers from colliding, with wording you can adapt.

**1. One paragraph of conduct in your skill's always-loaded prose.** Ours (`ce-strategy` SKILL.md, principle 6) reads, in effect:

> Meaning is the contract; shape belongs to whoever created the doc. When this skill creates `STRATEGY.md`, it writes its house format. When the file already exists — hand-written, from an earlier version, or from another skill — adapt to it: read it by meaning (a section counts as present when the doc expresses it anywhere, under any heading or in prose), make only additive or minimal changes in its own idiom, and never restructure it, add frontmatter or headings uninvited, or duplicate a meaning under a new heading. Sections this skill did not write are someone else's captured intent: leave them in place; if this run learned something that makes one false, make the smallest edit that keeps its intent true and say so. A section marked as approved by its author (`<!-- vision: author-approved 2026-07-10 -->`), or a doc the user does not own, is not edited at all — report the conflict, or write to a separate file with a link. The worst outcome is turning someone's existing doc into this template and breaking what already reads it.

**2. Discovery order.** `STRATEGY.md` first; your legacy filename second, read-only, with an *offer* to fold it in (confirm before writing; a maintainer will often decline). Never create your legacy filename when `STRATEGY.md` exists.

**3. Your from-scratch path runs only when the file is absent.** If `STRATEGY.md` exists in any shape, you are contributing sections, not authoring a document. For `vision`: delta mode already treats an existing file as the baseline — extend that to a `STRATEGY.md` written by others, and put your identity opener into `## Purpose` (merging with what is there) rather than as a heading-less preamble. For `impeccable`: `init` reads the file, seeds Users/Purpose/Positioning from it, confirms with the user, and adds only your conditional sections (`## Platform`, `## Operating Context`, …); `context.mjs` gains `STRATEGY.md` in discovery ahead of `PRODUCT.md`.

**4. Universal sections are filled by meaning, in the author's words.** If `## Users` already says who it serves, merge or leave; do not add `## Who it serves`. A contradiction between what your run learned and what the section says is a question for the user, not an overwrite.

**5. Mark what you need protected.** If your content is author-ratified (vision's Principles), put `<!-- vision: author-approved YYYY-MM-DD -->` under that heading. Every writer treats a marked section as flag-don't-edit. Nothing else needs marking.

**6. Formatting rules apply to your sections only.** One-sentence-per-line stays yours; nobody restyles another's section.

**Worked example** — one `STRATEGY.md` after all three skills have run on it (order: universal first, then conditional; each skill's sections keep their own headings and style):

```markdown
---
name: Ledgerly
last_updated: 2026-08-18
---

# Ledgerly Strategy

## Purpose
`Ledgerly` exists so that a solo freelancer gets paid for every hour worked without treating billing as a second job.
Solo hourly freelancers lose revenue to unlogged hours and unchased invoices because billing is a separate chore from the work.

## Users
**Primary:** Solo hourly freelancers - hiring Ledgerly to get paid for every hour without doing admin.

## Positioning
The invoice is a byproduct of tracking time - billing happens without a separate step, which a fixed-schedule tool cannot claim.

## Principles
<!-- vision: author-approved 2026-08-18 -->
Billing is a byproduct, never a step.
Chasing is the software's job.
One person, one ledger.

## Boundaries
- Agencies and retainer billing; expenses, taxes, payroll.

A change aligns when it removes a step between doing the work and getting paid.
A change should be resisted when it requires a second person in the account.

## Key metrics
- **Invoice-from-timer rate** - share of invoices created from tracked time; analytics
- **Days-to-paid** - median days from sent to paid; DB

## Tracks
### Frictionless capture
...

## Platform
web

## Brand Commitments
Name: Ledgerly. Voice: calm, plain, never salesy.

## Evidence on Hand
None beyond the repository; do not fabricate testimonials.
```

`ce-strategy` wrote Purpose (second line), Users, Positioning, Boundaries (list), Key metrics, Tracks; `vision` wrote the Purpose identity line, Principles (marked), and the aligns/resist pair under Boundaries; `impeccable` wrote Platform, Brand Commitments, Evidence on Hand. Any of the three re-running reads all of it, touches only its own, and asks the user when something it learned contradicts a section it does not own.

**How we tested ours** (worth reusing; fixtures are cheap): an empty repo (house format written); a repo with a hand-written `STRATEGY.md` in a totally different shape (one-line in-idiom edit, no restructure, no frontmatter added); an older house-format file with a user-added section and an author-approved section (foreign sections untouched, missing required section *offered*, not added); a repo carrying openclaw's real `VISION.md` verbatim (read by meaning, never edited); and each of your skills run against a repo carrying our file (vision used it as evidence and would not touch it; impeccable seeded from it and wrote no contradiction). Run each on two model families; where the diffs match across hosts, the rule is stated well enough.

## Open questions for you

1. Filename: agreed (`STRATEGY.md`). Any objection to direction and design sections living below the north star when they apply?
2. Are the five universal sections right, and the heading strings? Argue for your own framing where it is stronger — the table already credits several of yours.
3. Is inline protection (a per-section HTML comment your skill writes) enough to keep author-ratified content safe from foreign edits?
4. For impeccable: are there interface-bearing repos where even Users or Positioning don't apply, or where a design section should be considered universal?
5. Where should this convention live once agreed — a small shared spec page each project links to, or a copy in each project's docs?

With the filename settled, an agent in any harness opens one file and has the whole project in front of it — north star first, direction and design truth after — and every run of any of our skills leaves that file better than it found it. Remaining to settle: the exact universal heading strings, and who fills Principles when only `ce-strategy` has run (it does not interview for principles today).
