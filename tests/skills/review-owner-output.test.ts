import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

function read(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8")
}

describe("review owner output", () => {
  test("code review separates the owner summary from the technical report", () => {
    const skill = read("skills/ce-code-review/SKILL.md")
    const finish = read("skills/ce-code-review/references/finish-review.md")
    const owner = read("skills/ce-code-review/references/owner-summary-template.md")
    const technical = read("skills/ce-code-review/references/review-output-template.md")

    expect(skill).toContain("Plain-English owner summary")
    expect(skill).toContain("`summary.md`")
    expect(skill).toContain("`report.md`")
    expect(finish).toMatch(/return it as the only default user-facing result/i)
    expect(technical).toContain("Do not present it as the default human response")
    expect(owner).toContain("Describe user impact before implementation detail")
    expect(owner).toContain("Do not show priority codes")
    expect(owner).toMatch(/shown only when the user asks|explicit request/i)
  })

  test("machine callers use mode:agent instead of parsing owner prose", () => {
    const work = read("skills/ce-work/SKILL.md")
    const shipping = read("skills/ce-work/references/shipping-workflow.md")
    const followup = read("skills/ce-work/references/review-findings-followup.md")

    expect(work).toContain("`ce-code-review mode:agent`")
    expect(work).toContain("The default owner summary is for people")
    expect(shipping).toContain("default plain-English owner summary is not a machine receipt")
    expect(followup).toContain("Do not parse that summary")
  })

  test("document review and plan handoff share the same owner surface", () => {
    const floor = read("skills/ce-doc-review/references/rendering-floor.md")
    const template = read("skills/ce-doc-review/references/review-output-template.md")
    const synth = read("skills/ce-doc-review/references/synthesis-and-presentation.md")
    const handoff = read("skills/ce-plan/references/plan-handoff.md")

    for (const text of [floor, template, synth, handoff]) {
      expect(text).toMatch(/user impact/i)
      expect(text).toMatch(/technical detail|technical review|technical evidence/i)
    }

    expect(template).toContain("Do not show priority codes")
    expect(synth).toContain("Do not print those internal fields")
    expect(handoff).toContain("Do not render the returned envelope verbatim")
  })
})
