import { afterAll, expect, test } from "bun:test"
import fs from "node:fs"
import { extractSkill, mintCellDir } from "./extract"

const cells: string[] = []
afterAll(() => {
  for (const dir of cells) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
    }
  }
})

test("extractSkill archives skills/<name> from HEAD into dest/skills/<name>", () => {
  const dest = mintCellDir()
  cells.push(dest)
  const { skillDir } = extractSkill({ skill: "ce-debug", dest })
  expect(fs.existsSync(`${skillDir}/SKILL.md`)).toBe(true)
  expect(fs.existsSync(`${skillDir}/references/pipeline-mode.md`)).toBe(true)
  expect(skillDir.endsWith("skills/ce-debug")).toBe(true)
})
