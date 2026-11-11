import { describe, expect, test } from "bun:test"
import { isLostChildExit, throwLostChildExit } from "./lost-child-exit"

describe("lost child-exit detector", () => {
  test("matches spawnSync timeout shapes seen locally and in CI", () => {
    expect(isLostChildExit({ status: null, signal: "SIGKILL", error: { code: "ETIMEDOUT" }, stdout: "", stderr: "" })).toBe(true)
    expect(isLostChildExit({ status: null, signal: "SIGTERM", error: { code: "ETIMEDOUT" }, stdout: "", stderr: "" })).toBe(true)
    expect(isLostChildExit({ status: null, signal: null, stdout: "", stderr: "" })).toBe(true)
    expect(isLostChildExit({ status: 120, signal: null, stdout: "", stderr: "killed 1 dangling process\n" })).toBe(true)
    expect(isLostChildExit({ status: 0, signal: null, stdout: "READY\n", stderr: "" })).toBe(false)
    expect(isLostChildExit({ status: null, signal: "SIGTERM", stdout: "", stderr: "killed by test: intentional\n" })).toBe(false)
    expect(isLostChildExit({ status: null, signal: "SIGKILL", stdout: "partial output\n", stderr: "" })).toBe(false)
    expect(isLostChildExit({ status: 1, signal: null, stdout: "BLOCKED\n", stderr: "detail\n" })).toBe(false)
    expect(isLostChildExit({ status: 1, signal: null, stdout: "", stderr: "traceback\n" })).toBe(false)
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
