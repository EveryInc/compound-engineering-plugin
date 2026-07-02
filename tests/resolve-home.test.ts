import { describe, expect, test } from "bun:test"
import os from "os"
import path from "path"
import { expandHome } from "../src/utils/resolve-home"

describe("expandHome", () => {
  test("expands a bare tilde to the home directory", () => {
    expect(expandHome("~")).toBe(os.homedir())
  })

  // "~/x" is the portable home shorthand users and config files write on
  // every OS. It must expand regardless of the platform separator. Pre-fix,
  // expandHome only matched `~${path.sep}`, so on Windows (path.sep === "\\")
  // "~/x" was returned literally and the CLI treated a bogus "~" as a real
  // directory. This invariant holds on POSIX and Windows alike with the fix;
  // without it, it fails on Windows.
  test("expands the forward-slash home shorthand on every platform", () => {
    expect(expandHome("~/.codex")).toBe(path.join(os.homedir(), ".codex"))
    expect(expandHome("~/sub/dir")).toBe(path.join(os.homedir(), "sub", "dir"))
  })

  test("expands the native path-separator form", () => {
    expect(expandHome(`~${path.sep}config`)).toBe(path.join(os.homedir(), "config"))
  })

  test("leaves ~name, relative, and absolute values untouched", () => {
    expect(expandHome("~foo")).toBe("~foo")
    expect(expandHome("relative/path")).toBe("relative/path")
    const abs = path.join(os.homedir(), "abs")
    expect(expandHome(abs)).toBe(abs)
  })
})
