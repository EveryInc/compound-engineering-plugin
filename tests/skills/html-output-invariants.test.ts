import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

// html-rendering.md is the format-rendering reference for HTML output. It is
// byte-duplicated across ce-plan, ce-brainstorm, and ce-ideate (enforced by
// tests/compound-support-files.test.ts), so we test one copy and trust the
// drift check to cover the others. The assertions below pin failure-mode
// defenses observed across iterative dogfood — each rule prevents a named
// bad outcome.
const REFERENCE_PATH = path.join(
  process.cwd(),
  "skills/ce-plan/references/html-rendering.md",
)
const REFERENCE = readFileSync(REFERENCE_PATH, "utf8")

describe("html-rendering.md reference content invariants", () => {
  test("declares single-self-contained-file invariant", () => {
    expect(/single self-contained/i.test(REFERENCE)).toBe(true)
    expect(/No companion `\.css`|no companion files/i.test(REFERENCE)).toBe(true)
  })

  test("permits CDN webfonts only with a fallback stack", () => {
    expect(
      /CDN webfont/i.test(REFERENCE) && /fallback/i.test(REFERENCE),
      "Reference must permit CDN webfonts only with an offline-readable fallback font stack.",
    ).toBe(true)
  })

  test("forbids hidden machine-readable metadata copy (no JSON frontmatter)", () => {
    // Under exclusive output mode, metadata lives in visible text only.
    // A `<script type="application/json">` frontmatter block creates a
    // second source of truth that drifts. The earlier sibling-model design
    // had this; the new model drops it. The reference must explicitly
    // prohibit it.
    expect(
      /no hidden machine-readable copy|no `<script type="application\/json">`|single source of truth/i.test(REFERENCE),
      "Reference must forbid a hidden JSON frontmatter copy. Metadata is visible text only.",
    ).toBe(true)
  })

  test("explicitly forbids <meta name='created'/origin> tags duplicating visible header", () => {
    // 2026-05-17 supply-chain plan dogfood failure: agent emitted both
    // visible <dl>-shaped header metadata AND `<meta name="created">` /
    // `<meta name="origin">` in <head>. Two sources of truth drift. The
    // reference must name this specific form so the rule generalizes
    // beyond the script-frontmatter shape.
    expect(
      /<meta name="created"|<meta name="origin"|`<meta name=/i.test(REFERENCE),
      "Reference must name <meta name='...'> as a forbidden hidden-metadata form.",
    ).toBe(true)
  })

  test("stable IDs preserved as anchor IDs AND visible text", () => {
    expect(
      /Stable IDs as anchor IDs AND visible text|`id="r1"`.*visible text|visible text.*`id="r1"`/i.test(REFERENCE),
      "Reference must require stable IDs to appear as BOTH the element's id attribute AND visible text inside the element.",
    ).toBe(true)
  })

  test("ASCII identifiers required", () => {
    expect(/ASCII identifiers/i.test(REFERENCE)).toBe(true)
  })

  test("source / composition signal required", () => {
    expect(
      /Source.*composition signal|staleness signal|composition timestamp/i.test(REFERENCE),
      "Reference must require a source-and-composition signal (staleness footer).",
    ).toBe(true)
  })

  test("source / composition signal has a concrete example shape", () => {
    // 2026-05-17 supply-chain plan dogfood failure: the doc ended without
    // any staleness footer at all. The reference describes the rule but
    // didn't show the shape — agent skipped emitting it. A concrete example
    // in the invariant makes the rule actionable.
    expect(
      /<footer class="composition-signal"|Composed \d{4}-\d{2}-\d{2}|composition-signal/i.test(REFERENCE),
      "Reference must include an example shape for the source/composition footer so the agent knows what to emit.",
    ).toBe(true)
  })

  test("repeating cards with secondary content are collapsed by default", () => {
    // 2026-05-17 supply-chain plan dogfood failure: 8 Implementation Units
    // rendered fully expanded with no collapsibles. Reader can't see the
    // unit list at a glance.
    expect(
      /Repeating cards collapsed by default/i.test(REFERENCE) &&
        /three or\s+more item cards/i.test(REFERENCE) &&
        /no `open` attribute/.test(REFERENCE),
      "Reference must require default-closed <details> (no open attribute) for 3+ repeating cards with secondary content.",
    ).toBe(true)
  })

  test("within-section sub-nav for sections with 6+ repeating cards", () => {
    // 2026-05-17 supply-chain plan dogfood failure: Implementation Units
    // section had 8 units with no jump-list at the top. TOC's single
    // "Implementation Units" entry didn't help navigate within the section.
    expect(
      /Within-section sub-nav|sub-nav.*6\+ repeating cards|6\+ repeating cards/i.test(REFERENCE),
      "Reference must require a within-section sub-nav for sections with 6+ repeating cards.",
    ).toBe(true)
  })

  test("styling defers to the user's instructions, design skills, or DESIGN.md", () => {
    expect(/## Styling/.test(REFERENCE)).toBe(true)
    expect(/design skill/i.test(REFERENCE)).toBe(true)
    expect(/docs\/DESIGN\.md/.test(REFERENCE)).toBe(true)
    expect(/\.compound-engineering\/DESIGN\.md/.test(REFERENCE)).toBe(true)
  })

  test("DESIGN.md contributes identity, not scale", () => {
    // 2026-05-20: a real product DESIGN.md (every.to brand tokens) applied
    // literally gave a plan doc marketing-scale type and a product surface.
    expect(
      /identity, not its scale/i.test(REFERENCE),
      "Reference must state DESIGN.md contributes the brand's identity, not its scale.",
    ).toBe(true)
  })

  test("DESIGN.md scope-mismatch guard (product UI vs doc surface)", () => {
    // Specific failure mode: an agent reading a product-UI DESIGN.md may
    // naively lift the page-surface color (e.g., a marketing brand color)
    // and apply it as the plan-doc background.
    expect(
      /product-UI\s+surface color as the page background/i.test(REFERENCE),
      "Reference must forbid a product-UI surface color as the doc background.",
    ).toBe(true)
    expect(
      /extract\s+the\s+principle[\s\S]{0,100}(not|rather\s+than)\s+the\s+literal/i.test(REFERENCE),
      "Reference must instruct the agent to extract the principle, not (or rather than) the literal value, when a token is product-UI-scoped.",
    ).toBe(true)
  })

  test("DESIGN.md fonts: load only open webfonts, never attempt a proprietary brand face", () => {
    // 2026-06-09 pressure test across 6 real brand DESIGN.md files: 4 of the
    // signature faces (Airbnb Cereal, Coinbase Display/Sans, BMW Type,
    // Waldenburg) are proprietary and cannot load in a single-file doc. The
    // agent must NOT attempt them — only open webfonts load — and must fall
    // back to a family-matched system stack, honoring declared roles.
    expect(
      /Never attempt a\s+proprietary brand face/i.test(REFERENCE),
      "Reference must instruct: load only open webfonts, never attempt a proprietary brand face.",
    ).toBe(true)
    expect(
      /family-matched system stack|fallback chain/i.test(REFERENCE) &&
        /never promote a display/i.test(REFERENCE),
      "Reference must specify the family-matched fallback and the no-display-as-body rule.",
    ).toBe(true)
  })

  test("DESIGN.md skips decoration and keeps doc-scaled type", () => {
    // 2026-06-09 pressure test across 6 brand DESIGN.md files and the
    // 2026-05-20 every.to tokens (12-52px marketing scale): sizes and
    // decoration must not transfer to a reading doc.
    expect(
      /Skip decoration/i.test(REFERENCE),
      "Reference must instruct skipping decoration with nothing to attach to in a doc.",
    ).toBe(true)
    expect(
      /doc-scaled[\s\S]{0,80}(product UI|marketing)/i.test(REFERENCE),
      "Reference must keep reading sizes doc-scaled when DESIGN.md tokens are product- or marketing-scaled.",
    ).toBe(true)
  })

  test("markdown is content, not design", () => {
    expect(
      /Markdown input is content, not design/i.test(REFERENCE),
      "Reference must state that markdown source informs content, not presentation choices.",
    ).toBe(true)
  })

  test("prose is authoritative when visualization disagrees", () => {
    expect(
      /Prose is authoritative|prose governs/i.test(REFERENCE),
      "Reference must state that prose governs when a visualization disagrees with it.",
    ).toBe(true)
  })

  test("hyperlink the reference index (Sources & References)", () => {
    // 2026-05-20: a real nugget-demographics plan HTML rendered Sources &
    // References as bare <code> text — 9 file paths, 4 doc paths, 2 PRs, 1
    // Linear ticket, all unlinked. The HTML format's UX win is clickable
    // references; without linking, the section is worse than markdown.
    expect(
      /Hyperlink each entry in a Sources & References section/i.test(REFERENCE),
      "Reference must require hyperlinking entries in the Sources & References section.",
    ).toBe(true)
    expect(
      /git remote get-url origin/.test(REFERENCE),
      "Reference must name `git remote get-url origin` as the way to resolve the repo's GitHub URL at compose time.",
    ).toBe(true)
    expect(
      /blob\/main/.test(REFERENCE),
      "Reference must show the `<repo-url>/blob/main/<path>` URL shape for code/doc paths.",
    ).toBe(true)
    expect(
      /Do not invent URLs/.test(REFERENCE),
      "Reference must forbid URL invention when the resolution path is unclear.",
    ).toBe(true)
    expect(
      /Inline mentions in prose stay unlinked/i.test(REFERENCE),
      "Reference must scope the linking rule to the reference index, not inline prose mentions.",
    ).toBe(true)
  })

  test("text contrast is local (defends against muted-on-tinted washout)", () => {
    expect(/Text contrast is local/i.test(REFERENCE)).toBe(true)
    expect(
      /muted text[\s\S]{0,80}washes out on a\s+tinted card/i.test(REFERENCE),
      "Reference must name the specific failure mode (muted text on tinted fills washes out).",
    ).toBe(true)
  })

  test("prose holds a readable line length", () => {
    // #870: long-form prose rendered at full viewport width was unreadable on
    // wide monitors.
    expect(
      /Readable line length/i.test(REFERENCE) && /65-80 characters/.test(REFERENCE),
      "Reference must hold running prose to a readable measure (~65-80 characters).",
    ).toBe(true)
    expect(/wide window widths/i.test(REFERENCE)).toBe(true)
  })

  test("wide content scrolls in its own container at phone width", () => {
    // 2026-10-28 eval: plan tables without a scroll wrapper widened every
    // Claude-written plan to ~620-690px at a 420px viewport.
    expect(
      /scrolls\s+inside its own container instead of widening the page/i.test(REFERENCE),
      "Reference must keep wide tables, diagrams, and code from widening the page at phone width.",
    ).toBe(true)
  })

  test("directive fields render as a callout, not a metadata pair", () => {
    // #870: an Execution note rendered as a passive <dl> pair got skimmed past.
    expect(
      /Execution note[\s\S]{0,200}visible\s+callout/i.test(REFERENCE),
      "Reference must render directive fields (Execution note) as a callout.",
    ).toBe(true)
  })

  test("chips/pills uniform, no one-edge accent (2026-06-08 left-accent-pill defect)", () => {
    // A real ideation doc rendered the ID chip with a purple LEFT-EDGE accent
    // while the metric chips were uniform soft-tint pills — it read as broken
    // and asymmetric. The reference must forbid the one-sided accent and
    // require chips in a row to be a uniform set.
    expect(
      /no one-edge accent/i.test(REFERENCE) && /Chips in a row share one shape/i.test(REFERENCE),
      "Reference must carry a chips/pills rule forbidding one-sided accents.",
    ).toBe(true)
    expect(
      /colored stripe on one edge, which reads as broken/i.test(REFERENCE),
      "Reference must forbid a colored stripe on one edge (it reads as broken/asymmetric).",
    ).toBe(true)
  })

  test("no JS framework runtimes (but inline scripts permitted)", () => {
    expect(/No JS framework runtimes/i.test(REFERENCE)).toBe(true)
    expect(
      /small inline `<script>`[\s\S]{0,80}acceptable/i.test(REFERENCE),
      "Reference must clarify that small inline <script> for active-section tracking is acceptable.",
    ).toBe(true)
  })

  test("diagram labels stay clear of every stroke", () => {
    // 2026-05-12 cloak dogfood failure: arrows running through text labels.
    // 2026-06-08 layers-diagram dogfood failure: parallelogram EDGES ran
    // through labels and a label overflowed the skewed edge.
    expect(
      /Labels clear of strokes/i.test(REFERENCE) &&
        /passes\s+through a text label/i.test(REFERENCE),
      "Reference must forbid strokes from passing through text labels.",
    ).toBe(true)
    expect(
      /shape edge/i.test(REFERENCE) && /skewed or rotated\s+shape/i.test(REFERENCE),
      "Legibility rule must cover shape edges, including skewed or rotated shapes, not just arrows.",
    ).toBe(true)
  })

  test("differentiate diagram shapes by geometry first", () => {
    // 2026-05-13 cloak brainstorm dogfood failure: agent introduced a
    // `--surface-tint-2` luminance tier to distinguish decision diamonds
    // from rectangle boxes. Geometry already differentiates the role; the
    // extra tier was fragile under dark-mode extensions.
    expect(
      /Geometry before tint/i.test(REFERENCE),
      "Reference must state: differentiate shapes by geometry before tint.",
    ).toBe(true)
    expect(
      /extra neutral tint tiers/i.test(REFERENCE),
      "Reference must warn against inventing additional neutral-tint tiers when geometry already differentiates.",
    ).toBe(true)
  })

  test("plan diagrams are not directional sketches (no hedging caption)", () => {
    expect(
      /Plan diagrams carry no hedging caption/i.test(REFERENCE),
      "Reference must forbid hedging captions on plan diagrams (e.g., 'directional only, not implementation spec').",
    ).toBe(true)
  })

  test("wireframe mockups are scoped to requirements docs (brainstorm visual products)", () => {
    expect(
      /Wireframes are for UI-shaped requirements in requirements docs/i.test(REFERENCE),
      "Wireframe affordance must be scoped to UI-shaped requirements in requirements docs.",
    ).toBe(true)
    expect(
      /a wireframe, not a mockup/i.test(REFERENCE),
      "Wireframe affordance must state the wireframe-not-mockup fidelity ceiling.",
    ).toBe(true)
    expect(
      /Directional only/.test(REFERENCE),
      "Wireframe affordance must require a directional caption.",
    ).toBe(true)
    // Another-agent P2 (PR #972): brainstorm requirements output is now a
    // requirements-only unified plan under docs/plans/, so "not plan artifacts"
    // must mean implementation-ready plans (ce-plan output), NOT exclude the
    // requirements-only unified plan that ce-brainstorm writes — otherwise HTML
    // brainstorms for UI changes would suppress the intended wireframe.
    expect(
      /requirements-only unified plan/i.test(REFERENCE) &&
        /not an implementation-ready\s+plan/i.test(REFERENCE),
      "Wireframe scope must include the requirements-only unified plan and exclude only implementation-ready plans.",
    ).toBe(true)
  })

  test("agent-consumability rules guarantee downstream agents can read HTML", () => {
    // ce-work maps HTML plans by <h1>-<h3> headings and anchor ids;
    // ce-doc-review and resume edit HTML as source text.
    expect(/Agent-consumability rules/i.test(REFERENCE)).toBe(true)
    expect(/Use semantic elements/i.test(REFERENCE)).toBe(true)
    expect(/Field labels are visible text/i.test(REFERENCE)).toBe(true)
    expect(/`<h1>`\s+to `<h3>` headings and their anchor ids/.test(REFERENCE)).toBe(true)
  })

  test("section heading vocabulary matches section contract names", () => {
    // ce-work and ce-doc-review grep for section names (Implementation
    // Units, Requirements, etc.). If HTML re-titles them for editorial
    // narrative ("What the route guarantees" instead of "Requirements"),
    // downstream agents lose them. This rule defends against that.
    expect(
      /Section headings use the section-contract names/i.test(REFERENCE),
      "Reference must require HTML section headings match the section-contract names so downstream agents can find them.",
    ).toBe(true)
  })

  test("unified plan navigation region links the stable section anchors", () => {
    // U5: long unified HTML artifacts need load-bearing navigation. The
    // reference must require a visible nav region linking the stable section
    // anchors so downstream agents and readers can route without a full read.
    expect(
      /Unified plan navigation/i.test(REFERENCE),
      "Reference must require a visible navigation region for unified plan artifacts.",
    ).toBe(true)
    for (const anchor of [
      "goal-capsule",
      "product-contract",
      "planning-contract",
      "implementation-units",
      "verification-contract",
      "definition-of-done",
    ]) {
      expect(
        REFERENCE.includes(anchor),
        `Reference must name the stable section anchor "${anchor}" for unified-plan navigation.`,
      ).toBe(true)
    }
    // The launch prompt is skill-emitted and there is no Reader Index — neither is a doc section/anchor.
    expect(REFERENCE.includes("goal-launch-block")).toBe(false)
    expect(REFERENCE.includes("reader-index")).toBe(false)
  })

  test("requirements-only artifacts omit links to absent implementation sections", () => {
    // A requirements-only skeleton has no Planning Contract / Implementation
    // Units / Verification / DoD. The nav must not point readers at sections
    // that do not exist, which would make the skeleton look executable.
    expect(
      /Requirements-only artifacts omit links to absent implementation sections/i.test(REFERENCE),
      "Reference must require requirements-only nav to omit links to absent implementation sections.",
    ).toBe(true)
  })

  test("visible artifact metadata rendered, no hidden duplicate copy", () => {
    // HTML contract metadata stays visible rather than duplicated in JSON/data-*/<meta>
    // duplicate that drifts from the visible copy.
    expect(
      /Metadata is visible text, with one copy of each value/i.test(REFERENCE),
      "Reference must require visible artifact metadata in the HTML header.",
    ).toBe(true)
    for (const field of ["artifact_contract", "product_contract_source"]) {
      expect(
        REFERENCE.includes(field),
        `Reference must name the unified contract metadata field "${field}" to render visibly.`,
      ).toBe(true)
    }
    expect(
      /no hidden machine-readable copy/i.test(REFERENCE) && /`data-\*`/.test(REFERENCE),
      "Reference must forbid hiding a duplicate metadata copy in JSON, data-*, or <meta>.",
    ).toBe(true)
  })

  test("stable section anchor table maps unified sections to HTML ids", () => {
    expect(
      /Stable section anchors for unified plans/i.test(REFERENCE),
      "Reference must include the stable section anchor table for unified plans.",
    ).toBe(true)
    const tableStart = REFERENCE.indexOf("Stable section anchors for unified plans")
    const tableRegion = REFERENCE.slice(tableStart, tableStart + 1200)
    for (const anchor of [
      "goal-capsule",
      "product-contract",
    ]) {
      expect(
        tableRegion.includes(anchor),
        `Stable section anchor table must map "${anchor}".`,
      ).toBe(true)
    }
  })

  test("post-compose audit lists failure-mode checks", () => {
    expect(/Post-compose audit/i.test(REFERENCE)).toBe(true)
    const auditStart = REFERENCE.indexOf("## Post-compose audit")
    const auditRegion = REFERENCE.slice(auditStart)
    // Single-file invariant check
    expect(/One self-contained file/i.test(auditRegion)).toBe(true)
    expect(/No hidden metadata copy/i.test(auditRegion)).toBe(true)
    // No <meta> tag duplication check (2026-05-17 supply-chain plan failure)
    expect(/<meta name="created"|<meta name="origin"/i.test(auditRegion)).toBe(true)
    // Section heading vocabulary check
    expect(/Section headings match the section-contract names/i.test(auditRegion)).toBe(true)
    // Source / composition signal check (the visible-footer rule)
    expect(/composition footer is present/i.test(auditRegion)).toBe(true)
    expect(/Repeating cards with secondary content are collapsed/i.test(auditRegion)).toBe(true)
    expect(/no\s+`open` attribute/i.test(auditRegion)).toBe(true)
    expect(/6\+ cards have a sub-nav/i.test(auditRegion)).toBe(true)
    expect(/No one-edge colored accent/i.test(auditRegion)).toBe(true)
    expect(/readable line length/i.test(auditRegion)).toBe(true)
    expect(/diagram relationship and wireframe detail is also in the prose/i.test(auditRegion)).toBe(true)
    expect(/no stroke crosses a label/i.test(auditRegion)).toBe(true)
    expect(/No JS framework runtime, no invented reference URLs/i.test(auditRegion)).toBe(true)
  })
})
