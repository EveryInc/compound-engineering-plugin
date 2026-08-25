import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import path from "path"

// ce-compound's body now carries the mode contract and one pointer per step; the
// phase detail moved into the references the body names at those steps. The guard
// splits the same way: what must decide behavior straight from the context window
// is pinned in the body, and each relocated invariant is pinned in the file that
// now owns it. A non-interactive caller reaches this skill from a standing
// instruction, so every rule that keeps it from asking a question stays in the body.
const skillDir = path.join(import.meta.dir, "..", "..", "skills", "ce-compound")

const read = (...parts: string[]) =>
  readFileSync(path.join(skillDir, ...parts), "utf8")

const skill = read("SKILL.md")
const lightweight = read("references", "lightweight.md")
const report = read("references", "report.md")
const assembly = read("references", "assembly.md")
const discoverability = read("references", "refresh-and-discoverability.md")
const corpus = [skill, lightweight, report, assembly, discoverability].join("\n")

describe("ce-compound non-interactive depth contract (always-loaded body)", () => {
  test("advertises explicit lightweight and full non-interactive invocations", () => {
    expect(skill).toContain("mode:non-interactive depth:lightweight")
    expect(skill).toContain("mode:non-interactive depth:full")
  })

  test("keeps existing headless calls backward compatible as deprecated alias", () => {
    expect(skill).toMatch(/deprecated alias `mode:headless`/i)
    expect(skill).toMatch(/`depth:full` or no depth token enters Full Mode[^\n]+automatic session-history probe/i)
    // A depth-less non-interactive call must still route to Full mode. The rule
    // is the pin; the sentence that carries it is free to be reworded.
    expect(skill).toMatch(/non-interactive call carrying no depth token[^\n]*as it always has/i)
  })

  test("routes explicit lightweight depth without prompts or subagents", () => {
    expect(skill).toMatch(/`depth:lightweight`[^\n]+Lightweight Mode/i)
    expect(skill).toMatch(/[Nn]on-interactive lightweight[^\n]+no blocking questions/i)
    expect(skill).toMatch(/[Nn]on-interactive lightweight[^\n]+no subagents/i)
  })

  test("rejects unknown or conflicting depth flags instead of guessing", () => {
    expect(skill).toMatch(/unknown `depth:`[^\n]+Documentation skipped/i)
    expect(skill).toMatch(/multiple `depth:`[^\n]+Documentation skipped/i)
    expect(skill).toMatch(/`depth:` token without non-interactive intent[^\n]+Documentation skipped/i)
  })

  test("scopes the automatic session-history probe to Full runs", () => {
    expect(skill).toMatch(/Lightweight mode skips session history entirely; non-interactive Full runs the same automatic probe/i)
    expect(skill).not.toMatch(/Lightweight mode skips session history entirely; headless runs the same automatic probe/i)
  })

  test("keeps the instruction-file edit inside interactive Full, from the window", () => {
    // The write envelope decides an irreversible edit to a tracked file, so it
    // must fire without a reference read.
    expect(skill).toMatch(/only in interactive Full mode after consent[\s\S]{0,200}instruction file/i)
  })

  test("names every phase reference at the step that needs it", () => {
    for (const name of [
      "modes.md",
      "research.md",
      "session-history.md",
      "assembly.md",
      "refresh-and-discoverability.md",
      "enhancement.md",
      "lightweight.md",
      "report.md",
    ]) {
      expect(skill, `SKILL.md must point at references/${name}`).toContain(`references/${name}`)
    }
  })
})

