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
  const MAX_SKILL_DESCRIPTION_LENGTH = 1024
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

      test(`${pluginRoot}/${rel} description has no unwrapped angle-bracket tokens`, () => {
        const parsed = load(yaml) as Record<string, unknown> | null
        const description = parsed && typeof parsed.description === "string" ? parsed.description : ""
        // Strip backtick-delimited spans; what remains must not contain a bare <tag>.
        // Cowork's plugin validator parses descriptions as HTML and rejects
        // unknown tags with a silent "Plugin validation failed" banner. See issue #602.
        const stripped = description.replace(/`[^`]*`/g, "")
        const bareTag = stripped.match(/<[A-Za-z][\w-]*>/)
        expect(bareTag, `Backtick-wrap or rephrase: ${bareTag?.[0] ?? ""}`).toBeNull()
      })

      if (/^skills\/[^/]+\/SKILL\.md$/.test(rel)) {
        test(`${pluginRoot}/${rel} skill description fits 1024-char harness limit`, () => {
          const parsed = load(yaml) as Record<string, unknown> | null
          const description = parsed && typeof parsed.description === "string" ? parsed.description : ""
          expect(
            [...description].length,
            `Shorten description to ${MAX_SKILL_DESCRIPTION_LENGTH} chars or less`,
          ).toBeLessThanOrEqual(MAX_SKILL_DESCRIPTION_LENGTH)
        })

        // Pi rejects skill names that don't match the parent directory or contain
        // characters outside [a-z0-9-]. Upgrading from a pre-v3 install with
        // `name: ce:brainstorm` frontmatter in a renamed `ce-brainstorm` directory
        // triggered issue #449. Catch any reintroduction at the source.
        test(`${pluginRoot}/${rel} skill frontmatter name matches directory and uses valid characters`, () => {
          const parsed = load(yaml) as Record<string, unknown> | null
          const name = parsed && typeof parsed.name === "string" ? parsed.name : ""
          const dirName = path.basename(path.dirname(rel))
          expect(name, `frontmatter name must be present`).not.toBe("")
          expect(name, `frontmatter name "${name}" must match parent directory "${dirName}"`).toBe(dirName)
          expect(name, `frontmatter name "${name}" must be lowercase a-z, 0-9, and hyphens`).toMatch(/^[a-z0-9-]+$/)
        })
      }
    }
  }
})
