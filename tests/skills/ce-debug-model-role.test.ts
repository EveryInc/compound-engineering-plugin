import { spawnSync } from "child_process"
import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

// The `debug` model role (model role map, U8) moves the investigation and the
// test-first fix to native subagents while the session keeps every gate. These
// pins hold the tokens and paths that wire the role in; the hand-off behavior
// itself is prose and is covered by fresh-agent evals, not here.

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), "utf8")

const investigate = read("skills/ce-debug/references/investigate.md")
const fix = read("skills/ce-debug/references/fix.md")
const returnToCaller = read("skills/ce-debug/references/return-to-caller.md")
const pipelineMode = read("skills/ce-debug/references/pipeline-mode.md")

describe("ce-debug model role wiring", () => {
  test("the investigation and fix references each resolve the debug role through the shared reference", () => {
    for (const [name, body] of [["investigate.md", investigate], ["fix.md", fix]] as const) {
      expect(body, `${name} must cite the shared contract`).toContain("references/model-roles.md")
      expect(body, `${name} must name the role`).toContain("`debug` role")
    }
  })

  test("the investigation hand-off is read-only", () => {
    const start = investigate.indexOf("**Investigation hand-off.**")
    expect(start).toBeGreaterThan(-1)
    const block = investigate.slice(start, investigate.indexOf("#### 1.1 Reproduce the bug"))
    expect(block).toContain("read-only")
    expect(block).toContain("edits no file")
  })

  test("the fix hand-off leaves the pre-fix scope record and the commit with the session", () => {
    const start = fix.indexOf("**Fix hand-off.**")
    expect(start).toBeGreaterThan(-1)
    const block = fix.slice(start, fix.indexOf("**Test-first:**"))
    expect(block).toMatch(/the pre-fix scope record[^.]*the commit stay with the session/)
  })

  test("both structured returns carry the report as the optional model_role key", () => {
    for (const body of [returnToCaller, pipelineMode]) {
      expect(body).toContain('"model_role":')
      expect(body).toMatch(/`model_role`[^.]*optional/)
    }
  })
})

// Both bodies sit at or over the prompt budget, so the role is wired through
// references only. A body edit made alongside this work shows up here before it
// is committed.
describe("the debug role adds nothing to a SKILL.md body", () => {
  for (const body of ["skills/ce-debug/SKILL.md", "skills/lfg/SKILL.md"]) {
    test(`${body} is byte-identical to HEAD`, () => {
      const committed = spawnSync("git", ["show", `HEAD:${body}`])
      expect(committed.status).toBe(0)
      expect(readFileSync(path.join(process.cwd(), body)).equals(committed.stdout)).toBe(true)
    })
  }
})
