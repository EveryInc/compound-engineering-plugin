import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILLS = path.join(import.meta.dir, "..", "skills")

const START = "<!-- ce-durable-bar:start -->"
const END = "<!-- ce-durable-bar:end -->"

async function block(file: string, start = START, end = END): Promise<string> {
  const text = await readFile(path.join(SKILLS, file), "utf8")
  expect(text.split(start).length).toBe(2)
  expect(text.split(end).length).toBe(2)
  return text.slice(text.indexOf(start), text.indexOf(end) + end.length)
}

const STANDARDS_START = "<!-- ce-standards-bar:start -->"
const STANDARDS_END = "<!-- ce-standards-bar:end -->"
function normalized(blockText: string): string {
  return blockText.replace(/^[ \t]+/gm, "")
}

describe("durable-bar parity", () => {
  test("ce-compound's form choice carries ce-setup's standards bar verbatim", async () => {
    const owner = await block("ce-setup/references/project-docs.md", STANDARDS_START, STANDARDS_END)
    const copy = await block("ce-compound/references/form.md", STANDARDS_START, STANDARDS_END)
    expect(normalized(copy)).toBe(normalized(owner))
  })

  test("refresh's worth audit points at the one durable bar", async () => {
    expect(await block("ce-compound/SKILL.md")).toContain("counterfactual")
    const audit = await readFile(path.join(SKILLS, "ce-compound", "references", "refresh", "worth-audit.md"), "utf8")
    expect(audit).toContain("`ce-durable-bar` paragraph under Preconditions in `SKILL.md`")
  })

  test("refresh's worth audit carries ce-setup's standards bar verbatim", async () => {
    const owner = await block("ce-setup/references/project-docs.md", STANDARDS_START, STANDARDS_END)
    const copy = await block("ce-compound/references/refresh/worth-audit.md", STANDARDS_START, STANDARDS_END)
    expect(normalized(copy)).toBe(normalized(owner))
  })

  test("the worth audit runs on every refresh except a drift-only request, and cuts only on quoted evidence", async () => {
    const skill = await readFile(path.join(SKILLS, "ce-compound", "references", "refresh", "overview.md"), "utf8")
    expect(skill).toMatch(/\*\*Read `references\/refresh\/worth-audit\.md` before Investigate\.\*\*/)
    expect(skill).toMatch(/drift fixes only/)
    const audit = await readFile(path.join(SKILLS, "ce-compound", "references", "refresh", "worth-audit.md"), "utf8")
    expect(audit).toMatch(/quote it/)
    expect(audit).toMatch(/Topical overlap is not coverage/)
    expect(audit).toMatch(/writes no checks/)
  })
})
