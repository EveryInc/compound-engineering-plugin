import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

// 2026-08-19: facts-vs-decisions and the live CONCEPTS/code conflict gate
// closed a demonstrated dialogue seam (ask the user what the repo can
// answer; let conflicting terms slide until the write-up). Pin the
// owning files, not incidental wording.
const SKILL_BODY = readFileSync(
  path.join(process.cwd(), "skills/ce-brainstorm/SKILL.md"),
  "utf8",
)
const INTERACTION_RULES = readFileSync(
  path.join(process.cwd(), "skills/ce-brainstorm/references/interaction-rules.md"),
  "utf8",
)
const DIALOGUE = readFileSync(
  path.join(process.cwd(), "skills/ce-brainstorm/references/dialogue.md"),
  "utf8",
)
const PLAN_WRITE = readFileSync(
  path.join(process.cwd(), "skills/ce-brainstorm/references/plan-write.md"),
  "utf8",
)
const UNIVERSAL = readFileSync(
  path.join(process.cwd(), "skills/ce-brainstorm/references/universal-brainstorming.md"),
  "utf8",
)
const PHASE_0 = readFileSync(
  path.join(process.cwd(), "skills/ce-brainstorm/references/phase-0.md"),
  "utf8",
)

describe("ce-brainstorm ask-only-decisions", () => {
  test("Interaction Rule 8 forbids asking what the environment can settle", () => {
    const rulesStart = INTERACTION_RULES.indexOf("## Interaction Rules")
    expect(rulesStart).toBeGreaterThan(-1)
    const rules = INTERACTION_RULES.slice(rulesStart)

    expect(SKILL_BODY).toContain("references/interaction-rules.md")
    expect(SKILL_BODY).toContain("ask only decisions the environment cannot settle")

    expect(rules).toContain("Ask only decisions")
    expect(
      /is not put to the user/i.test(rules),
      "Rule 8 must forbid putting an environment-answerable question to the user.",
    ).toBe(true)
    expect(
      /Look it up/i.test(rules),
      "Rule 8 must send environment-answerable questions to lookup, not to the user.",
    ).toBe(true)
    expect(
      /does not stall questions that do not depend/i.test(rules),
      "A running lookup must not stall independent questions.",
    ).toBe(true)
    expect(PHASE_0).toContain("asking only decisions the environment cannot settle")
    expect(UNIVERSAL).toContain("asking only decisions the environment cannot settle")
  })

  test("Phase 1.3 challenges decision-relevant CONCEPTS.md or code conflicts without creating the glossary", () => {
    const phase13Start = DIALOGUE.indexOf("#### 1.3 Collaborative Dialogue")
    expect(phase13Start).toBeGreaterThan(-1)
    const phase13 = DIALOGUE.slice(phase13Start)

    expect(SKILL_BODY).toContain("references/dialogue.md")
    expect(SKILL_BODY).toMatch(/conflict gate against existing `CONCEPTS\.md`/)

    expect(
      /would change a product decision/i.test(phase13),
      "The conflict gate must fire only when the conflict would change a product decision.",
    ).toBe(true)
    expect(
      /CONCEPTS\.md/.test(phase13) && /verified code/.test(phase13),
      "The conflict gate must name existing CONCEPTS.md and verified code as the authorities it challenges against.",
    ).toBe(true)
    expect(phase13).toContain("Do not create `CONCEPTS.md`")
    expect(
      /Glossary writes still wait until after the plan/.test(phase13),
      "Live challenge must not move glossary writes earlier than plan-write.md.",
    ).toBe(true)
    expect(PLAN_WRITE).toContain(
      "Skip this step entirely if `CONCEPTS.md` does not exist at repo root",
    )
  })
})
