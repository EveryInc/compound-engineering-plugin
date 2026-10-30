# HTML Rendering

This reference covers how to render an artifact as HTML, whichever skill
produces it. The section contract (`plan-sections.md`,
`brainstorm-sections.md`, `ideation-sections.md`) says what the artifact
contains; this file says how HTML presents it.

The HTML file is the only artifact the run produces. Output is exclusive:
markdown or HTML, never both.
Downstream consumers that read HTML today (`ce-doc-review`, `ce-work`, a
skill resuming its own earlier artifact) read and edit the file as source
text, the way they read markdown. They do not
render it or parse the DOM. `ce-work` builds its section map from the `<h1>`
to `<h3>` headings and their anchor ids. `ce-doc-review` and a resume run edit
the file in place and keep its structure. Every rule below that concerns
structure exists so those consumers can find and change one item from source
alone.

## Hard invariants

- **Single self-contained HTML5 file.** No companion `.css`, `.js`, or
  `.svg` files. CSS goes in `<style>`, SVG is inline, and images are inline
  SVG or base64 data URIs. The one exception is a `<link rel="stylesheet">`
  to a CDN webfont CSS endpoint, paired with a fallback font stack so the
  doc still reads offline.
- **Metadata is visible text, with one copy of each value.** Every field
  the section contract defines renders as text in the page.
  There is no hidden machine-readable copy: no
  `<script type="application/json">` frontmatter block, no `data-*`
  attribute mirror, and no `<meta name="created">` or `<meta name="origin">`
  tag in `<head>`. Two copies drift. A `datetime` attribute on a `<time>`
  element that shows the same date is a parser hint, not a second copy.
- **Readers meet the title, not the tool fields.** The header shows the
  `<h1>` title, the date, and any field written for a person, such as an
  ideation focus. Every other field exists for tools, for example
  `artifact_contract`, `product_contract_source`, `execution`, `origin`, or
  `mode`. Put those in a `<details>` element right after the header, closed
  by default, with the `<summary>` text "Document metadata". Each field
  there shows its exact key name next to its value, for example
  `<dt>artifact_contract</dt><dd>ce-unified-plan/v1</dd>`, so a text search
  for the key finds it. Older documents show these fields in the header
  instead. They stay valid, because consumers find a field by its key name
  rather than its position.
- **Stable IDs as anchor IDs AND visible text.** Every ID-bearing item
  (R-, U-, A-, F-, AE-, KTD-, and idea IDs) has `id="r1"`-style anchors on its element
  and shows the ID ("R1.") as visible text in its heading or cell.
- **Section headings use the section-contract names.** If the contract says
  "Implementation Units", the heading says "Implementation Units", because
  downstream agents grep for those names. An editorial title can appear as an
  eyebrow label or sub-heading, never in place of the contract name.
- **Unified plan navigation.** A unified plan has a visible navigation
  region near the top linking the stable section anchors below.
  Requirements-only artifacts omit links to absent implementation sections.
- **Source and composition footer.** A visible footer at the end names the
  composition timestamp and the source: the upstream document when there is
  one, otherwise the user's request and the composing skill. Example shape:
  `<footer class="composition-signal">Composed 2026-05-17T14:23Z by ce-plan from <code>docs/brainstorms/...-requirements.md</code></footer>`.
  Output is exclusive, so this footer is how a reader judges staleness.
- **ASCII identifiers.** Class names, element IDs, and attribute names are
  ASCII.
- **No JS framework runtimes.** React, Vue, Svelte, or any bundled runtime is
  out. A small inline `<script>` for active-section tracking or anchor
  permalinks is acceptable.

### Stable section anchors for unified plans

| Logical section | Required id |
|---|---|
| Goal Capsule | `goal-capsule` |
| Product Contract | `product-contract` |
| Product Requirements | `product-requirements` |
| Planning Contract | `planning-contract` |
| Implementation Units | `implementation-units` |
| Verification Contract | `verification-contract` |
| Definition of Done | `definition-of-done` |
| Appendix | `appendix` |

Keep each visible heading next to its `id`; a nav link alone does not carry
the section name. An optional section with a contract-defined semantic role
carries that role on its `<section>`, for example
`data-ce-section="work-relationships"`. The role is
stable even when the visible heading changes, and it supplements the visible
heading rather than replacing it. This role attribute is a contract marker,
not a hidden copy of a visible value.

## Agent-consumability rules

The semantic structure is the extraction contract. It is what lets a
consumer reason over one requirement, unit, or idea, including its title and
every labeled field, without a hidden metadata copy to fall back on. A page
can look identical in a browser and still break this, so compose for the
source:

- Use semantic elements: `<section>` per top-level section, `<article>` per
  repeating item, `<dl>` for metadata pairs, `<table>` for tabular content,
  `<details>`/`<summary>` for collapsibles. Keep one item's content together
  inside its element.
- Field labels are visible text (`<dt>Goal</dt><dd>...</dd>`), never only an
  attribute such as `data-field="goal"`.
- Meaning lives in HTML text. CSS `content:`, background images, or
  render-only tricks carry no meaning.
- A field that tells the implementer to do something (an `Execution note`
  such as "start with a failing integration test") renders as a visible
  callout, not as a quiet pair in the unit's metadata strip, where it gets
  skimmed past.
- A `session-settled:` annotation renders as visible text with the stem
  verbatim, so grep finds it.
- Element types, the ID scheme, and the field-label vocabulary stay stable
  across versions. Visual styling can change freely.

## Reading the page

- **Readable line length.** Running prose sits in a centered column and
  stays within roughly 65-80 characters per line even at wide window widths;
  narrow windows simply wrap. Tables and diagrams may use more width than
  prose. At a phone width, a wide table, diagram, or code block scrolls
  inside its own container instead of widening the page.
