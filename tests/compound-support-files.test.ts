import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"
import { load } from "js-yaml"

const PLUGIN_ROOT = path.join(process.cwd(), "skills")

/** Canonical copies live in ce-compound; mirrors must stay identical. */
const SHARED_SUPPORT_FILES = [
  "references/schema.yaml",
  "references/yaml-schema.md",
  "assets/resolution-template.md",
]

const SKILLS_WITH_COPIES = ["ce-compound", "ce-compound-refresh"]

describe("ce-compound support file drift", () => {
  for (const file of SHARED_SUPPORT_FILES) {
    test(`${file} is identical across ${SKILLS_WITH_COPIES.join(", ")}`, async () => {
      const contents = await Promise.all(
        SKILLS_WITH_COPIES.map((skill) =>
          readFile(path.join(PLUGIN_ROOT, skill, file), "utf8"),
        ),
      )

      for (let i = 1; i < contents.length; i++) {
        expect(contents[i]).toBe(contents[0])
      }
    })
  }
})

// Format-rendering refs (markdown-rendering.md, html-rendering.md) are
// byte-duplicated across ce-plan, ce-brainstorm, and ce-ideate. There is no
// cross-skill shared-file mechanism (see AGENTS.md
// "Runtime vs Authoring Context"); all copies must stay identical so the
// agent renders artifacts the same way regardless of which skill composed
// them.
const RENDERING_SKILLS = ["ce-plan", "ce-brainstorm", "ce-ideate"]
const RENDERING_REFS = [
  "references/markdown-rendering.md",
  "references/html-rendering.md",
]

describe("format-rendering ref drift across ce-plan and ce-brainstorm", () => {
  for (const ref of RENDERING_REFS) {
    test(`${ref} is identical across ${RENDERING_SKILLS.join(", ")}`, async () => {
      const contents = await Promise.all(
        RENDERING_SKILLS.map((skill) =>
          readFile(path.join(PLUGIN_ROOT, skill, ref), "utf8"),
        ),
      )

      for (let i = 1; i < contents.length; i++) {
        expect(contents[i]).toBe(contents[0])
      }
    })
  }
})

/**
 * Regression tests for the YAML-safety quoting rule for array items.
 *
 * Array items in frontmatter fields like `symptoms:` that start with a YAML
 * reserved indicator (`, [, *, &, !, |, >, %, @, ?) or contain `: ` must be
 * wrapped in double quotes — otherwise strict YAML parsers reject the file.
 * See issue #606.
 */
