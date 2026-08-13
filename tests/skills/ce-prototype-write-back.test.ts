import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const WRITE_BACK = readFileSync(
  path.join(process.cwd(), "skills/ce-prototype/references/write-back.md"),
  "utf8",
)
const SKILL = readFileSync(
  path.join(process.cwd(), "skills/ce-prototype/SKILL.md"),
  "utf8",
)

describe("ce-prototype write-back", () => {
  test("edits markdown Product Contract only and labels the decision", () => {
    expect(WRITE_BACK).toContain("## Product Contract")
    expect(WRITE_BACK).toContain("session-settled:")
    expect(WRITE_BACK).toMatch(/Governs R/)
    expect(WRITE_BACK).toMatch(/next unused R-ID/)
    expect(WRITE_BACK).toMatch(/Planning Contract/)
    expect(WRITE_BACK).toMatch(/Do not edit Planning Contract/)
  })

  test("implementation-ready markdown is downgraded and HOW is stripped", () => {
    expect(WRITE_BACK).toContain("artifact_readiness: requirements-only")
    expect(WRITE_BACK).toContain("Implementation Units")
    expect(WRITE_BACK).toContain("Verification Contract")
    expect(WRITE_BACK).toContain("Definition of Done")
    expect(WRITE_BACK).toMatch(/Do not leave empty headings/)
    expect(WRITE_BACK).toMatch(/Edit only the file you were given/)
  })

  test("missing file or missing Product Contract fail closed", () => {
    expect(WRITE_BACK).toMatch(/Markdown and HTML artifacts both get written back/)
    // Isolation blocks loading ce-plan's rendering reference, so the HTML
    // identity invariants these edits depend on must be restated here.
    expect(WRITE_BACK).toMatch(/product-requirements/)
    expect(WRITE_BACK).toMatch(/session-settled:` annotation is visible text/)
    expect(WRITE_BACK).toMatch(/do not write/)
    expect(WRITE_BACK).toMatch(/Do not write under `<root>\/plans\/`/)
    expect(WRITE_BACK).toMatch(/no Product Contract section/)
    expect(WRITE_BACK).toMatch(/do not invent a file/)
    expect(WRITE_BACK).toMatch(/directly related brainstorm or plan/)
    expect(WRITE_BACK).toMatch(/Do not search the repo for a matching plan/)
    expect(SKILL).toMatch(/do not mint a plan or a third note/)
    expect(SKILL).toMatch(/Do not pick a plan because one exists in the repo/)
  })
})
