import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs"
import { spawnSync } from "child_process"
import os from "os"
import path from "path"
import { describe, expect, test } from "bun:test"

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8")
}

const skill = readRepoFile("skills/ce-plan-grounding-check/SKILL.md")
const check = readRepoFile("skills/ce-plan-grounding-check/references/check.md")
const guide = readRepoFile("docs/guides/ce-plan-grounding-check.md")
const catalog = readRepoFile("docs/guides/README.md")

describe("ce-plan-grounding-check", () => {
  test("kernel requires the check reference and does not stamp implementation-ready", () => {
    expect(skill).toContain("Read `references/check.md`")
    expect(skill).toContain("scripts/pack_reality.py")
    expect(skill).toContain(
      "artifact_readiness: implementation-ready may only be set by a passing plan-grounding-check review",
    )
    expect(skill).toContain("This skill does not write that flag")
    expect(skill).toMatch(/for c in python3 python py/)
    expect(existsSync(path.join(process.cwd(), "skills/ce-plan-grounding-check/scripts/pack_reality.py"))).toBe(true)
  })

  test("check reference owns the eight steps and the two verdicts", () => {
    expect(check).toContain("## 1. Build the claim ledger")
    expect(check).toContain("## 8. Write the review and set the verdict")
    expect(check).toContain("**implementation-ready**")
    expect(check).toContain("**amend then re-check**")
    expect(check).toContain(
      "artifact_readiness: implementation-ready may only be set by a passing plan-grounding-check review",
    )
  })

  test("guide and catalog describe the skill as a disk-vs-document review", () => {
    expect(guide).toContain("`ce-plan-grounding-check`")
    expect(guide).toContain("ce-doc-review")
    expect(catalog).toContain("./ce-plan-grounding-check.md")
  })

  test("pack_reality.py profiles JSON and reports missing files", () => {
    const script = path.join(process.cwd(), "skills/ce-plan-grounding-check/scripts/pack_reality.py")
    const python = Bun.which("python3") ?? Bun.which("python") ?? Bun.which("py")
    if (!python) {
      expect(python, "a Python interpreter is required to exercise pack_reality.py").toBeTruthy()
      return
    }
    const fixture = path.join(os.tmpdir(), `pack-reality-${process.pid}.json`)
    writeFileSync(fixture, JSON.stringify({ items: [{ id: "a", on: true }, { id: "b", on: false }] }))
    try {
      const result = spawnSync(python, [script, fixture, "missing.json"], { encoding: "utf8" })
      expect(result.status).toBe(0)
      expect(result.stdout).toContain("items: 2 rows")
      expect(result.stdout).toContain("== missing.json: MISSING")
      expect(result.stdout).toContain("no 64-hex strings found")
    } finally {
      unlinkSync(fixture)
    }
  })
})
