# HTML Rendering

A format-rendering reference: how to render any artifact in HTML, independent of which skill produces it. Paired with a section contract (`plan-sections.md`, `brainstorm-sections.md`, etc.) that defines *what* the artifact contains; this file defines *how* HTML presents it. The same content rendered by different skills shares these principles.

The HTML artifact is the *only* artifact the skill produces for that run: output mode is exclusive (markdown OR HTML, never both). Downstream consumers that read HTML today (`ce-work`, human readers) read it directly; the agent-consumability rules below make that work. `ce-doc-review` is *not* an HTML consumer: its mutation mechanics are markdown-only, so the ce-plan handoff gates the 5.3.8 doc-review pass to `OUTPUT_FORMAT=md` and skips it for HTML.

## Hard invariants

These hold regardless of which skill produced the artifact.

- **Single self-contained HTML5 file.** No companion `.css`, `.js`, or `.svg` files. CSS lives in `<style>`, SVG inline, images as base64 data URIs or inline SVG. One exception: a `<link rel="stylesheet">` to a CDN webfont CSS endpoint (Google Fonts, Bunny Fonts), paired with an offline-readable fallback font stack so the doc stays readable if the CDN is unreachable.
- **All metadata appears as visible text, single source of truth.** Metadata (title, type, status, date; exact fields per-skill, defined in the section contract) renders as visible HTML that downstream agents and humans read. No hidden machine-readable copy: no `<script type="application/json">` frontmatter block, no `data-*` attribute mirror, no `<meta name="status">` / `<meta name="created">` / `<meta name="origin">` in `<head>` duplicating the visible header. One representation per value; drift across two copies is the failure this prevents. The text-and-attribute redundancy in `<time datetime="2026-05-12">2026-05-12</time>` is fine because the attribute is a parser hint, not a hidden copy.
- **Editable status renders as `<span class="status">{value}</span>`.** Downstream tooling (`ce-work` shipping flip, future HTML-aware consumers) finds and rewrites status by selector. A header `<dl>` cell (`<dt>Status</dt><dd>active</dd>`), a `<meta>` tag, or visible text without the `class="status"` hook all break the flip: the consumer can't locate or disambiguate the value. The span may sit anywhere (header metadata, stats strip, hero banner); placement is a visual choice, the selector shape is the contract.
- **Stable IDs as anchor IDs AND visible text.** Every ID-bearing item (R-IDs, U-IDs, A-IDs, F-IDs, AE-IDs, KTDs) gets `id="r1"` on its element AND appears as visible text inside it (e.g., "R1." in the cell or heading). Downstream agents find the ID in source the same way they find it in markdown.
- **Source / composition signal.** A visible footer names the composition timestamp and source identifier (user prompt context, upstream brainstorm doc, or the composing skill name when there's no external source). Example: `<footer class="composition-signal">Composed 2026-05-17T14:23Z by ce-plan from <code>docs/brainstorms/...-requirements.md</code></footer>`. Under exclusive output mode this is the artifact's own provenance, with no markdown sibling to reference; omitting it leaves readers unable to tell how stale the rendering is.
- **ASCII identifiers.** Class names, element IDs, data attribute names are ASCII-only.

## Precedence stack for style preferences

Honor user style preferences in this order (highest to lowest):

1. **In-session conversation**: explicit direction the user gave this run.
2. **Preferred stylesheet reference** named in loaded agent-instruction context (typically `AGENTS.md` / `CLAUDE.md`, but scan loaded context; don't enumerate locations). The reference may be a file path (`docs/style.css`), a URL, a named library ("Tailwind"), or a style brand ("Stripe docs"). Agent-instruction files carry deliberate agent-aware preferences, so this tier sits above DESIGN.md.
3. **DESIGN.md** discovered on the filesystem (see "DESIGN.md discovery").
4. **Fallback default**: the opinionated palette / typography the agent picks when no preference exists.

### Active-recall at compose time

Before writing the CSS, scan loaded context for a stylesheet reference the user has indicated for documents like this. If found and inlinable (short local file, fetchable URL within budget), inline it into `<style>`. If found but not inlinable (large framework, paywalled stylesheet, named system without a fetchable source), compose CSS in its spirit (typography, color, density cues drawn from the named system). Fall back to the default style only when no preference signal exists.

The single-file invariant holds either way. External `<link rel="stylesheet">` is permitted only for CDN webfont CSS (with the offline fallback stack); never link an external stylesheet carrying layout, color, or typography rules the doc can't read offline.

### DESIGN.md discovery

When tier 3 applies, look for a DESIGN.md in these locations, first match wins:

1. Worktree root (resolve via `git rev-parse --show-toplevel`).
2. `docs/DESIGN.md`.
3. `.compound-engineering/DESIGN.md`.

Read once at compose time. Absent: fall through to the fallback default. Worktree-root only; do not fall through to a main checkout. Users on a worktree who want HTML defaults can add DESIGN.md there.

**DESIGN.md is a partial override, not all-or-nothing.** Real DESIGN.md files vary (token tables, CSS variables, prose) and most cover a subset of what HTML composition needs. Apply the tokens that fit a long-form text doc (typography roles, text colors, contrast targets, border-radius scale, elevation primitives, muted-vs-accent split); skip the rest. Four failure modes to defend against:

- **Scope mismatch (product UI vs doc surface).** A DESIGN.md aimed at product marketing or app UI may name page-surface colors, button states, input borders, or hero backgrounds tied to *that* surface, not a generic doc. Page-surface colors are the canonical trap: `--surface: #c0f0fb` belongs on the product's marketing page, not on every plan or requirements doc. Extract the principle (the design language uses a tinted surface) rather than the literal value when the token is product-UI-scoped. Apply literal values only when the token transfers (text color, type scale ratio, radius scale, contrast ratio).
- **Partial coverage.** When DESIGN.md defines some categories but not others (colors but no spacing scale, typography but no elevation), use DESIGN.md for what it covers and the fallback default for the rest. Don't require DESIGN.md to be complete before honoring it.
- **Named font without a fetchable source.** When DESIGN.md names a font ("Signifier", "Every") without a CDN URL or local `@font-face` source to inline, treat the name as a hint about design intent, not a literal directive. Emit a system-font stack in the same family (serif vs sans vs mono) at a matching weight. The single-file invariant still holds; do not link an external stylesheet to fetch the named font.
- **Typography-scale mismatch.** DESIGN.md typography tokens are often product-UI-sized (body 18-20px, headings 32-52px). A long-form doc needs body ~14-16px and headings ~1.2-1.6× body. When the size scale looks product-scaled, use the **family**, **weight**, and **OpenType feature** assignments (these carry the design language) and pick the agent's own **size scale** for the doc surface. Apply DESIGN.md sizes literally only when clearly doc-scaled (body 14-16px, headings under ~32px).

## Format principles

These shape what "good" HTML looks like; the agent applies them per artifact based on content.

### Readable measure, not full bleed

Long-form text is unreadable at full viewport width: past ~80 characters per line the eye loses the return sweep. As a fallback-default (tier 4, overridden by in-session direction or DESIGN.md), center the document in a content container and hold prose to a comfortable measure.

- **Page container.** A centered column with max-width in the ~820-960px band (`margin-inline: auto`) keeps the doc off the far edges of wide monitors while leaving room for richer shapes.
- **Prose measure.** Hold running paragraphs to ~65-80 characters (`max-width: ~70ch` on text blocks). Named test: read a paragraph at full window width on a wide display; if the return sweep is effortful, the measure is too wide.
- **Let wide content break out.** Tables, diagrams, and side-by-side columns may use the full container width (or wider) when needed; the measure constraint is for prose, not everything.

Express the constraint in `ch`/`rem` rather than a hardcoded pixel value so it survives font-size and DESIGN.md overrides. DESIGN.md or an in-session instruction overrides these values; this is the no-preference fallback.

### Markdown source is content, not design

When markdown (or markdown-shaped chat context) is input, use it for semantic content (what the doc is about, what sections exist, what each establishes). Do NOT treat its bullet-vs-table presentation as authoritative; re-choose the rendering per content shape in HTML's richer affordance space. If markdown rendered 13 requirements as a bulleted list, that does NOT mean HTML must: ask whether 13 items sharing `ID + body` shape deserve a table.

### Prose is authoritative

When a visualization disagrees with the surrounding prose, the prose governs. If they diverge, the visualization is wrong.

### Hyperlink the reference index

When the doc has a Sources & References (or equivalent reference-index) section, hyperlink each entry to its canonical destination so readers can open it directly. A long bare-text list of paths and ticket IDs is the format's biggest unforced UX miss; the reader has to copy-paste each entry.

Resolve the repo's GitHub URL once at compose time:

```bash
git remote get-url origin
```

Apply linking to three reference shapes:

- **Repo-relative code/doc paths** (`services/foo.ts`, `docs/solutions/bar.md`) → `<repo-url>/blob/main/<path>`.
- **Named GitHub PRs/issues** (`PR #636`, `issue #1048`) → `<repo-url>/pull/636` or `<repo-url>/issues/1048`.
- **Named external trackers** (Linear `ESP-1705`, Jira `PROJ-123`) → link only when the workspace URL is established in loaded context (a `linear.app/<workspace>/...` URL appeared earlier or in `AGENTS.md`); otherwise leave as text.

**Do not invent URLs.** If `origin` isn't a GitHub URL (GitLab, Bitbucket, internal host) and the main-tree URL pattern isn't obvious, leave entries as `<code>` text. If the external tracker workspace isn't established, leave as text. A broken or guessed link is worse than no link.

**Scope: reference index only, not inline prose.** Inline `<code>` mentions of paths or PRs inside paragraphs stay as code or text. Linking every mention clutters; readers expect clickable jumps where the doc presents itself as a reference index.

### Text contrast is local

Every text-on-background pairing must hold up on its own. A color that works for prose on the page background does not automatically work for a small label inside a tinted container. The common violation: a generic "muted" text variable (calibrated for prose-on-bg) applied to secondary text inside an accent-soft / warn-soft / info-soft container.

Test by reading each filled shape's labels at the rendered scale. If the subtitle or secondary text feels washed-out against the fill, the choice is wrong for that local context: pick a color from the same family as the fill (accent-text for accent-soft) or drop the muting and rely on size and weight for hierarchy.

### Body bold not colored by default

Reserve accent text color for status chips, ID chips, links, and section borders. Do NOT color `<strong>` in body content by default. Bold weight already carries emphasis; coloring every `<strong>` in a long list overwhelms the eye, especially in dark mode. CSS leaves `strong` at `color: inherit` unless a specific surface (status pill, ID chip) is being styled.

### No JS framework runtimes

A small inline `<script>` for active-section TOC tracking or anchor-permalink behavior is acceptable. React, Vue, Svelte, or any framework runtime is not: the single-file invariant doesn't permit framework bundles, and the artifact's longevity doesn't warrant a build dependency.

## Section anatomy

How section types commonly render in HTML. Patterns, not contracts; the agent picks shapes that fit the content.

- **Summary / Problem Frame**: semantic `<section>` with prose paragraphs. Optionally precede with an eyebrow label (small-caps tag above the title) for editorial polish.
- **Requirements**: `<table>` is the default at 5+ uniform items, bullets at smaller counts. Concern-grouping takes precedence over the flat-table default: when requirements span distinct concerns, group under bold inline headers (or per-group sections) first, then apply the 5+ table default *within* each group rather than flattening into one table. Each row has the R-ID as visible text in its own column. Consider a "covered by" column for reverse traceability when ID-anchored items have downstream references in the same doc.
- **Implementation Units**: repeating `<article>` cards with a stable ID chip (visible "U1"), a metadata strip (`<dl>` of Goal / Files / Dependencies), and secondary content (Approach, Test Scenarios, Verification, Patterns to Follow) inside `<details>` collapsibles, **default-closed**. At 3+ units the default-closed rule is load-bearing: rendering all units expanded turns the doc into one continuous scroll where the reader can't see the unit list at a glance. The metadata strip is the primary always-visible surface; subsection labels (`<summary>`) are click-to-expand affordances. A single unit with no secondary content can skip `<details>`; the rule fires when content exists to hide. The `<dl>` strip is for *descriptive* fields (Goal, Files, Dependencies). A *directive* field (`Execution note` is the canonical case, carrying a procedural instruction the implementer must act on, e.g. "start with a failing integration test") does not belong in the strip, where it renders as a passive pair styled like a date and gets skimmed past. Render it as an advisory callout (see Tinted callout cards) so its visual weight matches its actionability. Test: descriptive value → metadata pair; something the reader must act on → callout.
- **Key Technical Decisions**: repeating cards with the decision ID, bold decision title (often inline code for technical identifiers), and prose rationale. Flat cards (not collapsibles): reference material readers scan, not drill into.
- **Risks**: color-coded cards with a status eyebrow ("RISK · MITIGATED" / "OPEN · DEFERRED FOLLOW-UP") and prose body. Left-border or accent color communicates status at a glance.
- **Scope Boundaries**: callout cards with color-coded left borders (in-scope vs deferred vs outside) when the distinction is meaningful.

The agent picks more elaborate or simpler shapes based on each artifact's content.

## Diagrams

When the section contract calls for a diagram (architecture, sequence, flowchart, state machine, swim lane, data-flow, quantitative comparison), HTML renders it as **inline SVG**. The agent picks the shape that conveys the content fastest; there is no fixed catalog of "approved" types. Quantitative comparison across categories → a bar chart; component relationships → a topology diagram; process flow across participants → a swim lane.

**Conceptual diagrams are not wireframes.** The wireframe affordance below is scoped to brainstorm requirements docs about *visual products* and excluded for non-visual systems. That exclusion is about wireframes only: a brainstorm about a data model, schema, agent workflow, or migration is still free to use a conceptual diagram (a before/after field map, a source-of-truth fan-out, a state diagram). Don't let the wireframe exclusion suppress a conceptual diagram the content warrants.

**Diagrams complement prose; they never replace it.** A diagram is an accelerant next to the prose it illustrates, not a substitute. The IDed prose stays complete and standalone: a reader who ignores every diagram still gets the full content in text, and a text-reading downstream agent (which does not parse SVG geometry) is never left with a relationship that exists only in the picture. This extends prose-is-authoritative: prose governs on completeness as well as disagreement, so adding a diagram is not license to thin the prose it depicts.

### Layout legibility for hand-authored SVG

The agent designs SVG coordinates without rendering; layouts that look fine in source can collide in practice. Before emitting, trace each labeled arrow and each text label:

- **No arrow path passes through a text label.** If an arrow line or curve crosses a label's bounding box, the text reads as struck-through and the arrow as terminating at the wrong element. Fix by re-routing the arrow, moving the label, or applying `paint-order: stroke fill` with a stroke color matching the diagram background to halo the label. The halo width is a judgment call: narrow enough not to bleed into glyph strokes (a halo whose width approaches the glyph's own stroke width muddies the text color), wide enough to mask underlying arrows (at least the arrow's stroke width plus a hairline). Verify by inspecting rendered text at the target font size; if glyphs look thicker or more colored-toward-halo than the same text outside the diagram, the halo is too wide.
- **Arrow labels sit adjacent to the arrow's midpoint** (typically within ~10-15px above or beside the line they describe). A label floating at the diagram's edge that readers must trace back to an arrow is broken.
- **Avoid long curves that traverse the diagram** to connect a component on one side to one on the other. If A and D need a labeled connection across a multi-component layout, prefer reordering boxes so A and D are adjacent, numbered step badges next to each participant tied together by the caption, or a short labeled-channel notation, rather than one curve crossing unrelated elements.
- **Differentiate diagram shapes by geometry first, by fill semantics second.** Geometry (diamond = decision, rect = step, oval = start/end, parallelogram = data) carries the role unambiguously. Fill semantics (accent-soft for highlighted path, warn-soft for fallthrough) carry meaning. Resist introducing additional neutral-tint tiers (a slightly-lighter grey to mark "decision shapes are different from boxes"): when geometry already differentiates, an additional luminance tier adds no information and creates fragility: small RGB deltas survive native browser rendering but can be flattened or inverted inconsistently by dark-mode extensions, accessibility plugins, or printing.

### Plan architecture diagrams are not directional sketches

Do not add hedging captions or section preambles to plan SVG diagrams: phrases like "directional guidance for review, not implementation specification" do not belong on plan diagrams or on unit-card technical-design subsections. Plan diagrams render the same authoritative content as the surrounding prose; the prose-is-authoritative rule already governs disagreement. Hedging language is reserved for the wireframe affordance below, which carries a *required* directional caption because the wireframe is explicitly NOT a spec.

## Wireframe mockups (requirements docs only)

When a brainstorm requirements document describes a user-facing visual surface (UI feature, screen layout, screen flow, component placement), the HTML rendering may include a wireframe mockup. This applies ONLY to brainstorm requirements docs about visual products, not to plan artifacts and not to brainstorms about non-visual systems (API design, agent workflows, infrastructure).

When a wireframe is included:

- **Fidelity ceiling: wireframe, not mockup.** Gray boxes for layout regions, text labels for content placeholders, intentional placeholder copy (`[Product name]`, `[CTA label]`, `[user avatar]`). No pixel-perfect colors, no exact typography, no specific component-library references. The wireframe communicates spatial arrangement and structure, not visual style.
- **Static only.** Inline SVG or simple HTML/CSS for layout. No JS interaction, no working form fields, no state changes, no live data.
- **Anti-padding.** One wireframe per distinct visual concept.
- **Mandatory directional caption.** Every wireframe carries an explicit "directional, not the spec" note adjacent to it. Required wording (or close paraphrase): *"Directional only — illustrates the intended user-facing shape. Exact colors, spacing, copy, and component choices are placeholders for review, not requirements."*

Without this caption the wireframe risks being read as a binding visual spec, which the affordance is explicitly designed to avoid.

## Affordance idioms

Common HTML affordances the agent can reach for when content benefits. Examples, not requirements; other affordances are fine when the content suggests them.

- **Sticky TOC sidebar with active-section indicator**: when navigation will materially help and the implementation is reliable: two-column layout on desktop collapsed to top-of-page on mobile, paired with a small inline `IntersectionObserver` script that toggles `.active` on the matching nav anchor. Trade-off: a broken sticky TOC (layout collisions, active-section drift, dark-mode CSS issues) is worse than a static top-of-doc TOC. For most long docs, default-closed `<details>` on repeating cards already cuts the visible scroll enough that a static TOC works; reach for sticky only when collapsibles alone don't solve navigation.
- **Within-section sub-nav** for sections with 6+ repeating cards (Implementation Units, KTDs, Risks at large counts). A short list of card-anchor links (`<ul>` of `<a href="#u1">U1. ...</a>`) at the section top gives readers a jump table, no JS needed. Lower-complexity alternative to the sticky TOC for long card sections.
- **Eyebrow labels** (small-caps tag above section titles) for editorial polish, especially when titles are narrative rather than literal.
- **Stats strip** at the top when the artifact has 3+ quantifiable signals worth surfacing at a glance.
- **`<details>` + `<summary>`** for collapsible secondary content inside repeating cards. All collapsibles start closed; `open` should not appear on any `<details>` inside repeating cards by default.
- **Side-by-side columns** for parallel content (Request / Response, Before / After, two alternatives).
- **Tinted callout cards** for content "different in kind" (Deferred, Open Questions, advisory notes, unit-level execution notes): color-coded left borders communicate kind at a glance.

## Agent-consumability rules

Downstream agents that read HTML today (`ce-work`, future consumers) read the file as linear text, not via DOM extraction. `ce-doc-review` is not a current HTML consumer (see opening note). Compose so semantic understanding is reachable in source:

- **Use semantic HTML over `<div>` soup.** `<article>` per unit card, `<dl>` for metadata pairs, `<table>` for tabular content, `<details>` / `<summary>` for collapsibles, `<section>` for top-level sections. Structure markers carry meaning to a text-reading agent.
- **Render field labels as visible text, not attributes.** Emit `<dt>GOAL</dt><dd>...</dd>`, not `<dd data-field="goal">...</dd>`. The label is the semantic anchor.
- **Keep U-IDs, R-IDs, and similar as visible text** in headings and cells, not only as `id=""` attributes. The agent finds "U1." in source the same way it finds it in markdown.
- **Match section heading vocabulary to the section contract.** When the contract says "Implementation Units," the HTML heading is "Implementation Units," not "How we'll build it," even if the narrative reads better. Section heading vocabulary is the contract downstream consumers grep for. (Editorial re-titles can appear as eyebrow labels, sub-headings, or visual framing; the load-bearing heading matches the contract name.)
- **All semantic content lives in actual HTML text.** No CSS `::before { content: "..." }` carrying meaning, no background images as content, no semantic info that only renders. Whatever the agent sees in source is what it knows.
- **Stable structure is the public API.** Element types, the ID and label scheme, and the field-label vocabulary don't break across versions. Visual styling can change freely.

## Post-compose audit

Before returning the artifact, scan for common slips:

- **Single self-contained file.** No companion `.css` / `.js` / `.svg`.
- **No hidden machine-readable metadata copy.** No `<script type="application/json">` frontmatter block, no `data-*` attributes mirroring visible values, **no `<meta name="status">` / `<meta name="created">` / `<meta name="origin">` in `<head>`** duplicating the visible header. Metadata lives in visible text; one source of truth per value.
- **Status renders as `<span class="status">{value}</span>`** so downstream tooling can flip `active → completed` by selector.
- **All stable IDs** appear as both `id=""` and visible text.
- **Section heading vocabulary** matches the section contract names (downstream agents grep these).
- **Source / composition signal** is present as a visible footer (composition timestamp + source identifier).
- **Repeating cards with 3+ instances put secondary content inside default-closed `<details>`.** Fully-expanded unit cards in a long Implementation Units section is a failure mode: the reader can't see the unit list at a glance. Verify by skimming the rendered units; each `<article>` should render as ID + title + metadata strip with collapsibles below, not one long block.
- **Within-section sub-nav** present for sections with 6+ repeating cards.
- **Body `<strong>`** is not colored with the accent palette.
- **`<details>`** inside repeating cards have no `open` attribute.
- **Diagram labels** are legible: no arrow paths crossing text, halo width appropriate for font size.
- **Diagrams complement prose, not replace it.** Every relationship a diagram conveys is also in the surrounding IDed prose; no content lives only in an SVG.
- **No JS framework runtimes.** Small inline `<script>` for active-section TOC tracking or anchor-permalink behavior is the only acceptable JS.
- **Each heading level** is visually distinct from others and from inline bold.
- **No template placeholders** (`{skill}`, `<value>`, `[plan title]`) leaked into output.
- **No process exhaust** callouts in the artifact.
