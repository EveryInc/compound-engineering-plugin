import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"
import { load as parseYaml } from "js-yaml"

const SKILL_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-plan/SKILL.md",
)
const SKILL_BODY = readFileSync(SKILL_PATH, "utf8")

const HTML_RENDERING_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-plan/references/html-rendering.md",
)

const PLAN_SECTIONS_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-plan/references/plan-sections.md",
)

// Regression guard for the `output:html` / `output:md` argument on ce-plan.
// Under exclusive output mode, the plan is written as EITHER markdown OR
// HTML — never both. The skill body must carry the load-bearing surface:
// the argument-hint advertises the flag, the resolution prose is inline
// (not deferred to a reference), and the pipeline-mode override guarantees
// automated downstream consumers always get markdown.
describe("ce-plan output:html mode", () => {
  test("argument-hint advertises output:html", () => {
    // argument-hint is in the frontmatter. Extract and parse to confirm
    // the token is visible to humans discovering the flag, not just buried
    // in skill prose.
    const frontmatterMatch = SKILL_BODY.match(/^---\n([\s\S]*?)\n---/)
    expect(frontmatterMatch).not.toBeNull()
    const frontmatter = parseYaml(frontmatterMatch![1]) as Record<string, unknown>
    const hint = frontmatter["argument-hint"]
    expect(
      typeof hint === "string" && hint.includes("output:html"),
      `ce-plan argument-hint must mention 'output:html' so humans discover the flag. Current value: ${JSON.stringify(hint)}`,
    ).toBe(true)
  })

  test("SKILL.md describes the Output Mode resolution inline (not solely in a reference)", () => {
    // The resolution is load-bearing — it determines whether HTML emits at all.
    // Per the AGENTS.md skill design principle ("SKILL.md content caches at
    // session start; references load on demand"), load-bearing rules must live
    // inline. References can describe the HTML composition mechanics, but the
    // arg/config/default precedence and pipeline override must be reachable
    // from the cached skill body.
    expect(
      /Output Mode|OUTPUT_FORMAT/i.test(SKILL_BODY),
      "SKILL.md must contain an Output Mode resolution section that establishes OUTPUT_FORMAT before downstream phases reference it.",
    ).toBe(true)

    // Precedence must be stated: CLI arg > config > default, with a pipeline
    // override. All three signals must be named so an agent reading the file
    // resolves correctly without consulting a reference.
    const phaseStart = SKILL_BODY.indexOf("#### 0.0")
    expect(
      phaseStart,
      "ce-plan SKILL.md no longer contains the Phase 0.0 anchor — Output Mode resolution was removed or moved without updating the test.",
    ).toBeGreaterThan(-1)
    const phaseRegion = SKILL_BODY.slice(phaseStart, phaseStart + 4500)

    expect(
      /output:/.test(phaseRegion),
      "Phase 0.0 must name the `output:` argument prefix.",
    ).toBe(true)
    expect(
      /plan_output/.test(phaseRegion),
      "Phase 0.0 must name the `plan_output` config key.",
    ).toBe(true)
    expect(
      /pipeline|disable-model-invocation/i.test(phaseRegion),
      "Phase 0.0 must describe the pipeline-mode override that forces markdown.",
    ).toBe(true)
    expect(
      /literal[\s-]prefix|literal prefix/i.test(phaseRegion),
      "Phase 0.0 must state the literal-prefix token-parsing convention so `feat:`/`fix:`/`chore:` in feature descriptions pass through verbatim.",
    ).toBe(true)
  })

  test("token-parsing convention names both mode: and output: as flag prefixes", () => {
    // The convention is shared across `mode:`, `output:`, and any future
    // flag-token. Both names must appear together in the parsing prose so a
    // future implementer doesn't generalize to "any <word>:<word> token" and
    // accidentally consume conventional commit prefixes.
    const phaseStart = SKILL_BODY.indexOf("#### 0.0")
    const phaseRegion = SKILL_BODY.slice(phaseStart, phaseStart + 4500)
    expect(
      /mode:/.test(phaseRegion) && /output:/.test(phaseRegion),
      "Phase 0.0 token-parsing convention must name both `mode:` and `output:` as literal-prefix flags so the rule generalizes correctly.",
    ).toBe(true)
  })

  test("config matching rule ignores commented YAML lines (active-key principle)", () => {
    // Codex review (2026-05-13, thread PRRT_kwDOP_gZVc6B6OgB) flagged that the
    // prior phrasing — "contains `plan_output: md|html`" — would match the
    // commented examples shipped in the config template (`# plan_output: html`),
    // silently forcing every user into HTML mode. The fix is principle-level:
    // require an ACTIVE (non-commented) key, and name the failure mode so a
    // future maintainer doesn't loosen it back. We check the principle is
    // present, not a specific phrasing.
    const phaseStart = SKILL_BODY.indexOf("#### 0.0")
    const phaseRegion = SKILL_BODY.slice(phaseStart, phaseStart + 4500)
    expect(
      /active.*non-commented|non-commented.*key|lines starting with `#`.*comments|ignore commented/i.test(phaseRegion),
      "Phase 0.0 config matching must require an ACTIVE (non-commented) `plan_output:` key, not a raw-text 'contains' match. Without this, the shipped config template's commented examples would silently force HTML mode.",
    ).toBe(true)
    expect(
      /# plan_output: html|commented examples|shipped config template/i.test(phaseRegion),
      "Phase 0.0 must cite the specific failure mode (the shipped template's commented `# plan_output: html` example) so the rationale survives future edits.",
    ).toBe(true)
  })

  test("unknown-value fallback note reflects final resolved mode, not a hardcoded md", () => {
    // Codex review (2026-05-13, thread PRRT_kwDOP_gZVc6B-LIW) flagged that
    // hardcoding "defaulting to md" in the unknown-value note is wrong when
    // step 2 (config) or step 4 (pipeline override) resolves to a different
    // value. The note must reflect the actual final value, not anticipate one.
    const phaseStart = SKILL_BODY.indexOf("#### 0.0")
    const phaseRegion = SKILL_BODY.slice(phaseStart, phaseStart + 4500)
    expect(
      /using <resolved_format>|reflect.*final.*mode|after final resolution|after steps 2-4|Do not hardcode `md`/i.test(phaseRegion),
      "Phase 0.0's unknown-value note must reflect the actual resolved OUTPUT_FORMAT after all precedence steps, not a hardcoded 'defaulting to md' that misleads users when config has set HTML.",
    ).toBe(true)
  })

  test("Phase 5.2 names the HTML/ce-doc-review timing relationship", () => {
    // Composition timing rule: Phase 5.2 must surface the relationship between
    // HTML emission and ce-doc-review so an agent doesn't ship a pre-review
    // artifact without understanding the gap. ce-doc-review's mutation mechanics
    // are markdown-only today (its walkthrough applies single-file markdown
    // edits and the open-questions flow inserts `##`/`###` headings), so HTML
    // plans skip the 5.3.8 doc-review pass entirely — see plan-handoff.md format
    // gate. Phase 5.2 must reference that gap inline at the write phase, either
    // by naming the format gate, calling out that ce-doc-review is skipped on
    // HTML, or otherwise tying the two phases together so the agent knows what
    // the first HTML emission does and does not reflect.
    const phase52Start = SKILL_BODY.indexOf("#### 5.2 Write Plan File")
    expect(phase52Start).toBeGreaterThan(-1)
    const phase52Region = SKILL_BODY.slice(phase52Start, phase52Start + 2000)
    expect(
      /skipped in HTML|markdown-only|format gate|Phase 5\.3\.8|safe_auto|after.*ce-doc-review/i.test(
        phase52Region,
      ),
      "Phase 5.2 must surface the HTML/ce-doc-review relationship inline — either naming the 5.3.8 format gate that skips ce-doc-review on HTML, or stating that ce-doc-review is markdown-only today, so an agent composing the HTML knows what the artifact does and does not reflect.",
    ).toBe(true)
  })

  test("Phase 0.0 points at format-rendering refs based on resolved value", () => {
    const phaseStart = SKILL_BODY.indexOf("#### 0.0")
    const phaseRegion = SKILL_BODY.slice(phaseStart, phaseStart + 4500)
    expect(
      /references\/markdown-rendering\.md|markdown-rendering\.md/i.test(phaseRegion),
      "Phase 0.0 must point at markdown-rendering.md for md output mode.",
    ).toBe(true)
    expect(
      /references\/html-rendering\.md|html-rendering\.md/i.test(phaseRegion),
      "Phase 0.0 must point at html-rendering.md for html output mode.",
    ).toBe(true)
  })

  test("post-generation menu offers format-keyed option 4 (Proof for md, browser for html)", () => {
    // Under exclusive output mode, the plan is exactly one artifact — either
    // .md or .html. The menu's option 4 is format-keyed: Proof for md (Proof
    // operates on markdown), browser for html. The legacy mutual-exclusion
    // gate with sibling-rerender logic is gone.
    const phaseStart = SKILL_BODY.indexOf("##### 5.3.8")
    expect(phaseStart).toBeGreaterThan(-1)
    const phaseRegion = SKILL_BODY.slice(phaseStart)

    expect(
      /Open in browser/.test(phaseRegion),
      "SKILL.md Phase 5.4 menu must include 'Open in browser' option for HTML mode.",
    ).toBe(true)
    expect(
      /Open in Proof/.test(phaseRegion),
      "SKILL.md Phase 5.4 menu must include 'Open in Proof' option for markdown mode.",
    ).toBe(true)
    expect(
      /OUTPUT_FORMAT=md|OUTPUT_FORMAT=html|format-keyed/i.test(phaseRegion),
      "SKILL.md must state the format-keyed rendering rule for option 4.",
    ).toBe(true)
  })

  test("no sibling logic — exclusive output mode is documented", () => {
    // Defends against drift back to the old sibling model. The skill must
    // state exclusivity ("md OR html, never both") so a future maintainer
    // doesn't re-introduce sibling generation.
    expect(
      /exclusive|md OR html|markdown OR HTML|never both/i.test(SKILL_BODY),
      "SKILL.md must state that output mode is exclusive — markdown OR HTML, never both. Defends against re-introducing the sibling model.",
    ).toBe(true)
    // OUTPUT_FORMAT_SOURCE was used by the sibling tracking; it should not
    // re-appear.
    expect(
      /OUTPUT_FORMAT_SOURCE/.test(SKILL_BODY),
      "SKILL.md must not reference OUTPUT_FORMAT_SOURCE — the source-tracking variable existed only to support sibling-rerender logic which is removed under exclusive output mode.",
    ).toBe(false)
  })

  test("plan-sections.md enumerates the required plan metadata fields by name", () => {
    // PR #826 split the prescriptive plan-template.md into a section contract
    // (plan-sections.md) + format-rendering refs. markdown-rendering.md now
    // says "Per-skill frontmatter fields are defined in each skill's section
    // contract" — so plan-sections.md MUST actually list them or downstream
    // tooling that keys on these field names (Phase 0.1 resume fast path on
    // `status: active`, ce-work's active→completed flip, deepening's
    // `deepened: YYYY-MM-DD`, HITL Proof's `origin:` traceback) breaks
    // silently when agents compose plans from the new refs.
    const body = readFileSync(PLAN_SECTIONS_PATH, "utf8")

    // Required field names that downstream consumers depend on.
    for (const field of ["title", "type", "status", "date"]) {
      expect(
        new RegExp(`\\b${field}\\b`).test(body),
        `plan-sections.md must name the required '${field}' metadata field — downstream tooling keys on it.`,
      ).toBe(true)
    }

    // Optional but well-known fields whose names are load-bearing for
    // resume/traceback flows.
    for (const field of ["origin", "deepened"]) {
      expect(
        new RegExp(`\\b${field}\\b`).test(body),
        `plan-sections.md must name the optional '${field}' metadata field — its presence and exact name are load-bearing for downstream flows.`,
      ).toBe(true)
    }

    // The contract must explicitly state that status flips active → completed
    // so the field's mutability isn't lost when an agent reads the contract
    // without the markdown-rendering reference.
    expect(
      /active.*completed|completed.*active/i.test(body),
      "plan-sections.md must state the status field's active → completed transition so the mutability semantics survive on their own.",
    ).toBe(true)
  })

  test("html-rendering.md reference exists and is loadable", () => {
    const body = readFileSync(HTML_RENDERING_PATH, "utf8")
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