- **Distinct heading levels.** Each heading level looks distinct from the
  others and from inline bold text.
- **Repeating cards collapsed by default.** When a section repeats three or
  more item cards that carry secondary content (Implementation Units are the
  usual case), each card shows its ID, title, and short descriptive metadata;
  the secondary content (approach, test scenarios, verification, patterns)
  sits in `<details>` with no `open` attribute. The reader should see the
  unit list at a glance, not one long scroll. Secondary content is what a
  reader opens on demand. A card whose body is the point stays expanded:
  a Key Technical Decision's rationale, or an ideation idea card, which its
  section contract says is read in full. When the work ships as several PRs,
  each PR group is a heading at the unit cards' heading level, starting
  with its `PR<N>` label, with its
  `Waits on:` line visible beneath it, and its units keep their own cards.
- **Within-section sub-nav.** A section with 6+ repeating cards starts with a
  short list of anchor links to its cards.
- **Uniform marks, no one-edge accent.** Chips in a row share one shape.
  Differentiate a chip, pill, or callout card by a full tint and a colored
  label, never by a colored stripe on one edge, which reads as broken.
- **Text contrast is local.** Each text-on-fill pairing must read on its own
  fill; muted text calibrated for the page background often washes out on a
  tinted card.
- **Markdown input is content, not design.** When the input includes
  markdown, take its facts and sections, not its bullet-or-table choices.
  Pick the HTML shape the content needs, and keep any concern grouping the
  section contract asks for.

## Diagrams and wireframes

Diagrams are inline SVG in whatever shape conveys the content fastest.

- **Prose is authoritative and complete.** A diagram or wireframe sits next
  to the prose it illustrates and never holds a relationship, step, or spec
  the prose lacks. A text-reading agent does not parse SVG geometry. When a
  picture and the prose disagree, the prose governs.
- **Labels clear of strokes.** No arrow, connector, or shape edge passes
  through a text label, including the slanted edge of a skewed or rotated
  shape, and a connector does not run across unrelated shapes. Each label
  sits inside or beside the thing it names. Coordinates are written
  without seeing them render, so trace every label against every stroke
  before emitting.
- **Geometry before tint.** Distinguish shape roles by geometry (diamond,
  rectangle, oval) before adding extra neutral tint tiers; small tint
  differences flatten or invert under dark-mode extensions and printing.
- **Plan diagrams carry no hedging caption.** A plan diagram, and the
  technical-design section around it, renders the same authoritative content
  as its prose, with no "directional only" caption or preamble. That caption
  belongs only to wireframes.
- **Wireframes are for UI-shaped requirements in requirements docs.** Only
  the requirements-only unified plan that `ce-brainstorm` writes carries
  wireframes, not an implementation-ready plan from `ce-plan`. Within it, a
  requirement that describes a user-facing screen, layout, or flow may carry
  one. A non-visual
  requirement takes a conceptual diagram instead, and the wireframe scope
  never suppresses one. A wireframe is a wireframe, not a mockup: gray layout
  regions, placeholder copy, static, one per distinct visual concept. Each
  carries a visible caption such as "Directional only. Illustrates the
  intended user-facing shape; colors, spacing, copy, and components are
  placeholders, not requirements."

## Reference links

Hyperlink each entry in a Sources & References section to its canonical
destination when that destination is established. For a GitHub `origin`
(`git remote get-url origin`), a repo path links to
`<repo-url>/blob/main/<path>` and `PR #636` links to `<repo-url>/pull/636`.
An external tracker ID links only when its workspace URL already appears in
context. Do not invent URLs; a guessed link is worse than plain `<code>`
text. Inline mentions in prose stay unlinked.

## Styling

Take visual style from the user's direction in this session, their
project instructions, a design skill they invoke, or a DESIGN.md at the
repository root, `docs/DESIGN.md`, or `.compound-engineering/DESIGN.md`;
with none of those, choose a quiet, readable style yourself. Most DESIGN.md
files describe a product or marketing surface, so it contributes the
brand's identity, not its scale:

- Take its palette, font weights and roles, and corner character.
- Keep reading sizes and spacing doc-scaled even when its tokens are sized
  for product UI or marketing heroes. Do not apply a hero or product-UI
  surface color as the page background; extract the principle rather than
  the literal value. Skip decoration with nothing to attach to in a doc.
- Load a font only when it is a known open webfont. Never attempt a
  proprietary brand face; use the DESIGN.md's fallback chain or a
  family-matched system stack, and never promote a display face to body
  text.

## Post-compose audit

Before returning the artifact, check it against the conditions above:

- One self-contained file; webfont CSS is the only external resource the
  page loads.
- No hidden metadata copy: no JSON `<script>`, `data-*` mirror, or
  `<meta name="created">`/`<meta name="origin">` tag.
- Tool-facing fields sit in the closed "Document metadata" block under
  their exact key names, and the header does not repeat them.
- Every stable ID appears as both `id=""` and visible text.
- Section headings match the section-contract names; a unified plan has its
  navigation region and stable anchors.
- The composition footer is present.
- Repeating cards with secondary content are collapsed by default, with no
  `open` attribute; sections with 6+ cards have a sub-nav.
- No one-edge colored accent on chips, pills, or cards.
- Prose stays within a readable line length at wide widths, nothing widens
  the page at a phone width, and heading levels are distinct.
- Every diagram relationship and wireframe detail is also in the prose, and
  no stroke crosses a label.
- No JS framework runtime, no invented reference URLs, no leaked template
  placeholders (`{skill}`, `[plan title]`), and no process notes in the
  artifact.