describe("ce-compound non-interactive depth contract (relocated invariants)", () => {
  test("keeps full-only validation out of lightweight runs", () => {
    expect(assembly).toContain("Semantic grounding validator (Full mode, including non-interactive Full; lightweight skips it)")
    expect(corpus).not.toContain("Semantic grounding validator (Full and headless; lightweight skips it)")
  })

  test("non-interactive Full reports the discoverability gap instead of editing", () => {
    expect(discoverability).toContain("In full non-interactive mode, **do not edit instruction files**")
    expect(corpus).not.toContain("In full non-interactive mode, apply the edit directly")
  })

  test("the terminal report lines callers parse stay verbatim", () => {
    // These strings are the contract a non-interactive caller reads back.
    expect(report).toContain("Documentation complete (non-interactive lightweight mode)")
    expect(report).toContain("Discoverability: <no gap | gap noted — instruction-file tip")
    expect(report.match(/Documentation complete \(non-interactive lightweight mode\)/g)).toHaveLength(1)
  })

  test("reports an explicit not-applicable state when no project instructions are active", () => {
    expect(lightweight).toMatch(
      /not applicable — no active project instructions[^\n]+emit no (?:discoverability )?tip/i,
    )
    expect(report).toContain(
      "Discoverability: <no gap | gap noted — instruction-file tip emitted | not applicable — no active project instructions>",
    )
  })

  test("carries CONCEPTS.md discoverability into the non-interactive Lightweight report", () => {
    const reportStart = report.indexOf("For `depth:lightweight`, use this lower-overhead report")
    const fullReportStart = report.indexOf(
      "For `depth:full` or backward-compatible non-interactive calls",
    )
    const lightweightReport = report.slice(reportStart, fullReportStart)

    expect(reportStart).toBeGreaterThan(-1)
    expect(fullReportStart).toBeGreaterThan(reportStart)
    // The pinned invariant is that the lightweight report carries this line at all.
    // The skip value moved from "not refined" to "unchanged" when lightweight gained
    // fold/scrub: a fold-only run changes the glossary without refining anything, so
    // the old wording skipped the check on a run that had mutated the file.
    expect(lightweightReport).toContain(
      "CONCEPTS.md discoverability: <not checked — CONCEPTS.md unchanged | no gap | gap noted — instruction-file tip emitted | not applicable — no active project instructions>",
    )
  })

  test("routes non-interactive Lightweight past the interactive completion block", () => {
    expect(lightweight).toMatch(/In non-interactive Lightweight, do not emit this interactive block[^\n]+report.md/i)
  })

  test("grounds lightweight discoverability from active context without reopening instruction files", () => {
    const checkStart = lightweight.indexOf("Read-only discoverability check")
    const reportStart = lightweight.indexOf("Lightweight completion output")

    expect(checkStart).toBeGreaterThan(-1)
    expect(reportStart).toBeGreaterThan(checkStart)
    expect(lightweight).toContain(
      "the project's active instructions and conventions already in your context",
    )
    expect(lightweight).not.toContain("Phase 2.6")
    expect(lightweight).not.toMatch(/quick read of `AGENTS\.md`\/`CLAUDE\.md`/i)
  })

  test("validates lightweight frontmatter parser safety before reporting success", () => {
    const writeStep = lightweight.indexOf("**Write minimal doc**")
    const parserSafetyStep = lightweight.indexOf("**Frontmatter parser-safety check**")
    const completionOutput = lightweight.indexOf("**Lightweight completion output:**")

    expect(writeStep).toBeGreaterThan(-1)
    expect(parserSafetyStep).toBeGreaterThan(writeStep)
    expect(completionOutput).toBeGreaterThan(parserSafetyStep)
    expect(lightweight).toMatch(
      /Frontmatter parser-safety check[^\n]+Phase 2 step 8[^\n]+bundled-script existence guard and manual fallback checklist/i,
    )
  })

  test("guards lightweight writes against exact target-path collisions", () => {
    const writeStep = lightweight.indexOf("**Write minimal doc**")
    const collisionGuard = lightweight.indexOf(
      "check whether the exact proposed `<root>/solutions/[category]/[filename].md` path exists",
    )
    const claimsCheck = lightweight.indexOf("**Mechanical claims check**")

    expect(writeStep).toBeGreaterThan(-1)
    expect(collisionGuard).toBeGreaterThan(writeStep)
    expect(claimsCheck).toBeGreaterThan(collisionGuard)
    expect(lightweight).toMatch(
      /If it exists, read it: update it only when it covers the same problem, preserving its path and frontmatter structure and adding `last_updated: YYYY-MM-DD`/i,
    )
    expect(lightweight).toMatch(
      /otherwise choose a distinct, descriptive filename and re-check that exact path is absent before writing/i,
    )
    expect(lightweight).toContain(
      "This is exact-path collision handling only — do not run Full mode's semantic overlap research or dispatch subagents.",
    )
  })

  test("describes Lightweight as reduced coverage without bounded-cost claims", () => {
    expect(lightweight).toContain("Single-pass alternative — same artifact type, reduced research and validation.")
    expect(corpus).not.toContain("Single-pass alternative — same documentation, fewer tokens.")
    expect(corpus).not.toContain("use this bounded report")
  })
})
