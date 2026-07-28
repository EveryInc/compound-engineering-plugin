import { describe, expect, test } from "bun:test"
import {
  SLASH_COMMAND_PATH_ALLOWLIST,
  isReservedPathRoot,
  transformSlashCommands,
} from "../src/utils/slash-command"

describe("isReservedPathRoot", () => {
  test("matches every reserved single-segment path root", () => {
    for (const root of SLASH_COMMAND_PATH_ALLOWLIST) {
      expect(isReservedPathRoot(root)).toBe(true)
    }
  })

  test("does not match real command names", () => {
    expect(isReservedPathRoot("plan")).toBe(false)
    expect(isReservedPathRoot("workflows:plan")).toBe(false)
    expect(isReservedPathRoot("etcetera")).toBe(false)
  })
})

describe("transformSlashCommands", () => {
  const upcase = (body: string) => transformSlashCommands(body, (name) => `/${name.toUpperCase()}`)

  test("hands the matched command name to the formatter", () => {
    expect(upcase("Run /plan then stop")).toBe("Run /PLAN then stop")
  })

  test("passes namespaced names through verbatim", () => {
    expect(upcase("Run /workflows:plan")).toBe("Run /WORKFLOWS:PLAN")
  })

  test("leaves bare reserved path roots untouched", () => {
    for (const root of SLASH_COMMAND_PATH_ALLOWLIST) {
      const line = `config lives in /${root}.`
      expect(transformSlashCommands(line, (name) => `/CMD-${name}`)).toBe(line)
    }
  })

  test("leaves multi-segment absolute paths untouched", () => {
    const line = "See /usr/local/bin/tool for details"
    expect(transformSlashCommands(line, () => "/FIRED")).toBe(line)
  })

  test("ignores slashes preceded by a word character", () => {
    const line = "paths like a/b and foo/bar stay put"
    expect(transformSlashCommands(line, () => "/FIRED")).toBe(line)
  })
})
