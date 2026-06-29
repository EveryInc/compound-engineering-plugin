import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"
import { load as parseYaml } from "js-yaml"

const SKILL_DIR = path.join(
  process.cwd(),
  "skills/ce-ideate",
)
const SKILL_BODY = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8")
const POST_IDEATION_BODY = readFileSync(
  path.join(SKILL_DIR, "references/post-ideation-workflow.md"),
  "utf8",
)
const UNIVERSAL_BODY = readFileSync(
  path.join(SKILL_DIR, "references/universal-ideation.md"),
  "utf8",
)
const IDEATION_SECTIONS_BODY = readFileSync(
  path.join(SKILL_DIR, "references/ideation-sections.md"),
  "utf8",
)

// ce-ideate gains the same exclusive output-mode machinery as ce-plan and
// ce-brainstorm, but with the default INVERTED to `html` (config key
// `ideate_output`). Ideation docs are read mainly by humans choosing a
// direction, so a rich self-contained HTML file is the default. Two
// structural differences from the plan/brainstorm tests: (1) the deliverable
// is auto-written at Phase 4 (after generation), so the rendering ref is
// loaded at write time and the "points at sections + rendering ref" pointer
// lives in post-ideation-workflow.md §4.1, not SKILL.md Phase 0.0; (2) Proof
// is markdown-only, so the menu's share/iterate slot is format-keyed to
// "Open in browser" under html.
function phase00Region(): string {
  const start = SKILL_BODY.indexOf("#### 0.0")
  expect(start, "ce-ideate SKILL.md is missing the Phase 0.0 Output Mode section.").toBeGreaterThan(-1)
  const end = SKILL_BODY.indexOf("#### 0.1", start)
  return SKILL_BODY.slice(start, end > start ? end : start + 4500)
}

