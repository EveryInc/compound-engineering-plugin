# Ideation Sections

This is the section contract for the ce-ideate artifact — it describes
*what* a persisted ideation document contains, independent of output
format. It is paired with a format-rendering reference
(`references/markdown-rendering.md` or `references/html-rendering.md`)
that describes *how* the resolved format presents these sections. The
same content renders in either format; only presentation differs.

Load this file at save time alongside the rendering reference matching
`OUTPUT_FORMAT` (see `references/post-ideation-workflow.md` §4.1).

## What the artifact contains

An ideation artifact is a ranked, critiqued candidate set, the grounding
the candidates were qualified against, and a record of what was cut. It
is a human-facing discovery document, not a requirements doc or plan —
keep it about the ideas and their basis, not implementation.

### Metadata

- **date** — composition date (YYYY-MM-DD).
- **topic** — kebab-case topic slug.
- **focus** — the focus hint, when one was given. Omit when open-ended.
- **mode** — `repo-grounded`, `elsewhere-software`, or
  `elsewhere-non-software`.

Markdown renders metadata as YAML frontmatter at the top of the file.
HTML renders it as visible header text (per the html-rendering hard
invariant: one visible source of truth per value, no hidden
machine-readable copy).

**No status field — not on the doc, not per idea.** An ideation doc is a
point-in-time discovery artifact, not a tracked work item: it carries no
`active → completed` lifecycle and no per-idea "explored" marker.
Tracking mutable workflow progress inside the artifact would create a
second source of truth that drifts — whether an idea was later pursued is
knowable from downstream artifacts (a brainstorm or plan that picked it
up), so it is not duplicated here.

### Grounding Context

The Phase 1 grounding summary the ideas were qualified against — labeled
"Codebase Context" in repo mode, "Topic Context" in elsewhere mode.

### Topic Axes (conditional)

The 3-5 axes from Phase 1.5, one per line. When Phase 1.5 was skipped, a
single line records why (`Decomposition skipped — atomic subject` or
`Decomposition skipped — surprise-me mode`). Omit the section entirely
when not applicable.

### Ranked Ideas

The surviving candidates, ranked. Each idea carries:

- **title**
- **description** — concrete explanation.
- **axis** — the topic axis this idea targets. Omit when decomposition
  was skipped.
- **basis** — tagged `direct:` (quoted evidence) / `external:` (named
  prior art) / `reasoned:` (written-out first-principles argument).
- **rationale** — how the basis connects to the move's significance.
- **downsides** — tradeoffs or costs.
- **confidence** — 0-100%.
- **complexity** — Low / Medium / High.

**Keep idea cards expanded; add a jump-list when the section is long.**
Unlike plan Implementation Units, ideation idea cards are meant to be read
in full to choose a direction — do not hide their substance behind
default-closed `<details>`. But the Ranked Ideas section is typically 5-7
cards and runs long in HTML, so add a within-section jump-list of the
ranked titles (anchor links to each card) at the top of the section, per
the rendering reference's within-section sub-nav affordance.

**Illustrative visuals — decide on the idea's shape, not on how clear the
prose reads.** A well-placed visual can make a direction land faster for a
human scanning a set of candidates. Decide per survivor — none, a few, or
most may warrant one; there is no quota and no cap.

Watch one trap when you make this call: the prose always conveys the idea
(that is the hard rule below), and as a text-native reasoner you will tend
to read your own prose, judge it "clear," and conclude no visual is needed
— which quietly under-produces the visuals that actually help a reader. So
"the prose is already clear" is never the reason to skip. The real
question is what the idea *hinges on*, and whether that has a shape a
picture carries faster than a sentence.

**Concrete-vs-abstract is the wrong axis.** Don't reach for a visual
because an idea feels big or conceptual, and don't skip one because it
feels small or concrete. A new-feature *concept* is often the best
candidate — the reader has to picture an unfamiliar arrangement — while
many concrete changes (an error fix, a drop-in dependency swap) have
nothing structural to draw. Ask what the idea hinges on, not how abstract
it is.

