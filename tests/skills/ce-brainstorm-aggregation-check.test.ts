import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"

const skillPath = path.join(process.cwd(), "skills/ce-brainstorm/SKILL.md")
const sectionsPath = path.join(
  process.cwd(),
  "skills/ce-brainstorm/references/brainstorm-sections.md",
)
const markdownRenderingPath = path.join(
  process.cwd(),
  "skills/ce-brainstorm/references/markdown-rendering.md",
)
const htmlRenderingPath = path.join(
  process.cwd(),
  "skills/ce-brainstorm/references/html-rendering.md",
)

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

  test("narrows multi-outcome requests to one coherent work unit without creating a parent roadmap", async () => {
    const skill = await readFile(skillPath, "utf8")
    const phase03Start = skill.indexOf("#### 0.3 Assess Scope")
    const phase1Start = skill.indexOf("### Phase 1: Understand the Idea")
    const phase03 = skill.slice(phase03Start, phase1Start)

    expect(phase03Start).toBeGreaterThanOrEqual(0)
    expect(phase1Start).toBeGreaterThan(phase03Start)
    expect(phase03).toContain("Coherent-work gate")
    expect(phase03).toContain("more than one independently plannable product outcome")
    expect(phase03).toContain("Ask which one area this brainstorm should own")
    expect(phase03).toContain("sole source of Requirements, Flows, Acceptance Examples")
    expect(phase03).toContain("Carry the boundary into the Goal Capsule")
    expect(phase03).toContain("does not create a parent plan or a roadmap")
  })

  test("preserves the broader relationship in plain language with bullets before diagrams", async () => {
    const sections = await readFile(sectionsPath, "utf8")
    const sectionStart = sections.indexOf("semantic role `work-relationships`")
    const sectionEnd = sections.indexOf("\n\n- **Actors**", sectionStart)
    const relationshipContract = sections.slice(sectionStart, sectionEnd)

    expect(sectionStart).toBeGreaterThanOrEqual(0)
    expect(sectionEnd).toBeGreaterThan(sectionStart)
    expect(relationshipContract).toContain("shallow indented bullet list")
    expect(relationshipContract).toContain("indentation groups the prose but never carries the")
    expect(relationshipContract).toContain("current understanding, not a committed roadmap")
    expect(relationshipContract).toContain("Use no diagram by default")
    expect(relationshipContract).toContain("non-linear cross-links, fan-in, or fan-out")
    expect(relationshipContract).toContain("do not create or synchronize a separate master map")
  })

  test("gives the relationship section a format-specific semantic role independent of its heading", async () => {
    const sections = await readFile(sectionsPath, "utf8")
    const markdown = await readFile(markdownRenderingPath, "utf8")
    const html = await readFile(htmlRenderingPath, "utf8")
    const readinessStart = sections.indexOf("## Ready for Planning Check")
    const readinessEnd = sections.indexOf("## Product Contract hard floor", readinessStart)
    const readinessCheck = sections.slice(readinessStart, readinessEnd)

    expect(sections).toContain("semantic role `work-relationships`")
    expect(sections).toContain("stable even if its visible heading is renamed")
    expect(readinessStart).toBeGreaterThanOrEqual(0)
    expect(readinessEnd).toBeGreaterThan(readinessStart)
    expect(readinessCheck).toContain("When the coherent-work gate split a broader request")
    expect(readinessCheck).toContain("the `work-relationships` section is present")
    expect(readinessCheck).toContain("<!-- ce-section: work-relationships -->")
    expect(readinessCheck).toContain('data-ce-section="work-relationships"')
    expect(markdown).toContain("<!-- ce-section: work-relationships -->")
    expect(markdown).toMatch(/only exception.*contract-defined invisible\s+semantic marker/s)
    expect(html).toContain('data-ce-section="work-relationships"')
    expect(html).toContain("stable even when the visible heading changes")
  })
})
