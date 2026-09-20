import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { isLostChildExit, makeRepo, throwLostChildExit } from "./ce-work-workspace-harness"

describe("ce-work workspace harness: lost child-exit", () => {
  test("detects the spawnSync timeout signature and throws TimeoutError", () => {
    expect(isLostChildExit({ status: null, signal: "SIGKILL" })).toBe(true)
    expect(isLostChildExit({ status: null, signal: "SIGTERM", error: { code: "ETIMEDOUT" } })).toBe(true)
    expect(isLostChildExit({ status: 120, signal: null, stdout: "", stderr: "" })).toBe(true)
    expect(isLostChildExit({ status: 120, signal: null, stderr: "assertion failed\n" })).toBe(false)
    expect(isLostChildExit({ status: 0, signal: null, stdout: "READY\n" })).toBe(false)
    expect(isLostChildExit({ status: 1, signal: null, stderr: "traceback\n" })).toBe(false)
    try {
      throwLostChildExit(["python3", "unit-workspace.py", "resume"])
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).name).toBe("TimeoutError")
      return
    }
    throw new Error("expected throwLostChildExit to throw")
  })
})

describe("ce-work workspace harness: repo template", () => {
  test("makeRepo reseeds when the cached template directory has gone missing", () => {
    const before = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("ce-work-repo-template-")))
    const first = makeRepo()
    expect(existsSync(path.join(first.repo, "docs", "plans", "plan.md"))).toBe(true)
    const created = readdirSync(tmpdir()).filter((name) => name.startsWith("ce-work-repo-template-") && !before.has(name))
    expect(created.length).toBe(1)
    // CI has lost this directory mid-file after a timed-out test; every later makeRepo then threw ENOENT.
    rmSync(path.join(tmpdir(), created[0]), { recursive: true, force: true })

    const second = makeRepo()
    expect(existsSync(path.join(second.repo, "docs", "plans", "plan.md"))).toBe(true)
    expect(second.base).toMatch(/^[0-9a-f]{40}$/)
  })
})
