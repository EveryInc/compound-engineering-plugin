import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"

const skillPath = path.join(process.cwd(), "skills/ce-brainstorm/SKILL.md")

describe("ce-brainstorm integration scope check", () => {
  test("treats named sources as coverage before splitting implementation work", async () => {
    const skill = await readFile(skillPath, "utf8")
    const corePrinciplesStart = skill.indexOf("## Core Principles")
    const interactionRulesStart = skill.indexOf("## Interaction Rules")
    const corePrinciples = skill.slice(corePrinciplesStart, interactionRulesStart)

    expect(corePrinciplesStart).toBeGreaterThanOrEqual(0)
    expect(interactionRulesStart).toBeGreaterThan(corePrinciplesStart)
    expect(corePrinciples).toContain("Do not turn coverage into decomposition")
    expect(corePrinciples).toContain(
      "treat named devices, providers, and data sources as coverage requirements, not automatically as separate integration workstreams",
    )
    expect(corePrinciples).toContain(
      "Split them only when a shared access path cannot satisfy a named requirement",
    )
    expect(corePrinciples).toContain(
      "Leave connector selection to planning unless that choice materially changes product scope or behavior",
    )
  })
})
