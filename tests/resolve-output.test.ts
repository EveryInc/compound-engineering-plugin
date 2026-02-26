import { describe, expect, test } from "bun:test"
import os from "os"
import path from "path"
import { resolveTargetOutputRoot } from "../src/utils/resolve-output"

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

  test("droid returns ~/.factory", () => {
    const result = resolveTargetOutputRoot({ ...baseOptions, targetName: "droid" })
    expect(result).toBe(path.join(os.homedir(), ".factory"))
  })

  test("cursor with no explicit output uses cwd", () => {
    const result = resolveTargetOutputRoot({ ...baseOptions, targetName: "cursor" })
    expect(result).toBe(path.join(process.cwd(), ".cursor"))
  })

  test("cursor with explicit output uses outputRoot", () => {
    const result = resolveTargetOutputRoot({
      ...baseOptions,
      targetName: "cursor",
      hasExplicitOutput: true,
    })
    expect(result).toBe(path.join("/tmp/output", ".cursor"))
  })

  test("windsurf default scope (global) resolves to ~/.codeium/windsurf/", () => {
    const result = resolveTargetOutputRoot({
      ...baseOptions,
      targetName: "windsurf",
      scope: "global",
    })
    expect(result).toBe(path.join(os.homedir(), ".codeium", "windsurf"))
  })

  test("windsurf workspace scope resolves to cwd/.windsurf/", () => {
    const result = resolveTargetOutputRoot({
      ...baseOptions,
      targetName: "windsurf",
      scope: "workspace",
    })
    expect(result).toBe(path.join(process.cwd(), ".windsurf"))
  })

  test("windsurf with explicit output overrides global scope", () => {
    const result = resolveTargetOutputRoot({
      ...baseOptions,
      targetName: "windsurf",
      hasExplicitOutput: true,
      scope: "global",
    })
    expect(result).toBe("/tmp/output")
  })

  test("windsurf with explicit output overrides workspace scope", () => {
    const result = resolveTargetOutputRoot({
      ...baseOptions,
      targetName: "windsurf",
      hasExplicitOutput: true,
      scope: "workspace",
    })
    expect(result).toBe("/tmp/output")
  })

  test("windsurf with no scope and no explicit output uses cwd/.windsurf/", () => {
    const result = resolveTargetOutputRoot({
      ...baseOptions,
      targetName: "windsurf",
    })
    expect(result).toBe(path.join(process.cwd(), ".windsurf"))
  })

  test("opencode returns outputRoot as-is", () => {
    const result = resolveTargetOutputRoot({ ...baseOptions, targetName: "opencode" })
    expect(result).toBe("/tmp/output")
  })
})
