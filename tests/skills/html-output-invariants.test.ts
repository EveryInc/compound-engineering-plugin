import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

// html-rendering.md is the format-rendering reference for HTML output. It is
// byte-duplicated between ce-plan and ce-brainstorm (enforced by
// tests/compound-support-files.test.ts), so we test one copy and trust the
// drift check to cover the other. The assertions below pin failure-mode
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

  test("repeating cards with 3+ instances use default-closed <details>", () => {
    // 2026-05-17 supply-chain plan dogfood failure: 8 Implementation Units
    // rendered fully expanded with no collapsibles. Reader can't see the
    // unit list at a glance. The reference promotes default-closed <details>
    // for repeating cards from a soft anatomy pattern to a load-bearing rule
    // with a count threshold so the rule has a concrete trigger.
    expect(
      /3\+ units the default-closed rule is load-bearing|3\+ instances put secondary content inside default-closed|default-closed.*load-bearing/i.test(REFERENCE),
      "Reference must require default-closed <details> for repeating cards at 3+ instances.",
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

  test("states the precedence stack for style preferences", () => {
    expect(/Precedence stack/i.test(REFERENCE)).toBe(true)
    expect(/conversation/i.test(REFERENCE)).toBe(true)
    expect(/preferred stylesheet|stylesheet reference/i.test(REFERENCE)).toBe(true)
    expect(/DESIGN\.md/.test(REFERENCE)).toBe(true)
    expect(/fallback/i.test(REFERENCE)).toBe(true)
  })

  test("active-recall instruction at compose time", () => {
    expect(/Active-recall/i.test(REFERENCE)).toBe(true)
  })

  test("DESIGN.md discovery paths in worktree-root order", () => {
    expect(/DESIGN\.md discovery/i.test(REFERENCE)).toBe(true)
    expect(/worktree root|git rev-parse --show-toplevel/i.test(REFERENCE)).toBe(true)
    expect(/docs\/DESIGN\.md/.test(REFERENCE)).toBe(true)
    expect(/\.compound-engineering\/DESIGN\.md/.test(REFERENCE)).toBe(true)
  })

  test("DESIGN.md is a partial override (use what fits, skip the rest)", () => {
    // 2026-05-20: reviewing a real product DESIGN.md (every.to brand tokens)
    // surfaced three failure modes the binary present/absent rule didn't
    // cover: scope mismatch (product-UI surface colors applied to docs),
    // partial coverage (DESIGN.md defines some categories but not others),
    // and unfetchable named fonts (brand fonts without a CDN source). The
    // reference must teach the agent to apply what fits and skip what
    // doesn't.
    expect(
      /partial override|use what fits|not all-or-nothing/i.test(REFERENCE),
      "Reference must state DESIGN.md is a partial override, not all-or-nothing.",
    ).toBe(true)
  })

  test("DESIGN.md scope-mismatch guard (product UI vs doc surface)", () => {
    // Specific failure mode: an agent reading a product-UI DESIGN.md may
    // naively lift the page-surface color (e.g., a marketing brand color)
    // and apply it as the plan-doc background. The reference must name
    // this case and instruct the agent to extract the principle, not the
    // literal value, when the token is product-UI-scoped.
    expect(
      /Scope mismatch|product UI vs doc surface|product-UI-scoped/i.test(REFERENCE),
      "Reference must call out the product-UI vs doc-surface scope mismatch.",
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
      /load only open webfonts|never attempt a proprietary|do not\s+attempt to load it/i.test(REFERENCE),
      "Reference must instruct: load only open webfonts, never attempt a proprietary brand face.",
    ).toBe(true)
    expect(
      /family-matched system stack|fallback chain/i.test(REFERENCE) &&
        /never promote a display/i.test(REFERENCE),
      "Reference must specify the family-matched fallback and the no-display-as-body rule.",
    ).toBe(true)
  })

  test("DESIGN.md take-literal vs own-the-scale vs skip-decoration model", () => {
    // The governing split surfaced by the 2026-06-09 pressure test: take
    // scale-independent identity (color, weight, OpenType, radius character)
    // literally; own scale-dependent layout (type size, spacing) yourself —
    // DESIGN.md sizes are marketing-scaled; skip decoration with no content.
    expect(
      /scale-independent identity|own the scale-dependent|own it yourself/i.test(REFERENCE),
      "Reference must state the take-scale-independent / own-scale-dependent split.",
    ).toBe(true)
    expect(
      /skip decoration|gradient orbs|atmospheric brand voltage|no content to attach/i.test(REFERENCE),
      "Reference must instruct skipping decorative/atmospheric brand voltage with no content to attach in a doc.",
    ).toBe(true)
  })

  test("DESIGN.md typography-scale mismatch (product UI sizes vs doc-reading sizes)", () => {
    // 2026-05-20: a real Dembrandt-extracted DESIGN.md (every.to) contained
    // 53 typography tokens sized 12-52px — marketing-page scale. A naive
    // agent could pick text-1 (52px Signifier) for headings and text-19
    // (20px) for body, producing a comically large plan doc. The reference
    // must teach the agent to use DESIGN.md's family/weight/feature
    // assignments while picking its own doc-scaled sizes.
    expect(
      /Typography-scale mismatch|size scale.*product.*scaled|sized for product UI|product-scaled/i.test(REFERENCE),
      "Reference must call out the typography-scale mismatch between product-UI DESIGN.md tokens and doc-reading sizes.",
    ).toBe(true)
    expect(
      /family[\s\S]{0,40}weight[\s\S]{0,40}(OpenType|feature)/i.test(REFERENCE),
      "Reference must name family/weight/feature as the assignments that transfer from DESIGN.md typography.",
    ).toBe(true)
    expect(
      /agent's own[\s\S]{0,40}size scale|own size scale.*doc|doc-scaled/i.test(REFERENCE),
      "Reference must instruct the agent to pick its own size scale for the doc surface when DESIGN.md tokens are product-scaled.",
    ).toBe(true)
  })

  test("markdown is content, not design", () => {
    expect(
      /Markdown source is content, not design|source of content, not a source of design|do NOT treat its bullet|re-choose the rendering/i.test(REFERENCE),
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
      /Hyperlink the reference index|reference index.*hyperlink|hyperlink each entry/i.test(REFERENCE),
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
      /Do not invent URLs|broken or guessed link is worse than no link/i.test(REFERENCE),
      "Reference must forbid URL invention when the resolution path is unclear.",
    ).toBe(true)
    expect(
      /reference index only|not inline prose|Scope:[\s\S]{0,40}reference index/i.test(REFERENCE),
      "Reference must scope the linking rule to the reference index, not inline prose mentions.",
    ).toBe(true)
  })

  test("text contrast is local (defends against muted-on-tinted washout)", () => {
    expect(
      /Text contrast is local|contrast.*local|text-on-background pairing/i.test(REFERENCE),
      "Reference must state the local-contrast principle (test colors against the fill they sit on, not the page bg).",
    ).toBe(true)
    expect(
      /muted.*tinted|hue contrast|washed[ -]out/i.test(REFERENCE),
      "Reference must name the specific failure mode (muted text on tinted fills produces washed-out look).",
    ).toBe(true)
  })

  test("body <strong> not colored by default", () => {
    expect(
      /Reserve accent.*Do NOT color `<strong>`|Do NOT color `<strong>`.*by default|color: inherit/i.test(REFERENCE),
      "Reference must instruct the agent NOT to color <strong> body text by default.",
    ).toBe(true)
  })

  test("chips/pills uniform, no one-edge accent (2026-06-08 left-accent-pill defect)", () => {
    // A real ideation doc rendered the ID chip with a purple LEFT-EDGE accent
    // while the metric chips were uniform soft-tint pills — it read as broken
    // and asymmetric. The reference must forbid the one-sided accent and
    // require chips in a row to be a uniform set.
    expect(
      /Chips and pills|uniform shape, no one-sided accent|no one-edge colored accent/i.test(REFERENCE),
      "Reference must carry a chips/pills rule forbidding one-sided accents.",
    ).toBe(true)
    expect(
      /colored stripe on one edge|reads as broken/i.test(REFERENCE),
      "Reference must forbid a colored stripe on one edge (it reads as broken/asymmetric).",
    ).toBe(true)
  })

  test("no JS framework runtimes (but inline scripts permitted)", () => {
    expect(/No JS framework runtimes|no.*JS framework/i.test(REFERENCE)).toBe(true)
    expect(
      /small inline.*script.*acceptable|inline.*script.*permitted|active-section|IntersectionObserver/i.test(REFERENCE),
      "Reference must clarify that small inline <script> for active-section tracking is acceptable.",
    ).toBe(true)
  })

  test("layout-legibility halo rule with judgment-call framing", () => {
    // 2026-05-12 cloak dogfood failure: arrows running through text labels.
    // 2026-06-08 layers-diagram dogfood failure: shape EDGES (parallelogram
    // borders) running through labels. The rule is generalized to any stroke
    // — arrow or shape edge. Halo width stays principle-level (judgment call),
    // not a hardcoded px value, per the principle that specific values drift.
    expect(
      /passes through a text\s+label|crosses a text label/i.test(REFERENCE),
      "Reference must forbid strokes (arrows or shape edges) from passing through text labels.",
    ).toBe(true)
    expect(
      /paint-order: stroke fill|halo.*label|stroke.*matching the diagram background/i.test(REFERENCE),
      "Reference must name the paint-order halo technique.",
    ).toBe(true)
    expect(
      /halo width is a judgment call|narrow enough not to bleed.*wide enough to mask|halo.*judgment/i.test(REFERENCE),
      "Reference must frame halo width as a judgment call, not a fixed number.",
    ).toBe(true)
  })

  test("legibility covers shape edges and skewed-shape label inset (2026-06-08 layers bug)", () => {
    // The layers-panel diagram drew parallelogram borders through the
    // "shapes"/"background" labels and let "background" overflow the skewed
    // left edge. Two rules now defend against it.
    expect(
      /shape edge|edge\/border|border of a box/i.test(REFERENCE),
      "Legibility rule must generalize stroke-through-label to shape edges/borders, not just arrows.",
    ).toBe(true)
    expect(
      /skewed or rotated shapes|true interior|spills past the slanted edge|stacked-layers idiom/i.test(REFERENCE),
      "Legibility section must require labels inside skewed/rotated shapes to sit in the shape's true interior (covers the stacked-layers idiom).",
    ).toBe(true)
  })

  test("differentiate diagram shapes by geometry first", () => {
    // 2026-05-13 cloak brainstorm dogfood failure: agent introduced a
    // `--surface-tint-2` luminance tier to distinguish decision diamonds
    // from rectangle boxes. Geometry already differentiates the role; the
    // extra tier was fragile under dark-mode extensions.
    expect(
      /Differentiate diagram shapes by geometry first|geometry first.*fill semantics second|geometry.*role unambiguously/i.test(REFERENCE),
      "Reference must state: differentiate shapes by geometry first, by fill semantics second.",
    ).toBe(true)
    expect(
      /Resist[\s\S]{0,40}additional neutral-tint|additional luminance tier adds no information|sub-tier|tint tier/i.test(REFERENCE),
      "Reference must warn against inventing additional neutral-tint tiers when geometry already differentiates.",
    ).toBe(true)
  })

  test("plan diagrams are not directional sketches (no hedging caption)", () => {
    expect(
      /Plan architecture diagrams are not directional sketches|plan architecture diagrams render the same authoritative content|do not add hedging captions/i.test(REFERENCE),
      "Reference must forbid hedging captions on plan diagrams (e.g., 'directional only, not implementation spec').",
    ).toBe(true)
  })

  test("wireframe mockups are scoped to requirements docs (brainstorm visual products)", () => {
    expect(/Wireframe mockups/i.test(REFERENCE)).toBe(true)
    expect(
      /requirements doc|brainstorm|user-facing visual surface/i.test(REFERENCE),
      "Wireframe affordance must be scoped to brainstorm requirements docs describing visual surfaces.",
    ).toBe(true)
    expect(
      /Fidelity ceiling.*wireframe, not mockup|wireframe, not mockup/i.test(REFERENCE),
      "Wireframe affordance must state the wireframe-not-mockup fidelity ceiling.",
    ).toBe(true)
    expect(
      /Mandatory directional caption|directional.*not the spec|Directional only/i.test(REFERENCE),
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
    expect(/Agent-consumability rules/i.test(REFERENCE)).toBe(true)
    expect(/semantic HTML|<article>|<dl>|<section>/i.test(REFERENCE)).toBe(true)
    expect(/visible text|stable structure/i.test(REFERENCE)).toBe(true)
  })

  test("section heading vocabulary matches section contract names", () => {
    // ce-work and ce-doc-review grep for section names (Implementation
    // Units, Requirements, etc.). If HTML re-titles them for editorial
    // narrative ("What the route guarantees" instead of "Requirements"),
    // downstream agents lose them. This rule defends against that.
    expect(
      /section heading vocabulary|section contract names|downstream agents grep/i.test(REFERENCE),
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
      /Requirements-only artifacts omit links to absent|omit links to absent implementation sections/i.test(
        REFERENCE,
      ),
      "Reference must require requirements-only nav to omit links to absent implementation sections.",
    ).toBe(true)
  })

  test("visible readiness metadata rendered, no hidden duplicate copy", () => {
    // U5: HTML must carry artifact_readiness (and the rest of the contract
    // metadata) as VISIBLE header text, never as a hidden JSON/data-*/<meta>
    // duplicate that drifts from the visible copy.
    expect(
      /Visible readiness metadata/i.test(REFERENCE),
      "Reference must require visible readiness metadata in the HTML header.",
    ).toBe(true)
    for (const field of ["artifact_readiness", "artifact_contract", "product_contract_source"]) {
      expect(
        REFERENCE.includes(field),
        `Reference must name the unified contract metadata field "${field}" to render visibly.`,
      ).toBe(true)
    }
    expect(
      /Do not hide a duplicate copy in[\s\S]{0,40}JSON|`data-\*`|`<meta>`/i.test(REFERENCE),
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
    expect(/Single self-contained file/i.test(auditRegion)).toBe(true)
    // No hidden JSON frontmatter copy check
    expect(/No hidden machine-readable|`<script type="application\/json">`/i.test(auditRegion)).toBe(true)
    // No <meta> tag duplication check (2026-05-17 supply-chain plan failure)
    expect(/<meta name="created"|<meta name="origin"/i.test(auditRegion)).toBe(true)
    // Section heading vocabulary check
    expect(/[Ss]ection heading vocabulary/i.test(auditRegion)).toBe(true)
    // Source / composition signal check (the visible-footer rule)
    expect(/Source \/ composition signal|composition signal.*present|visible footer/i.test(auditRegion)).toBe(true)
    // Default-closed collapsibles for 3+ repeating cards check
    expect(/3\+ instances.*default-closed|repeating cards.*3\+ instances/i.test(auditRegion)).toBe(true)
    // Within-section sub-nav for 6+ cards check
    expect(/[Ww]ithin-section sub-nav|6\+ repeating cards/i.test(auditRegion)).toBe(true)
    // Body bold not colored check
    expect(/`<strong>`.*not colored|accent palette/i.test(auditRegion)).toBe(true)
    // Default-closed collapsibles check (`open` attribute absent)
    expect(/`<details>`.*no `open` attribute|`open` attribute/i.test(auditRegion)).toBe(true)
    // No JS framework runtimes check
    expect(/No JS framework runtimes/i.test(auditRegion)).toBe(true)
  })
})
