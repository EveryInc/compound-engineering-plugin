import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

function readSkill(name: string): string {
  return readFileSync(path.join(process.cwd(), "skills", name, "SKILL.md"), "utf8")
}

// 2026-08-18: ce-brainstorm's Phase 0.4 task spine moved into
// references/phase-0.md with the rest of Phase 0 when the body was restructured
// under the Codex 8000-byte prompt budget. The spine is a user-visible surface
// contract, not a rule that must fire from the window, and the body names
// phase-0.md as a required read before Phase 0.1, so it is asserted there.
const skills = {
  brainstorm: readFileSync(
    path.join(process.cwd(), "skills/ce-brainstorm/references/phase-0.md"),
    "utf8",
  ),
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
    // Task derivation and naming live in the reference ce-work's Phase 1 step 3 mandates.
    const intake = readFileSync(
      path.join(process.cwd(), "skills/ce-work/references/work-intake.md"),
      "utf8",
    )
    expect(intake).toContain("Add parser coverage (U3)")
    expect(intake).toMatch(/Never use a bare U-ID or lead with the identifier/)
    expect(intake).toMatch(/full unit list is visible.*do not repeat ordinal counts/s)
  })

  // The peer-task rule lives at the routing boundary that starts the peer, which is the
  // reference ce-code-review's spine mandates before any dispatch.
  test("code review surfaces only a cross-model pass that actually started", () => {
    const route = readFileSync(
      path.join(process.cwd(), "skills", "ce-code-review", "references", "select-and-route.md"),
      "utf8",
    )
    expect(route).toMatch(/job ID is returned.*distinct task.*cross-model adversarial review/s)
    expect(route).toMatch(/Never create this task before a peer starts/)
  })

  test("lfg yields task-surface ownership to child skills and refreshes on return", () => {
    expect(skills.lfg).toContain("references/task-visibility.md")
    expect(lfgTaskVisibility).toMatch(/replace or clear LFG's view.*only the child skill's task surface is visible/)
    expect(lfgTaskVisibility).toMatch(/after it returns, recreate or refresh LFG's remaining pipeline work/)
  })
})
