import { afterEach, describe, expect, test } from "bun:test"
import os from "os"
import path from "path"
import { resolveOpenCodeWriteScope, resolveTargetOutputRoot } from "../src/utils/resolve-output"

const baseOptions = {
  outputRoot: "/tmp/output",
  codexHome: path.join(os.homedir(), ".codex"),
  piHome: path.join(os.homedir(), ".pi", "agent"),
  hasExplicitOutput: false,
}

describe("resolveTargetOutputRoot", () => {
  test("codex returns codexHome", () => {
    const result = resolveTargetOutputRoot({ ...baseOptions, targetName: "codex" })
    expect(result).toBe(baseOptions.codexHome)
  })

  test("pi returns piHome", () => {
    const result = resolveTargetOutputRoot({ ...baseOptions, targetName: "pi" })
    expect(result).toBe(baseOptions.piHome)
  })

  test("opencode with explicit output returns outputRoot as-is", () => {
    const result = resolveTargetOutputRoot({
      ...baseOptions,
      hasExplicitOutput: true,
      targetName: "opencode",
    })
    expect(result).toBe("/tmp/output")
  })

  describe("opencode without explicit output", () => {
    const originalEnv = process.env.OPENCODE_CONFIG_DIR

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.OPENCODE_CONFIG_DIR
      } else {
        process.env.OPENCODE_CONFIG_DIR = originalEnv
      }
    })

    test("falls back to ~/.config/opencode when OPENCODE_CONFIG_DIR is unset", () => {
      delete process.env.OPENCODE_CONFIG_DIR
      const result = resolveTargetOutputRoot({ ...baseOptions, targetName: "opencode" })
      expect(result).toBe(path.join(os.homedir(), ".config", "opencode"))
    })

    test("respects OPENCODE_CONFIG_DIR when set", () => {
      process.env.OPENCODE_CONFIG_DIR = "/custom/opencode"
      const result = resolveTargetOutputRoot({ ...baseOptions, targetName: "opencode" })
      expect(result).toBe("/custom/opencode")
    })
  })
})

describe("resolveOpenCodeWriteScope", () => {
  test("returns 'global' when no explicit output and no requested scope", () => {
    expect(resolveOpenCodeWriteScope(false, undefined)).toBe("global")
  })

  test("returns undefined when explicit output is given and no requested scope", () => {
    expect(resolveOpenCodeWriteScope(true, undefined)).toBeUndefined()
  })

  test("honors explicit requested scope even without explicit output", () => {
    expect(resolveOpenCodeWriteScope(false, "workspace")).toBe("workspace")
  })

  test("honors explicit requested scope when explicit output is given", () => {
    expect(resolveOpenCodeWriteScope(true, "global")).toBe("global")
  })
})
