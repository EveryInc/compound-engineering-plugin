import { describe, expect, test } from "bun:test"
import { isLostChildExit, throwLostChildExit } from "./ce-work-workspace-harness"

describe("ce-work workspace harness: lost child-exit", () => {
  test("detects the spawnSync timeout signature and throws TimeoutError", () => {
    expect(isLostChildExit({ status: null, signal: "SIGKILL" })).toBe(true)
    expect(isLostChildExit({ status: 0, signal: null })).toBe(false)
    expect(isLostChildExit({ status: 1, signal: null })).toBe(false)
    expect(isLostChildExit({ status: null, signal: "SIGTERM" })).toBe(false)
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
