import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILLS_ROOT = path.join(process.cwd(), "skills")
const ASSET = "references/publishing.md"

const CONSUMERS: Record<string, string[]> = {
  "ce-ideate": ["references/post-ideation-workflow.md", "references/universal-ideation.md"],
  "ce-explain": ["references/destinations.md"],
  "ce-plan": ["references/plan-handoff.md", "references/universal-planning.md"],
  "ce-brainstorm": ["references/handoff.md", "references/universal-brainstorming.md"],
}

const read = (skill: string, file: string) => readFileSync(path.join(SKILLS_ROOT, skill, file), "utf8")
const skills = Object.keys(CONSUMERS)
const canonical = read(skills[0], ASSET)

describe("publishing condition parity", () => {
  test("every consumer carries a byte-identical copy", () => {
    for (const skill of skills.slice(1)) {
      expect(read(skill, ASSET), `${skill}/${ASSET} drifted from ${skills[0]}`).toBe(canonical)
    }
  })

  test("the condition keeps its safety tokens", () => {
    expect(canonical).toContain("Publishing makes a copy. Write the document first to the place this skill normally stores it")
    expect(canonical).toContain("A published copy never replaces it")
    expect(canonical).toContain("Being installed is not permission to upload.")
    expect(canonical).toContain("The request that named the host does not count as confirmation.")
    expect(canonical).toContain("Never publish in a headless run")
    expect(canonical).toContain("update the existing published artifact if the destination supports updates")
    expect(canonical).toContain("Do not write the published URL into the document.")
    expect(canonical).toContain("Do not switch to another publisher unless the user authorizes it.")
    expect(canonical).toContain("accepts markdown only")
  })

  test("consumers route through the copy instead of listing services", () => {
    for (const [skill, files] of Object.entries(CONSUMERS)) {
      for (const file of files) {
        const body = read(skill, file)
        expect(body, `${skill}/${file} must point at ${ASSET}`).toContain("`references/publishing.md`")
        for (const service of ["ht-ml.app", "Thinkroom", "Publish to Proof"]) {
          expect(body, `${skill}/${file} names ${service}`).not.toContain(service)
        }
      }
    }
  })
})
