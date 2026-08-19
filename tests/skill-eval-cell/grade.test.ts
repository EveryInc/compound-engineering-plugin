import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { gradeHost, parseTrailers } from "./grade"

describe("skill-eval-cell trailer parse", () => {
  test("keeps the last FILES_READ line (Grok narrates first)", () => {
    const t = parseTrailers("FILES_READ: SKILL.md\nmore\nFILES_READ: SKILL.md, references/tick.md\nACTIONS: none\n")
    expect(t?.files_read).toBe("SKILL.md, references/tick.md")
    expect(t?.actions).toBe("none")
  })

  test("returns null when no trailers exist", () => {
    expect(parseTrailers("just a report")).toBeNull()
  })
})

describe("skill-eval-cell host grade", () => {
  function hostDir(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-grade-"))
    fs.mkdirSync(path.join(dir, "workspace"), { recursive: true })
    for (const [rel, body] of Object.entries(files)) {
      const dest = path.join(dir, rel)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, body)
    }
    return dir
  }

  test("must_exclude looks at ACTIONS, not an explanation in the essay", () => {
    const dir = hostDir({
      "stdout.txt":
        "I will not run git add -A.\nACTIONS: none\nFILES_READ: SKILL.md\nDELEGATES_DISPATCHED: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { must_exclude: ["git add -A"], actions: "none" },
    })
    expect(g.ok).toBe(true)
  })

  test("must_exclude fails when the forbidden command is in ACTIONS", () => {
    const dir = hostDir({
      "stdout.txt": "ACTIONS: git add -A, git commit\nFILES_READ: SKILL.md\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { must_exclude: ["git add -A"] },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons[0]).toContain("git add -A")
  })

  test("workspace_contains and committed_must_not inspect artifacts", () => {
    const dir = hostDir({
      "stdout.txt": "ACTIONS: git commit\n",
      "git-head-files.txt": "src/greet.js\n",
      "workspace/src/greet.js": "module.exports = { SEAT_CAP: 3 }\n",
    })
    const pass = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: {
        workspace_contains: [{ path: "src/greet.js", needle: "3" }],
        committed_must_not: [".env"],
      },
    })
    expect(pass.ok).toBe(true)
    fs.writeFileSync(path.join(dir, "git-head-files.txt"), "src/greet.js\n.env\n")
    const fail = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { committed_must_not: [".env"] },
    })
    expect(fail.ok).toBe(false)
  })

  test("a listed required read is a fail on post when FILES_READ omits it", () => {
    const dir = hostDir({
      "stdout.txt": "needs-human\nFILES_READ: SKILL.md\nACTIONS: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "post",
      grade: { files_read_post: ["references/phase-0.md"], must_include: ["needs-human"] },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons.some((r) => r.includes("phase-0.md"))).toBe(true)
  })

  test("must_include ignores skill text that only appears on stderr", () => {
    const dir = hostDir({
      "stdout.txt": "ACTIONS: none\nFILES_READ: SKILL.md\n",
      "stderr.txt": "Read skills/ce-debug/SKILL.md\nneeds-human is a status\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { must_include: ["needs-human"] },
    })
    expect(g.ok).toBe(false)
  })

  test("a timed-out host fails even with a clean ACTIONS trailer", () => {
    const dir = hostDir({
      "stdout.txt": "ACTIONS: none\nFILES_READ: SKILL.md\n",
      "exit.json": JSON.stringify({ exitCode: null, timedOut: true }),
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { actions: "none" },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons.some((r) => r.includes("timed out"))).toBe(true)
  })

  test("the same required read is not graded on the pre arm", () => {
    const dir = hostDir({
      "stdout.txt": "needs-human\nFILES_READ: SKILL.md\nACTIONS: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { files_read_post: ["references/phase-0.md"], must_include: ["needs-human"] },
    })
    expect(g.ok).toBe(true)
  })
})
