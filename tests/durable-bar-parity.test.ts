import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILLS = path.join(import.meta.dir, "..", "skills")

// The durable-knowledge bar is what ce-compound applies before writing a
// learning and what ce-compound-refresh's worth lens applies to learnings
// already written. The two skills may not read each other's files, so the
// paragraph is byte-duplicated and delimited; ce-compound's copy is canonical.
const START = "<!-- ce-durable-bar:start -->"
const END = "<!-- ce-durable-bar:end -->"

async function block(file: string): Promise<string> {
  const text = await readFile(path.join(SKILLS, file), "utf8")
  expect(text.split(START).length).toBe(2)
  expect(text.split(END).length).toBe(2)
  return text.slice(text.indexOf(START), text.indexOf(END) + END.length)
}

describe("durable-bar parity", () => {
  test("refresh's worth audit carries ce-compound's bar verbatim", async () => {
    expect(await block("ce-compound-refresh/references/worth-audit.md")).toBe(
      await block("ce-compound/SKILL.md"),
    )
  })

  test("the worth lens is confirmed before the reference loads, and never applied on inferred intent unattended", async () => {
    const skill = await readFile(path.join(SKILLS, "ce-compound-refresh", "SKILL.md"), "utf8")
    const lens = skill.split("## Worth lens")[1]?.split("\n## ")[0] ?? ""
    expect(lens).toContain("You asked to clean up the learnings. Which do you want?")
    expect(lens).toContain("Nothing accurate is deleted.")
    expect(lens).toMatch(/On option 1, \*\*read `references\/worth-audit\.md`\*\* before Investigate/)
    expect(lens).toMatch(/do not read that reference and do not apply its test/)
    const modes = await readFile(path.join(SKILLS, "ce-compound-refresh", "references", "modes.md"), "utf8")
    expect(modes).toMatch(/Nothing is deleted or cut on inferred intent/)
    const audit = await readFile(path.join(SKILLS, "ce-compound-refresh", "references", "worth-audit.md"), "utf8")
    expect(audit).toMatch(/quote it/)
    expect(audit).toMatch(/Topical overlap is not coverage/)
  })
})
