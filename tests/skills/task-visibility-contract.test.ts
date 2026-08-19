import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

function readSkill(name: string): string {
  return readFileSync(path.join(process.cwd(), "skills", name, "SKILL.md"), "utf8")
}

const skills = {
  brainstorm: readSkill("ce-brainstorm"),
  plan: readSkill("ce-plan"),
  work: readSkill("ce-work"),
  codeReview: readSkill("ce-code-review"),
  simplify: readSkill("ce-simplify-code"),
  lfg: readSkill("lfg"),
}

// LFG's task-surface handoff rules moved into the required-read reference its
// body names; the body keeps the pointer and the capability trigger.
const lfgTaskVisibility = readFileSync(
  path.join(process.cwd(), "skills", "lfg", "references", "task-visibility.md"),
  "utf8",
)

describe("task visibility contract", () => {
  test("material workflow skills own a portable task surface", () => {
    for (const skill of Object.values(skills)) {
      expect(skill).toMatch(/task-tracking capability/i)
    }
  })

  test("brainstorm ends on its substantive outcome rather than a handoff task", () => {
    expect(skills.brainstorm).toContain("The spine is five tasks")
    expect(skills.brainstorm).not.toContain("Offer next steps")
  })

  test("ce-work uses goal-first unit names without redundant ordinal counts", () => {
    expect(skills.work).toContain("Add parser coverage (U3)")
    expect(skills.work).toMatch(/Never use a bare U-ID or lead with the identifier/)
    expect(skills.work).toMatch(/full unit list is visible.*do not repeat ordinal counts/s)
  })

  test("code review surfaces only a cross-model pass that actually started", () => {
    expect(skills.codeReview).toMatch(/job ID is returned.*distinct task.*cross-model adversarial review/s)
    expect(skills.codeReview).toMatch(/Never create this task before a peer starts/)
  })

  test("lfg yields task-surface ownership to child skills and refreshes on return", () => {
    expect(skills.lfg).toContain("references/task-visibility.md")
    expect(lfgTaskVisibility).toMatch(/replace or clear LFG's view.*only the child skill's task surface is visible/)
    expect(lfgTaskVisibility).toMatch(/after it returns, recreate or refresh LFG's remaining pipeline work/)
  })
})
