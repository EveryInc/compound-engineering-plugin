import { describe, expect, test } from "bun:test"
import path from "path"
import { loadClaudePlugin } from "../src/parsers/claude"
import { sanitizePathName } from "../src/utils/files"

const pluginRoot = path.join(process.cwd(), "plugins", "compound-engineering")

describe("sanitizePathName", () => {
  test("replaces colons with hyphens", () => {
    expect(sanitizePathName("ce:brainstorm")).toBe("ce-brainstorm")
    expect(sanitizePathName("ce:plan")).toBe("ce-plan")
  })

  test("passes through names without colons", () => {
    expect(sanitizePathName("frontend-design")).toBe("frontend-design")
  })

  test("handles multiple colons", () => {
    expect(sanitizePathName("a:b:c")).toBe("a-b-c")
  })
})

describe("path sanitization collision detection", () => {
  test("no two skill names collide after sanitization", async () => {
    const plugin = await loadClaudePlugin(pluginRoot)
    const sanitized = plugin.skills.map((skill) => sanitizePathName(skill.name))
    const unique = new Set(sanitized)

    expect(unique.size).toBe(sanitized.length)
  })

  test("no two agent names collide after sanitization", async () => {
    const plugin = await loadClaudePlugin(pluginRoot)
    const sanitized = plugin.agents.map((agent) => sanitizePathName(agent.name))
    const unique = new Set(sanitized)

    expect(unique.size).toBe(sanitized.length)
  })
})
