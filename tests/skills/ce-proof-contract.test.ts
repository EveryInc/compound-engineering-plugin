import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8")
}

const skill = readRepoFile("skills/ce-proof/SKILL.md")
const catalog = readRepoFile("docs/skills/ce-proof.md")
const skillsIndex = readRepoFile("docs/skills/README.md")

describe("ce-proof v3 + owner lifecycle contract", () => {
  test("skill teaches Proof v3 read/edit surfaces", () => {
    expect(skill).toContain("/api/agent/")
    expect(skill).toContain("v3/document")
    expect(skill).toContain("v3/edit")
    expect(skill).toContain("share/markdown")
  })

  test("create workflow persists ownerSecret separately from accessToken", () => {
    expect(skill).toMatch(/OWNER_SECRET|ownerSecret.*required for|persist.*ownerSecret/i)
    expect(skill).toContain("accessToken")
    expect(skill).toContain("ownerSecret")
    expect(skill).toContain("tokenUrl")
    expect(skill).toMatch(/everyday bearer|everyday bearer for/i)
  })

  test("skill documents delete and claim/revocation", () => {
    expect(skill).toContain("DELETE")
    expect(skill).toContain("/api/documents/")
    expect(skill).toMatch(/DOCUMENT_DELETE_FORBIDDEN|permanently revok/i)
    expect(skill).toMatch(/claim/i)
  })

  test("skill warns that content wipe does not scrub comments", () => {
    expect(skill).toMatch(
      /do not support deleting comments|does \*{0,2}not\*{0,2} scrub|scrub comment marks/i,
    )
  })

  test("skill and catalog have no legacy HTTP or Local Bridge teaching", () => {
    for (const [label, body] of [
      ["skill", skill],
      ["catalog", catalog],
    ] as const) {
      expect(body, label).not.toContain("Local Bridge")
      expect(body, label).not.toContain("localhost:9847")
      expect(body, label).not.toContain("/edit/v2")
      expect(body, label).not.toContain("baseToken")
      expect(body, label).not.toContain("rewrite.apply")
      // Path-precise negatives so shareState: "DELETED" etc. do not false-fail.
      expect(body, label).not.toContain("/api/agent/{slug}/state")
      expect(body, label).not.toContain("/api/agent/<slug>/state")
      expect(body, label).not.toMatch(/\/api\/agent\/\$SLUG\/state/)
      expect(body, label).not.toContain("/api/agent/{slug}/ops")
      expect(body, label).not.toContain("/api/agent/<slug>/ops")
      expect(body, label).not.toMatch(/\/api\/agent\/\$SLUG\/ops/)
    }
  })

  test("catalog and skills index are web-first", () => {
    expect(catalog).toContain("v3/document")
    expect(catalog).toContain("ownerSecret")
    expect(skillsIndex).toMatch(/ce-proof/)
    expect(skillsIndex).not.toContain("Local Bridge")
  })

  test("preserves unified-plan publish contract phrases", () => {
    expect(skill).toContain("Only publish markdown")
    expect(skill).toContain("requirements-only")
  })
})
