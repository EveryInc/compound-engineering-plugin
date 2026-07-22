import { describe, expect, test } from "bun:test"
import { readFile } from "fs/promises"
import path from "path"

const root = process.cwd()
const skillPath = path.join(root, "skills", "ce-fde")

describe("ce-fde skill contract", () => {
  test("keeps the lifecycle and CE handoff gates explicit", async () => {
    const skill = await readFile(path.join(skillPath, "SKILL.md"), "utf8")

    expect(skill).toContain("Do not advance until that reference's readiness gate passes")
    expect(skill).toContain("Do not skip an earlier gate")
    expect(skill).toContain("Never expand before `references/review-value.md` produces `expand`")
    expect(skill).toContain("`ce-brainstorm` -> `ce-plan` -> `ce-work`")
    expect(skill).toContain("Keep tracked sheets aggregate and anonymized")
    expect(skill).toContain("Return the recorded decision and next review condition")
  })

  test("defines stable project state and non-positive value behavior", async () => {
    const sheet = await readFile(path.join(skillPath, "references", "project-sheet.md"), "utf8")
    const review = await readFile(path.join(skillPath, "references", "review-value.md"), "utf8")

    for (const state of ["discovery", "design", "delivery", "value-review", "expand", "fix-once", "stop", "wait"]) {
      expect(sheet).toContain(state)
    }

    expect(review).toContain("If monthly value is zero or negative, report `no payback` and do not expand")
    expect(review).toContain("Convert recurring benefits and costs to the same 30-day basis")
    expect(sheet).toContain("Tracked sheets must contain only aggregate, anonymized evidence")
  })

  test("requires separate authority for live mutations and bounds fix-once", async () => {
    const delivery = await readFile(path.join(skillPath, "references", "deliver.md"), "utf8")

    expect(delivery).toContain("requires verified, separately granted user authority")
    expect(delivery).toContain("keep `delivery` and record that approval as the exact blocker")
    expect(delivery).toContain("without adding users, workflows, or capabilities")
    expect(delivery).toContain("then return to `value-review`")
  })
})
