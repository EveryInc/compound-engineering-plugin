import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import path from "path"

const skill = readFileSync(
  path.join(import.meta.dir, "..", "..", "skills", "ce-sweep", "SKILL.md"),
  "utf8",
)

const interview = readFileSync(
  path.join(
    import.meta.dir,
    "..",
    "..",
    "skills",
    "ce-sweep",
    "references",
    "interview.md",
  ),
  "utf8",
)

describe("ce-sweep non-interactive mode token contract", () => {
  test("advertises mode:non-interactive as the primary unattended token", () => {
    expect(skill).toContain('argument-hint: "[setup|reconfigure] [mode:non-interactive]"')
    expect(skill).toContain("supports mode:non-interactive for scheduled runs")
  })

  test("accepts mode:headless as a deprecated alias for scheduled/non-interactive runs", () => {
    expect(skill).toMatch(
      /Parse a `mode:non-interactive` token or its deprecated alias `mode:headless`/i,
    )
    expect(skill).toMatch(/Both tokens together is not a conflict/i)
    expect(skill).toMatch(
      /\*\*Non-interactive\*\* \(either token present\) never prompts/i,
    )
  })

  test("schedule registration prefers mode:non-interactive while documenting the alias", () => {
    expect(interview).toMatch(
      /registered invocation must include `mode:non-interactive`/i,
    )
    expect(interview).toMatch(
      /deprecated alias `mode:headless` still works if already registered/i,
    )
  })
})
