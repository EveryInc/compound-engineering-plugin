import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

const repoRoot = path.join(__dirname, "../..")
const read = (p: string) => readFileSync(path.join(repoRoot, p), "utf8")

// `cross_model_review_mode: off` is a checkout-local egress gate for the review
// skills' automatic cross-model pass. It must be evaluated before peer
// resolution or any dispatch, in both consumers, and be documented wherever
// ordinary CE config keys are documented.
describe("cross_model_review_mode egress gate", () => {
  const references = [
    "skills/ce-code-review/references/cross-model-review.md",
    "skills/ce-doc-review/references/cross-model-review.md",
  ]

  for (const ref of references) {
    test(`${ref} gates the automatic pass on cross_model_review_mode before peer resolution`, () => {
      const content = read(ref)
      const gate = content.indexOf("cross_model_review_mode")
      const resolution = content.indexOf("Resolve the preference in this order")
      expect(gate).toBeGreaterThan(-1)
      expect(resolution).toBeGreaterThan(-1)
      expect(gate).toBeLessThan(resolution)
      // Only these two values are valid; the default keeps today's behavior.
      expect(content).toMatch(/`auto` \(default\)/)
      // The skip is a distinct, named reason -- not folded into "unavailable" --
      // both at the gate and where the fold-in step writes Coverage.
      expect(content).toContain("disabled by checkout config")
      expect(content).toContain('"cross-model pass: disabled by checkout config"')
      // A live conversation opt-in still overrides the checkout default.
      expect(content).toMatch(/explicitly ask(s|ed) for a cross-model peer/)
    })
  }

  test("both SKILL.md files wire the gate into their cross-model step", () => {
    for (const p of ["skills/ce-code-review/SKILL.md", "skills/ce-doc-review/SKILL.md"]) {
      expect(read(p)).toContain("cross_model_review_mode")
    }
  })

  test("ce-code-review body treats missing peer keys as the default auto route", () => {
    const body = read("skills/ce-code-review/SKILL.md")
    expect(body).toContain("skip and target-selection keys")
    expect(body).toContain("default auto route")
    expect(body).toContain("Another skill's engine preference is not this gate")
    expect(body).toContain("Model and effort overrides stay with the bound target")
  })

  test("config template, example, and configuration reference document the key", () => {
    for (const p of [
      "skills/ce-setup/references/config-template.yaml",
      ".compound-engineering/config.example.yaml",
      "skills/guides/configuration.md",
      "skills/guides/ce-code-review.md",
      "skills/guides/ce-doc-review.md",
    ]) {
      expect(read(p)).toContain("cross_model_review_mode")
    }
    expect(read("skills/ce-setup/references/config-template.yaml")).toMatch(
      /# cross_model_review_mode: off\s+# auto \| off \(default: auto\)/,
    )
  })
})
