# Strategy Template

Loaded by `SKILL.md` after the interview is complete. Fill it in using the captured answers and write to `STRATEGY.md`.

## Rules for filling in

- Use the user's own language where possible. Do not paraphrase into generic PM-speak.
- Each section this skill writes stays compact - together they should read in under 5 minutes. Sections other writers contribute are theirs; do not shorten them to hit that bound.
- Write the sections below in this order. Sections you did not write — added by the user or another skill — are preserved as found and stay where they are; do not add sections of your own beyond this template.
- Optional sections (Milestones, Brand): delete entirely if unused. Do not leave empty headers. Boundaries is always present.
- Set `last_updated` in the YAML frontmatter to today's ISO date (YYYY-MM-DD). Do not duplicate the date in prose.
- Set `name` in the frontmatter to the product or initiative name (the same value used in the H1 title).

## Template

The block below is the literal file to write (minus this line and the fences). Replace every `{{placeholder}}` with the captured answer. Delete any optional section whose placeholder wasn't answered.

~~~markdown
---
name: {{product_name}}
last_updated: {{YYYY-MM-DD}}
---

# {{product_name}} Strategy

{{If a legacy sibling doc from another tool still exists at the repo root - VISION.md, PRODUCT.md - and the user chose to link to it rather than fold it in (a folded sibling is redundant: no pointer, nothing deferred to it), one line here pointing to it, e.g. "See VISION.md for the project's principles; this document carries direction." Then do not restate what that doc already says: where a section below would repeat it, keep this doc's section to what is specific to strategy and defer to the sibling for the rest. Omit the line when no sibling exists. Sections other tools have already written into this file stay where they are; this skill's sections are placed around them in the order below without moving them.}}

## Purpose

{{1-2 sentence diagnosis. Names the user situation and the crux that makes it hard, and so why the product exists. No solution language.}}

## Positioning

{{1-2 sentence guiding policy. The choice this product commits to that a neighboring product could not truthfully claim, so that the purpose becomes tractable.}}

## Users

**Primary:** {{Persona name}} - {{one-sentence JTBD, e.g. "They're hiring {{product_name}} to..."}}

<!-- Duplicate the block above for additional personas only if truly necessary. Fewer is better. -->

## Boundaries

- {{one line per item the team is tempted by and has decided against; "Nothing named yet." if none}}

_Resist a change when:_ {{one line, from the proposals the user resisted in the stress test; omit the line if none}}

<!-- Always present. Things the team keeps being tempted by, plus the resist test. Not a blocker list. -->

## Key metrics

- **{{metric 1 name}}** - {{one-line definition; where it's measured}}
- **{{metric 2 name}}** - {{...}}
- **{{metric 3 name}}** - {{...}}

<!-- 3-5 total. Stop at 5. -->

## Tracks

### {{Track 1 name}}

{{One line: what this track is - the investment area, not a feature list.}}

_Why it serves the approach:_ {{one line}}

<!-- Duplicate the block above for 2-4 tracks total. If you can't keep it to 4, something is wrong - fold related tracks together. -->

## Milestones

- **{{YYYY-MM-DD}}** - {{milestone}}

<!-- Optional. Delete the section if unused. Only externally visible milestones: launches, fundraises, conferences, renewals. -->

## Brand

**One-liner:** {{single-sentence pitch}}

**Key message:** {{2-3 lines if useful}}

<!-- Optional. Delete the section if unused. -->
~~~

## Post-write checklist

Before confirming the write, scan the draft for:

- [ ] Frontmatter present at the top with `name` and `last_updated` keys.
- [ ] `last_updated` carries today's date in ISO format (YYYY-MM-DD).
- [ ] No section this skill wrote has more than 4 sentences except Tracks (where each track has its own short block); sections other writers contribute are not measured.
- [ ] No placeholders remain (`{{...}}`).
- [ ] Optional sections (Milestones, Brand) with no content have been deleted, not left empty; Boundaries is present.
- [ ] Sections this skill did not write are unchanged and still in place.
- [ ] Metric count is between 3 and 5 and track count between 2 and 4 - counting a meaning explicitly deferred to a linked legacy doc as carried there, not as missing here.
- [ ] Purpose and Positioning are connected - one clearly responds to the other.
