import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import path from "path"

const skillPath = path.join(
  import.meta.dir,
  "..",
  "..",
  "skills",
  "ce-compound",
  "SKILL.md",
)

const skill = readFileSync(skillPath, "utf8")

describe("ce-compound non-interactive depth contract", () => {
  test("advertises explicit lightweight and full headless invocations", () => {
    expect(skill).toContain("mode:headless depth:lightweight")
    expect(skill).toContain("mode:headless depth:full")
  })

  test("keeps existing headless calls backward compatible", () => {
    expect(skill).toMatch(/`mode:headless` without a `depth:` token[^\n]+Full/i)
    expect(skill).toMatch(/`depth:full` or no depth token enters Full Mode[^\n]+automatic session-history probe/i)
  })

  test("routes explicit lightweight depth without prompts or subagents", () => {
    expect(skill).toMatch(/`depth:lightweight`[^\n]+Lightweight Mode/i)
    expect(skill).toMatch(/headless lightweight[^\n]+no blocking questions/i)
    expect(skill).toMatch(/headless lightweight[^\n]+no subagents/i)
    expect(skill).toContain("Documentation complete (headless lightweight mode)")
    expect(skill).toContain("In full headless mode, **do not edit instruction files**")
    expect(skill).not.toContain("In full headless mode, apply the edit directly")
    expect(skill).toContain("Discoverability: <no gap | gap noted — instruction-file tip")
  })

  test("rejects unknown or conflicting depth flags instead of guessing", () => {
    expect(skill).toMatch(/unknown `depth:`[^\n]+Documentation skipped/i)
    expect(skill).toMatch(/multiple `depth:`[^\n]+Documentation skipped/i)
    expect(skill).toMatch(/`depth:` token without headless intent[^\n]+Documentation skipped/i)
  })

  test("keeps full-only validation out of lightweight runs", () => {
    expect(skill).toContain("Semantic grounding validator (Full mode, including headless Full; lightweight skips it)")
    expect(skill).not.toContain("Semantic grounding validator (Full and headless; lightweight skips it)")
  })

  test("scopes the automatic session-history probe to Full runs", () => {
    expect(skill).toMatch(/Lightweight mode skips session history entirely; headless Full runs the same automatic probe/i)
    expect(skill).not.toMatch(/Lightweight mode skips session history entirely; headless runs the same automatic probe/i)
  })

  test("routes headless Lightweight past the interactive completion block", () => {
    const lightweightStart = skill.indexOf("### Lightweight Mode")
    const successOutputStart = skill.indexOf("## Success Output")
    const lightweightSection = skill.slice(lightweightStart, successOutputStart)

    expect(lightweightSection).toMatch(/In headless Lightweight, do not emit this interactive block[^\n]+Headless mode/i)
    expect(skill.match(/Documentation complete \(headless lightweight mode\)/g)).toHaveLength(1)
  })

  test("grounds lightweight discoverability from active context without reopening instruction files", () => {
    const lightweightStart = skill.indexOf("### Lightweight Mode")
    const successOutputStart = skill.indexOf("## Success Output")
    const lightweightSection = skill.slice(lightweightStart, successOutputStart)
    const checkStart = lightweightSection.indexOf("Read-only discoverability check")
    const reportStart = lightweightSection.indexOf("Lightweight completion output")

    expect(checkStart).toBeGreaterThan(-1)
    expect(reportStart).toBeGreaterThan(checkStart)
    expect(lightweightSection).toContain(
      "the project's active instructions and conventions already in your context",
    )
    expect(lightweightSection).not.toContain("Phase 2.6")
    expect(lightweightSection).not.toMatch(/quick read of `AGENTS\.md`\/`CLAUDE\.md`/i)
  })

  test("reports an explicit not-applicable state when no project instructions are active", () => {
    expect(skill).toMatch(
      /not applicable — no active project instructions[^\n]+emit no (?:discoverability )?tip/i,
    )
    expect(skill).toContain(
      "Discoverability: <no gap | gap noted — instruction-file tip emitted | not applicable — no active project instructions>",
    )
  })

  test("carries CONCEPTS.md discoverability into the headless Lightweight report", () => {
    const reportStart = skill.indexOf("For `depth:lightweight`, use this lower-overhead report")
    const fullReportStart = skill.indexOf(
      "For `depth:full` or backward-compatible headless calls",
    )
    const lightweightReport = skill.slice(reportStart, fullReportStart)

    expect(reportStart).toBeGreaterThan(-1)
    expect(fullReportStart).toBeGreaterThan(reportStart)
    expect(lightweightReport).toContain(
      "CONCEPTS.md discoverability: <not checked — CONCEPTS.md not refined | no gap | gap noted — instruction-file tip emitted | not applicable — no active project instructions>",
    )
  })

  test("validates lightweight frontmatter parser safety before reporting success", () => {
    const lightweightStart = skill.indexOf("### Lightweight Mode")
    const successOutputStart = skill.indexOf("## Success Output")
    const lightweightSection = skill.slice(lightweightStart, successOutputStart)
    const writeStep = lightweightSection.indexOf("**Write minimal doc**")
    const parserSafetyStep = lightweightSection.indexOf("**Frontmatter parser-safety check**")
    const completionOutput = lightweightSection.indexOf("**Lightweight completion output:**")

    expect(writeStep).toBeGreaterThan(-1)
    expect(parserSafetyStep).toBeGreaterThan(writeStep)
    expect(completionOutput).toBeGreaterThan(parserSafetyStep)
    expect(lightweightSection).toMatch(
      /Frontmatter parser-safety check[^\n]+Phase 2 step 8[^\n]+bundled-script existence guard and manual fallback checklist/i,
    )
  })

  test("guards lightweight writes against exact target-path collisions", () => {
    const lightweightStart = skill.indexOf("### Lightweight Mode")
    const successOutputStart = skill.indexOf("## Success Output")
    const lightweightSection = skill.slice(lightweightStart, successOutputStart)
    const writeStep = lightweightSection.indexOf("**Write minimal doc**")
    const collisionGuard = lightweightSection.indexOf(
      "check whether the exact proposed `<root>/solutions/[category]/[filename].md` path exists",
    )
    const claimsCheck = lightweightSection.indexOf("**Mechanical claims check**")

    expect(writeStep).toBeGreaterThan(-1)
    expect(collisionGuard).toBeGreaterThan(writeStep)
    expect(claimsCheck).toBeGreaterThan(collisionGuard)
    expect(lightweightSection).toMatch(
      /If it exists, read it: update it only when it covers the same problem, preserving its path and frontmatter structure and adding `last_updated: YYYY-MM-DD`/i,
    )
    expect(lightweightSection).toMatch(
      /otherwise choose a distinct, descriptive filename and re-check that exact path is absent before writing/i,
    )
    expect(lightweightSection).toContain(
      "This is exact-path collision handling only — do not run Full mode's semantic overlap research or dispatch subagents.",
    )
  })

  test("describes Lightweight as reduced coverage without bounded-cost claims", () => {
    expect(skill).toContain("Single-pass alternative — same artifact type, reduced research and validation.")
    expect(skill).not.toContain("Single-pass alternative — same documentation, fewer tokens.")
    expect(skill).not.toContain("use this bounded report")
  })
})
