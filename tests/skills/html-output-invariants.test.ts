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
  "plugins/compound-engineering/skills/ce-plan/references/html-rendering.md",
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

  test("stable IDs preserved as anchor IDs AND visible text", () => {
    expect(
      /Stable IDs as anchor IDs AND visible text|`id="r1"`.*visible text|visible text.*`id="r1"`/i.test(REFERENCE),
      "Reference must require stable IDs to appear as BOTH the element's id attribute AND visible text inside the element.",
    ).toBe(true)
  })

  test("editable status convention is visible text, not hidden attribute", () => {
    expect(
      /editable status|status flip|`active → completed`/i.test(REFERENCE),
      "Reference must describe how status is editable by downstream tooling.",
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

  test("no JS framework runtimes (but inline scripts permitted)", () => {
    expect(/No JS framework runtimes|no.*JS framework/i.test(REFERENCE)).toBe(true)
    expect(
      /small inline.*script.*acceptable|inline.*script.*permitted|active-section|IntersectionObserver/i.test(REFERENCE),
      "Reference must clarify that small inline <script> for active-section tracking is acceptable.",
    ).toBe(true)
  })

  test("layout-legibility halo rule with judgment-call framing", () => {
    // 2026-05-12 cloak dogfood failure: arrows running through text labels.
    // The halo rule defends against this. Halo width is principle-level
    // (judgment call), not a hardcoded px value, per the principle that
    // specific values drift.
    expect(
      /No arrow path passes through a text label|arrow.*crosses a text label|arrow.*through.*label/i.test(REFERENCE),
      "Reference must forbid arrow paths from passing through text labels.",
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

  test("post-compose audit lists failure-mode checks", () => {
    expect(/Post-compose audit/i.test(REFERENCE)).toBe(true)
    const auditStart = REFERENCE.indexOf("## Post-compose audit")
    const auditRegion = REFERENCE.slice(auditStart)
    // Single-file invariant check
    expect(/Single self-contained file/i.test(auditRegion)).toBe(true)
    // No hidden JSON frontmatter copy check
    expect(/No hidden machine-readable|`<script type="application\/json">`/i.test(auditRegion)).toBe(true)
    // Section heading vocabulary check
    expect(/[Ss]ection heading vocabulary/i.test(auditRegion)).toBe(true)
    // Body bold not colored check
    expect(/`<strong>`.*not colored|accent palette/i.test(auditRegion)).toBe(true)
    // Default-closed collapsibles check
    expect(/`<details>`.*no `open` attribute|`open` attribute/i.test(auditRegion)).toBe(true)
    // No JS framework runtimes check
    expect(/No JS framework runtimes/i.test(auditRegion)).toBe(true)
  })
})
