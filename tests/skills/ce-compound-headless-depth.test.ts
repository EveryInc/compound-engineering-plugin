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
})
