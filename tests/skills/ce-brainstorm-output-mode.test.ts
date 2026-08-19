import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"
import { load as parseYaml } from "js-yaml"

const SKILL_PATH = path.join(
  process.cwd(),
  "skills/ce-brainstorm/SKILL.md",
)
const SKILL_BODY = readFileSync(SKILL_PATH, "utf8")

const HANDOFF_PATH = path.join(
  process.cwd(),
  "skills/ce-brainstorm/references/handoff.md",
)
const HANDOFF_BODY = readFileSync(HANDOFF_PATH, "utf8")

const OUTPUT_MODE_BODY = readFileSync(
  path.join(process.cwd(), "skills/ce-brainstorm/references/output-mode.md"),
  "utf8",
)

const PLAN_WRITE_BODY = readFileSync(
  path.join(process.cwd(), "skills/ce-brainstorm/references/plan-write.md"),
  "utf8",
)

const HTML_OUTPUT_PATH = path.join(
  process.cwd(),
  "skills/ce-brainstorm/references/html-rendering.md",
)

// Mirror of the ce-plan output-mode tests. ce-brainstorm gains the same
// `output:html` / `output:md` argument with a parallel resolution path
// (config key `brainstorm_output` instead of `plan_output`) and the same
// pipeline-mode force-`md` rule. The HTML composition reference is duplicated
// byte-for-byte from ce-plan (enforced by tests/compound-support-files.test.ts).
// 2026-08-18: Phase 0.0's resolution steps moved out of SKILL.md into
// references/output-mode.md when the body was restructured under the Codex
// 8000-byte prompt budget. Those steps are an artifact/behavior invariant, not
// a window-deciding one -- Phase 0.0 is the first thing a run does and the body
// names the required read at that point -- so they are asserted against the file
// that now owns them. The two rules that must fire without any read (the mode is
// exclusive; pipeline forces md) stay pinned to the body further down.
describe("ce-brainstorm output:html mode", () => {
  test("argument-hint advertises output:html", () => {
    const frontmatterMatch = SKILL_BODY.match(/^---\n([\s\S]*?)\n---/)
    expect(frontmatterMatch).not.toBeNull()
    const frontmatter = parseYaml(frontmatterMatch![1]) as Record<string, unknown>
    const hint = frontmatter["argument-hint"]
    expect(
      typeof hint === "string" && hint.includes("output:html"),
      `ce-brainstorm argument-hint must mention 'output:html' so humans discover the flag. Current value: ${JSON.stringify(hint)}`,
    ).toBe(true)
  })

  test("references/output-mode.md carries the Output Mode resolution", () => {
    const phaseRegion = OUTPUT_MODE_BODY

    expect(
      /output:/.test(phaseRegion),
      "Phase 0.0 must name the `output:` argument prefix.",
    ).toBe(true)
    expect(
      /brainstorm_output/.test(phaseRegion),
      "Phase 0.0 must name the `brainstorm_output` config key (the ce-brainstorm parallel to ce-plan's `plan_output`).",
    ).toBe(true)
    expect(
      /pipeline|disable-model-invocation/i.test(phaseRegion),
      "Phase 0.0 must describe the pipeline-mode override that forces markdown.",
    ).toBe(true)
    expect(
      /literal[\s-]prefix|literal prefix/i.test(phaseRegion),
      "Phase 0.0 must state the literal-prefix token-parsing convention.",
    ).toBe(true)
    expect(
      /user-stated preference/i.test(phaseRegion) &&
        /overrides\*?\*? the config|more current than the rarely-edited config/i.test(phaseRegion) &&
        /do not open or search instruction files|already (present )?in your context/i.test(phaseRegion),
      "Phase 0.0 must include a user-stated-preference tier that overrides config and acts on context only (no instruction-file reads).",
    ).toBe(true)
    expect(
      /mode:/.test(phaseRegion) && /output:/.test(phaseRegion),
      "Phase 0.0 token-parsing convention must name both `mode:` and `output:` as literal-prefix flags.",
    ).toBe(true)
  })

  test("config matching rule ignores commented YAML lines (active-key principle)", () => {
    // Parity with ce-plan side. Same Codex review found that "contains
    // `brainstorm_output: md|html`" would match the commented examples in
    // the shipped config template. The fix is principle-level: require an
    // ACTIVE (non-commented) key.
    const phaseRegion = OUTPUT_MODE_BODY
    expect(
      /active.*non-commented|non-commented.*key|lines starting with `#`.*comments|ignore commented/i.test(phaseRegion),
      "Phase 0.0 config matching must require an ACTIVE (non-commented) `brainstorm_output:` key, not a raw-text 'contains' match.",
    ).toBe(true)
    expect(
      /# brainstorm_output: html|commented examples|shipped config template/i.test(phaseRegion),
      "Phase 0.0 must cite the specific failure mode (the shipped template's commented `# brainstorm_output: html` example) so the rationale survives future edits.",
    ).toBe(true)
    expect(
      /ordinary-key|next layer|config\.local\.yaml then `config\.yaml`/i.test(phaseRegion),
      "Phase 0.0 config step must cascade local then tracked before the skill default.",
    ).toBe(true)
  })

  test("unknown-value fallback note reflects final resolved mode, not a hardcoded md", () => {
    // Parity with ce-plan side. Hardcoding "defaulting to md" misleads users
    // when config has set HTML. The note must reflect the actual resolved
    // OUTPUT_FORMAT after all precedence steps complete.
    const phaseRegion = OUTPUT_MODE_BODY
    expect(
      /using <resolved_format>|reflect.*final.*mode|after final resolution|after steps 2-4|Do not hardcode `md`/i.test(phaseRegion),
      "Phase 0.0's unknown-value note must reflect the actual resolved OUTPUT_FORMAT after all precedence steps, not a hardcoded 'defaulting to md'.",
    ).toBe(true)
  })

  test("brainstorm-to-plan handoff does NOT auto-propagate output:", () => {
    // Asymmetric output is acceptable. ce-plan re-resolves its own
    // `plan_output` config independently. The SKILL.md should make this
    // explicit so users with mismatched config aren't surprised.
    const phaseRegion = OUTPUT_MODE_BODY
    expect(
      /does NOT auto-propagate|does not auto-propagate|re-resolves its own/i.test(phaseRegion),
      "ce-brainstorm SKILL.md must state that the output: preference does not auto-propagate to ce-plan on handoff (ce-plan re-resolves its own plan_output independently).",
    ).toBe(true)
  })

  test("Phase 3 points at brainstorm-sections.md + a rendering ref", () => {
    const phase3Start = SKILL_BODY.indexOf("| 3 write the plan")
    expect(phase3Start).toBeGreaterThan(-1)
    const phase3Region = SKILL_BODY.slice(phase3Start) + PLAN_WRITE_BODY
    expect(
      /references\/brainstorm-sections\.md|brainstorm-sections\.md/i.test(phase3Region),
      "Phase 3 must point at brainstorm-sections.md for the content contract.",
    ).toBe(true)
    expect(
      /markdown-rendering\.md|html-rendering\.md/i.test(phase3Region),
      "Phase 3 must point at the format-rendering refs (markdown-rendering.md OR html-rendering.md).",
    ).toBe(true)
  })

  test("handoff.md offers prototype on software menus and browser for HTML", () => {
    expect(
      /Open in browser/.test(HANDOFF_BODY),
      "handoff.md must include 'Open in browser' for HTML mode.",
    ).toBe(true)
    expect(
      /Prototype a remaining feel-question/.test(HANDOFF_BODY),
      "handoff.md must include the prototype offer.",
    ).toBe(true)
    expect(
      /Publish to Proof/.test(HANDOFF_BODY),
      "software brainstorm Phase 4 must omit Share to Proof.",
    ).toBe(false)
    expect(
      /OUTPUT_FORMAT=md|OUTPUT_FORMAT=html|exclusive output/i.test(HANDOFF_BODY),
      "handoff.md must state HTML-only browser rendering.",
    ).toBe(true)
  })

  test("no sibling logic — exclusive output mode is documented", () => {
    expect(
      /exclusive|md OR html|markdown OR HTML|never both/i.test(SKILL_BODY),
      "SKILL.md must state that output mode is exclusive — markdown OR HTML, never both.",
    ).toBe(true)
    expect(
      /OUTPUT_FORMAT_SOURCE/.test(SKILL_BODY),
      "SKILL.md must not reference OUTPUT_FORMAT_SOURCE — it existed only to support sibling-rerender logic.",
    ).toBe(false)
  })

  test("html-rendering.md reference exists at parallel path", () => {
    const body = readFileSync(HTML_OUTPUT_PATH, "utf8")
    expect(body.length).toBeGreaterThan(0)
    // Spot-check that the major sections we promise the agent are present.
    expect(/Hard invariants/i.test(body)).toBe(true)
    expect(/Precedence stack/i.test(body)).toBe(true)
    expect(/Active-recall/i.test(body)).toBe(true)
    expect(/Format principles/i.test(body)).toBe(true)
    expect(/Affordance idioms/i.test(body)).toBe(true)
    expect(/Agent-consumability rules/i.test(body)).toBe(true)
    expect(/Post-compose audit/i.test(body)).toBe(true)
  })
})