describe("ce-compound YAML safety rule presence", () => {
  for (const skill of SKILLS_WITH_COPIES) {
    test(`${skill}/references/schema.yaml validation_rules includes YAML-safety entry`, async () => {
      const raw = await readFile(
        path.join(PLUGIN_ROOT, skill, "references/schema.yaml"),
        "utf8",
      )
      const parsed = load(raw) as { validation_rules?: string[] } | null
      expect(parsed).not.toBeNull()
      expect(Array.isArray(parsed?.validation_rules)).toBe(true)
      const hasSafetyRule = (parsed?.validation_rules ?? []).some((rule) =>
        /array.*(quote|reserved indicator)|reserved indicator.*quote|YAML[- ]safety/i.test(rule),
      )
      expect(hasSafetyRule).toBe(true)
    })

    test(`${skill}/references/yaml-schema.md contains YAML Safety Rules section`, async () => {
      const raw = await readFile(
        path.join(PLUGIN_ROOT, skill, "references/yaml-schema.md"),
        "utf8",
      )
      expect(/^##\s+YAML\s+Safety\s+Rules/mi.test(raw)).toBe(true)
      // Concrete example stays present so the rule remains actionable.
      expect(raw).toMatch(/"`sudo dscacheutil/)
    })

    test(`${skill}/assets/resolution-template.md references YAML safety rules`, async () => {
      const raw = await readFile(
        path.join(PLUGIN_ROOT, skill, "assets/resolution-template.md"),
        "utf8",
      )
      expect(/YAML[- ]safety/i.test(raw)).toBe(true)
      expect(raw).toMatch(/yaml-schema\.md/)
    })
  }

  test("ce-compound points at YAML Safety Rules in both frontmatter-writing spots", async () => {
    // Issue #606. Both write paths moved into the references the body names at
    // their step — Full mode's assembly and Lightweight's single pass — so the
    // pointer is asserted in each file that now owns a frontmatter write.
    const files = [
      path.join(PLUGIN_ROOT, "ce-compound", "references", "assembly.md"),
      path.join(PLUGIN_ROOT, "ce-compound", "references", "lightweight.md"),
    ]
    for (const file of files) {
      const raw = await readFile(file, "utf8")
      // Match the distinctive write-path pointer phrase, not generic yaml-schema.md
      // references (which also appear in inputs and support-file lists).
      expect(raw, `${file} lost the YAML-safety pointer`).toMatch(
        /YAML[- ]safety\s+quoting\s+rule\s+for\s+array\s+items/i,
      )
      // The pointer must sit in the frontmatter-write step, not drift elsewhere.
      expect(raw, `${file} moved the pointer off the frontmatter step`).toMatch(
        /YAML\s+frontmatter[\s\S]{0,400}?YAML[- ]safety\s+quoting\s+rule\s+for\s+array\s+items/i,
      )
    }
  })

  test("ce-compound-refresh per-action-flows reference points at YAML-safety rules in the Replace flow", async () => {
    // The Replace Flow content lives in references/per-action-flows.md after the
    // Phase 4 extraction; SKILL.md keeps a stub that delegates to it.
    const raw = await readFile(
      path.join(PLUGIN_ROOT, "ce-compound-refresh", "references", "per-action-flows.md"),
      "utf8",
    )
    // Anchor to the Replace Flow section so a drifted or deleted pointer is
    // caught even if the phrase still appears elsewhere in the file.
    const replaceFlowMatch = raw.match(
      /##\s+Replace\s+Flow\b([\s\S]*?)(?=\n##\s+\w|$)/,
    )
    expect(replaceFlowMatch).not.toBeNull()
    const replaceFlow = replaceFlowMatch?.[1] ?? ""
    expect(/YAML[- ]safety/i.test(replaceFlow)).toBe(true)
    expect(replaceFlow).toMatch(/yaml-schema\.md/)
  })
})

// The body carries the conditions and one pointer per step; the detail moved into
// references the body names at that step. Split the guard the same way: the body
// pins the mandatory reads (a lost pointer silently drops the whole reference),
// and each reference keeps the invariant it now owns.
describe("ce-compound-refresh body pointers and relocated invariants", () => {
  const ref = (name: string) =>
    readFile(path.join(PLUGIN_ROOT, "ce-compound-refresh", "references", name), "utf8")

  test("the body names every reference at the step that needs it", async () => {
    const skill = await readFile(
      path.join(PLUGIN_ROOT, "ce-compound-refresh", "SKILL.md"),
      "utf8",
    )
    for (const name of [
      "modes.md",
      "scope.md",
      "investigate.md",
      "classify.md",
      "per-action-flows.md",
      "concepts-vocabulary.md",
      "report.md",
      "commit.md",
      "discoverability.md",
    ]) {
      expect(skill, `SKILL.md must point at references/${name}`).toContain(`references/${name}`)
    }
  })

  test("relocated invariants stay stated in the reference that owns them", async () => {
    // Auto-delete is the only unattended destructive path; its gate must survive the move.
    expect(await ref("classify.md")).toContain("Auto-delete")
    expect(await ref("classify.md")).toMatch(/all three hold/)
    // Non-interactive delivery splits into applied vs recommended writes.
    const report = await ref("report.md")
    expect(report).toContain("**Applied:**")
    expect(report).toContain("**Recommended:**")
    // Unattended relocation is gated on four conditions, splits never auto-apply.
    expect(await ref("modes.md")).toMatch(/four-condition gate/)
    expect(await ref("modes.md")).toMatch(/Splits are always recommend-only/)
    // A scope hint that matches nothing must not widen to the whole store.
    expect(await ref("scope.md")).toMatch(/report the miss and exit/)
  })
})

describe("ce-compound-refresh named-guidance comparison", () => {
  test("ce-compound-refresh compares a knowledge-track learning against guidance it names, and never edits that guidance", async () => {
    // Narrow form of issue #1265: the check is bounded to guidance files the
    // learning itself names (no search over the guidance layer), and the
    // refresh only reports a wrong skill/runbook/instruction file.
    const raw = await readFile(path.join(PLUGIN_ROOT, "ce-compound-refresh", "SKILL.md"), "utf8")
    const section = (name: string) =>
      raw.match(new RegExp(`##\\s+${name}\\b([\\s\\S]*?)(?=\\n##\\s+\\w|$)`))?.[1] ?? ""
    const investigate = section("Investigate")
    const classify = section("Classify")
    expect(investigate).toMatch(/guidance file[^\n]*(names|links)/i)
    // The blockquoted subagent prompt is what delegated investigations see; pin it on its own.
    expect(investigate).toMatch(/^> [^\n]*guidance file[^\n]*(names|links)/im)
    expect(classify).toMatch(/never edit[^\n]*(skill|runbook|instruction file)/i)
  })
})

// Isolation forbids sharing a bundled script, so both skills ship
// scripts/light-webserver.js. The helper has no product behavior — display-only
// vs interactive is skill protocol and the HTML the agent writes — so the
// copies must stay byte-identical.
describe("light-webserver.js drift across ce-brainstorm and ce-prototype", () => {
  test("scripts/light-webserver.js is identical across ce-brainstorm, ce-prototype", async () => {
    const contents = await Promise.all(
      ["ce-brainstorm", "ce-prototype"].map((skill) =>
        readFile(path.join(PLUGIN_ROOT, skill, "scripts", "light-webserver.js"), "utf8"),
      ),
    )
    expect(contents[1]).toBe(contents[0])
  })
})