describe("ce-ideate output mode (html default)", () => {
  test("argument-hint advertises output:md (the override of the html default)", () => {
    const frontmatterMatch = SKILL_BODY.match(/^---\n([\s\S]*?)\n---/)
    expect(frontmatterMatch).not.toBeNull()
    const frontmatter = parseYaml(frontmatterMatch![1]) as Record<string, unknown>
    const hint = frontmatter["argument-hint"]
    expect(
      typeof hint === "string" && hint.includes("output:md"),
      `ce-ideate argument-hint must mention 'output:md' so humans discover the escape from the html default. Current value: ${JSON.stringify(hint)}`,
    ).toBe(true)
  })

  test("Phase 0.0 defaults to html, not md", () => {
    const region = phase00Region()
    expect(
      /OUTPUT_FORMAT=html|default \(`html`\)|defaults to \*\*`html`\*\*|default.*`html`/i.test(region),
      "Phase 0.0 must establish `html` as the default OUTPUT_FORMAT for ce-ideate.",
    ).toBe(true)
  })

  test("Phase 0.0 describes the resolution mechanics", () => {
    const region = phase00Region()
    expect(/output:/.test(region), "Phase 0.0 must name the `output:` argument prefix.").toBe(true)
    expect(
      /ideate_output/.test(region),
      "Phase 0.0 must name the `ideate_output` config key (the ce-ideate parallel to plan_output / brainstorm_output).",
    ).toBe(true)
    expect(
      /pipeline|disable-model-invocation/i.test(region),
      "Phase 0.0 must describe the pipeline-mode override that forces markdown.",
    ).toBe(true)
    expect(
      /literal[\s-]prefix|literal prefix/i.test(region),
      "Phase 0.0 must state the literal-prefix token-parsing convention.",
    ).toBe(true)
    expect(
      /user-stated preference/i.test(region) &&
        /overrides\*?\*? the config|more current than the rarely-edited config/i.test(region) &&
        /do not open or search instruction files|already (present )?in your context/i.test(region),
      "Phase 0.0 must include a user-stated-preference tier that overrides config and acts on context only (no instruction-file reads).",
    ).toBe(true)
    expect(
      /mode:/.test(region) && /output:/.test(region),
      "Phase 0.0 token-parsing convention must name both `mode:` and `output:` as literal-prefix flags.",
    ).toBe(true)
  })

  test("config matching rule ignores commented YAML lines (active-key principle)", () => {
    const region = phase00Region()
    expect(
      /active.*non-commented|non-commented.*key|lines starting with `#`.*comments|ignore commented/i.test(region),
      "Phase 0.0 config matching must require an ACTIVE (non-commented) `ideate_output:` key, not a raw-text 'contains' match.",
    ).toBe(true)
    expect(
      /# ideate_output: md|commented example|shipped config template/i.test(region),
      "Phase 0.0 must cite the shipped template's commented `# ideate_output:` example so the rationale survives future edits.",
    ).toBe(true)
  })

  test("unknown-value fallback note reflects final resolved mode, not a hardcoded format", () => {
    const region = phase00Region()
    expect(
      /using <resolved_format>|after steps 2-4|Do not hardcode a format/i.test(region),
      "Phase 0.0's unknown-value note must reflect the actual resolved OUTPUT_FORMAT, not a hardcoded format.",
    ).toBe(true)
  })

  test("Phase 0.0 defers loading the rendering reference (lazy at save time)", () => {
    const region = phase00Region()
    expect(
      /Defer loading|do NOT load|at save time/i.test(region),
      "Phase 0.0 must defer loading the rendering reference until write time — loading it at Phase 0.0 would carry it through the whole grounding + ideation dispatch for no benefit.",
    ).toBe(true)
  })

  test("ideate-to-brainstorm handoff does NOT auto-propagate output:", () => {
    const region = phase00Region()
    expect(
      /does NOT auto-propagate|does not auto-propagate|re-resolves its own/i.test(region),
      "Phase 0.0 must state that output: does not auto-propagate to ce-brainstorm on handoff (ce-brainstorm re-resolves its own brainstorm_output).",
    ).toBe(true)
  })

  test("exclusive output mode is documented; no sibling-rerender machinery", () => {
    expect(
      /exclusive|html OR md|markdown OR HTML|never both/i.test(SKILL_BODY),
      "SKILL.md must state that output mode is exclusive — html OR md, never both.",
    ).toBe(true)
    expect(
      /OUTPUT_FORMAT_SOURCE/.test(SKILL_BODY),
      "SKILL.md must not reference OUTPUT_FORMAT_SOURCE — it existed only to support sibling-rerender logic.",
    ).toBe(false)
  })

  test("resume handles both .md and .html and preserves the existing format", () => {
    const resumeStart = SKILL_BODY.indexOf("#### 0.1")
    const resumeRegion = SKILL_BODY.slice(resumeStart, resumeStart + 2500)
    expect(
      /\*\.html|`\*\.html`|\.html/i.test(resumeRegion),
      "Phase 0.1 resume must look for `.html` ideation docs in addition to `.md`.",
    ).toBe(true)
    expect(
      /existing file's format|existing format|format precedence/i.test(resumeRegion),
      "Phase 0.1 resume must preserve the existing artifact's format.",
    ).toBe(true)
  })

  test("§4.1 write step points at ideation-sections.md + a rendering ref (lazy pointer lives here, not Phase 0.0)", () => {
    const saveStart = POST_IDEATION_BODY.indexOf("### 4.1")
    expect(saveStart, "post-ideation-workflow.md is missing §4.1 Write the Deliverable.").toBeGreaterThan(-1)
    const saveRegion = POST_IDEATION_BODY.slice(saveStart, saveStart + 2500)
    expect(
      /ideation-sections\.md/i.test(saveRegion),
      "§4.1 must point at ideation-sections.md for the content contract.",
    ).toBe(true)
    expect(
      /markdown-rendering\.md|html-rendering\.md/i.test(saveRegion),
      "§4.1 must point at the format-rendering refs (markdown-rendering.md OR html-rendering.md).",
    ).toBe(true)
  })

  test("Phase 4 auto-writes the deliverable (not opt-in) and shows a concise summary", () => {
    expect(
      /automatically|not opt-in/i.test(POST_IDEATION_BODY),
      "Phase 4 must auto-write the deliverable rather than treating persistence as opt-in.",
    ).toBe(true)
    expect(
      /concise summary|not reproduce them in the session|one line per survivor/i.test(POST_IDEATION_BODY),
      "Phase 4 must present a concise summary in the session, not the full deliverable.",
    ).toBe(true)
    expect(
      /CE temp area|\/tmp\/compound-engineering|never the user's CWD|not.*current working directory/i.test(POST_IDEATION_BODY),
      "Phase 4 must write no-repo deliverables to the CE temp area, not the user's CWD.",
    ).toBe(true)
  })

  test("Phase 5 menu offers brainstorm-one and discuss-or-refine, and seeds brainstorm with substance not the whole file", () => {
    expect(/Brainstorm one idea/i.test(POST_IDEATION_BODY)).toBe(true)
    expect(/Discuss or refine the ideas first/i.test(POST_IDEATION_BODY)).toBe(true)
    expect(
      /not.*pass the whole file|do \*\*not\*\* pass the whole file/i.test(POST_IDEATION_BODY),
      "§5.2 must seed ce-brainstorm with the idea's substance, not the whole file.",
    ).toBe(true)
  })

  test("persistence menu is format-keyed (Open in browser for html, Proof for md)", () => {
    expect(
      /Open in browser/i.test(POST_IDEATION_BODY),
      "post-ideation-workflow.md must offer 'Open in browser' for html mode.",
    ).toBe(true)
    expect(
      /Publish to Proof/i.test(POST_IDEATION_BODY),
      "post-ideation-workflow.md must offer the Proof path for markdown mode.",
    ).toBe(true)
    expect(
      /format-keyed|OUTPUT_FORMAT=html|OUTPUT_FORMAT=md/i.test(POST_IDEATION_BODY),
      "post-ideation-workflow.md must state the format-keyed selection for the share/iterate slot.",
    ).toBe(true)
    expect(
      /markdown only|markdown-only|cannot ingest HTML/i.test(POST_IDEATION_BODY),
      "post-ideation-workflow.md must note Proof is markdown-only.",
    ).toBe(true)
  })

  test("universal (non-software) wrap-up menu is also format-keyed", () => {
    expect(
      /Open in browser/i.test(UNIVERSAL_BODY) && /OUTPUT_FORMAT/i.test(UNIVERSAL_BODY),
      "universal-ideation.md wrap-up menu must be format-keyed (local HTML file by default, Proof only under md).",
    ).toBe(true)
  })

  test("section contract and rendering refs exist at parallel paths", () => {
    expect(/Ranked Ideas/i.test(IDEATION_SECTIONS_BODY)).toBe(true)
    expect(/Rejection Summary/i.test(IDEATION_SECTIONS_BODY)).toBe(true)
    // Ideation docs intentionally carry NO status field (no doc-level lifecycle,
    // no per-idea "explored" marker) — mutable workflow state doesn't belong in
    // a point-in-time discovery artifact. Lock that decision in.
    expect(/no status field/i.test(IDEATION_SECTIONS_BODY)).toBe(true)

    // The rendering refs' content parity is owned by compound-support-files.test.ts
    // (byte-identical to ce-plan) and their invariants by html-output-invariants.test.ts;
    // here we only confirm ce-ideate ships both copies.
    expect(readFileSync(path.join(SKILL_DIR, "references/html-rendering.md"), "utf8").length).toBeGreaterThan(0)
    expect(readFileSync(path.join(SKILL_DIR, "references/markdown-rendering.md"), "utf8").length).toBeGreaterThan(0)
  })
})
