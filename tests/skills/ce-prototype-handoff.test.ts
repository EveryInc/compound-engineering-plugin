import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const BRAINSTORM_HANDOFF = readFileSync(
  path.join(process.cwd(), "skills/ce-brainstorm/references/handoff.md"),
  "utf8",
)
const PLAN_SKILL = readFileSync(
  path.join(process.cwd(), "skills/ce-plan/SKILL.md"),
  "utf8",
)
const PLAN_HANDOFF = readFileSync(
  path.join(process.cwd(), "skills/ce-plan/references/plan-handoff.md"),
  "utf8",
)
const UNIVERSAL_BRAINSTORM = readFileSync(
  path.join(process.cwd(), "skills/ce-brainstorm/references/universal-brainstorming.md"),
  "utf8",
)
const UNIVERSAL_PLAN = readFileSync(
  path.join(process.cwd(), "skills/ce-plan/references/universal-planning.md"),
  "utf8",
)

describe("ce-prototype handoff offers", () => {
  test("software brainstorm menu offers prototype, omits Proof, and XOR pressure-test", () => {
    expect(BRAINSTORM_HANDOFF).toContain("**Prototype a remaining feel-question**")
    expect(BRAINSTORM_HANDOFF).toContain("visual-probe question that already settled fails this predicate")
    expect(BRAINSTORM_HANDOFF).not.toContain("Publish to Proof")
    expect(BRAINSTORM_HANDOFF).toMatch(/When this option is shown, omit \*\*Pressure-test the requirements\*\*/)
    expect(BRAINSTORM_HANDOFF).toContain("**Open in browser**")
    expect(BRAINSTORM_HANDOFF).toMatch(/host(?:'s)? normal skill-invocation mechanism/)
    expect(BRAINSTORM_HANDOFF).toMatch(/Do not build a prototype in this skill/)
  })

  test("software plan menu offers prototype inline and omits Proof", () => {
    const phaseStart = PLAN_SKILL.indexOf("##### 5.3.8")
    expect(phaseStart).toBeGreaterThan(-1)
    const phaseRegion = PLAN_SKILL.slice(phaseStart)
    expect(phaseRegion).toContain("**Prototype a remaining feel-question**")
    expect(phaseRegion).not.toContain("Publish to Proof")
    expect(phaseRegion).toContain("**Open in browser**")
    expect(phaseRegion).toMatch(/host(?:'s)? normal skill-invocation mechanism|cross-skill invocation rule/)
    expect(phaseRegion).toMatch(/Do not build a prototype in this skill/)
    expect(PLAN_HANDOFF).toContain("**Prototype a remaining feel-question**")
    expect(PLAN_HANDOFF).not.toContain("Publish to Proof")
  })

  test("non-software wrap-up menus still offer Proof", () => {
    expect(UNIVERSAL_BRAINSTORM).toContain("Publish to Proof")
    expect(UNIVERSAL_PLAN).toContain("Publish to Proof")
  })
})