- **Hinges on a structure → lean toward a visual.** A relationship
  between parts, a flow or sequence, a before/after contrast, a
  structural arrangement, an analogy mapping (especially cross-domain
  ideas), a quantitative comparison. A picture lands these faster than a
  sentence even when the prose is perfectly clear — and it should show
  the *basis* or the *why-it-matters*, not restate the title. New-feature
  concepts frequently live here.
- **A single point with nothing structural to show → no visual.** A
  renamed thing, a copy change, "handle the null case," a drop-in library
  swap — there is no shape a diagram would add; one here is decoration.
  Size and abstraction don't decide this: a sweeping concept can still be
  one proposition ("ship dark mode"), and a small concrete fix can still
  re-route how two parts talk (real shape, worth drawing).

Decoration — a visual with no shape to show, or one that just restates the
title — is the failure mode, and it is slop whether it appears once or
five times. A visual that genuinely shows the idea's shape is never slop,
however many ideas warrant one.

Two constraints on any visual you do add:

- **Stay at the idea's altitude — illustrative, not a spec.** This is the
  *opposite* of a plan or requirements diagram. The shared rendering
  reference treats plan diagrams as authoritative content and forbids
  "directional sketch" framing; ideation visuals are the reverse —
  deliberately directional overviews of a direction nobody has committed
  to yet. Keep them conceptual (contrast, analogy, rough flow). Detailed
  architecture, sequence diagrams, and wireframes belong downstream in
  ce-brainstorm / ce-plan once a direction is chosen, not here.
- **Keep the prose standing alone.** A reader who ignores the visual
  still gets the complete idea and its basis. The visual accelerates
  understanding; it never carries content found nowhere else.

Rendering mechanics (inline SVG in HTML with the layout-legibility and
halo rules; a fenced mermaid block in markdown when the shape suits it)
follow the rendering reference's Diagrams section — but that section's
plan-centric, authoritative-diagram framing is overridden here by the
illustrative, decide-per-idea stance above.

### Rejection Summary

A table of considered-and-cut ideas with a one-line reason each. When an
axis ended with zero survivors despite recovery, record it as its own
row so the coverage gap is visible rather than silently absent.

## Markdown skeleton

The section shape both formats carry. In markdown it is written
literally (omit clearly irrelevant fields only when necessary); in HTML
the same sections render per `html-rendering.md`.

```markdown
---
date: YYYY-MM-DD
topic: <kebab-case-topic>
focus: <optional focus hint>
mode: <repo-grounded | elsewhere-software | elsewhere-non-software>
---

# Ideation: <Title>

## Grounding Context
[Grounding summary from Phase 1 — "Codebase Context" in repo mode, "Topic Context" in elsewhere mode]

## Topic Axes
[3-5 axes from Phase 1.5, one per line, OR a single `Decomposition skipped — ...` line. Omit the section if not applicable.]

## Ranked Ideas

### 1. <Idea Title>
**Description:** [Concrete explanation]
**Axis:** [Topic axis this idea targets — omit when decomposition was skipped]
**Basis:** [`direct:` / `external:` / `reasoned:` — quoted, cited, or written-out argument]
**Rationale:** [How the basis connects to the move's significance]
**Downsides:** [Tradeoffs or costs]
**Confidence:** [0-100%]
**Complexity:** [Low / Medium / High]

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | <Idea> | <Reason rejected> |

[When applicable, append axis-coverage gaps as their own rows so the gap is visible:]
| - | axis: <name> | recovery skipped (cap reached) — no survivors on this axis |
```

## No process exhaust

Keep engineering-process metadata out of the artifact — no "captured at
Phase X" notes, no skill-pointer "next steps", no italic provenance
lines. The reader wants the ideas and their basis. (HTML carries a
single visible composition-signal footer per the html-rendering
invariant; that is the one provenance element that belongs in the doc.)
