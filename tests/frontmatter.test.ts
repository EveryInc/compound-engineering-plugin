import { readdirSync, readFileSync, statSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"
import { load } from "js-yaml"
import { formatFrontmatter, parseFrontmatter } from "../src/utils/frontmatter"

describe("frontmatter", () => {
  test("parseFrontmatter returns body when no frontmatter", () => {
    const raw = "Hello\nWorld"
    const result = parseFrontmatter(raw)
    expect(result.data).toEqual({})
    expect(result.body).toBe(raw)
  })

  test("formatFrontmatter round trips", () => {
    const body = "Body text"
    const formatted = formatFrontmatter({ name: "agent", description: "Test" }, body)
    const parsed = parseFrontmatter(formatted)
    expect(parsed.data.name).toBe("agent")
    expect(parsed.data.description).toBe("Test")
    expect(parsed.body.trim()).toBe(body)
  })

})

/**
 * Collect all markdown files with YAML frontmatter from a plugin directory.
 * Returns [relativePath, yamlText] pairs for each file with a frontmatter block.
 */
function collectFrontmatterFiles(pluginRoot: string): [string, string][] {
  const results: [string, string][] = []

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue
        walk(full)
        continue
      }
      if (!entry.name.endsWith(".md")) continue
      const raw = readFileSync(full, "utf8")
      const lines = raw.split(/\r?\n/)
      if (lines[0]?.trim() !== "---") continue
      let end = -1
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === "---") { end = i; break }
      }
      if (end === -1) continue
      const yaml = lines.slice(1, end).join("\n")
      const rel = path.relative(pluginRoot, full)
      results.push([rel, yaml])
    }
  }

  walk(pluginRoot)
  return results
}

describe("frontmatter YAML validity", () => {
  const pluginRoots = [
    "plugins/compound-engineering",
    "plugins/coding-tutor",
  ]

  for (const pluginRoot of pluginRoots) {
    const root = path.join(process.cwd(), pluginRoot)
    try { statSync(root) } catch { continue }
    const files = collectFrontmatterFiles(root)

    for (const [rel, yaml] of files) {
      test(`${pluginRoot}/${rel} has valid strict YAML frontmatter`, () => {
        expect(() => load(yaml)).not.toThrow()
      })
    }
  }
})
