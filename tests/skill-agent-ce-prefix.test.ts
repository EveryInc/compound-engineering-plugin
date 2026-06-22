import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"
import { parseFrontmatter } from "../src/utils/frontmatter"

const PLUGIN_ROOT = process.cwd()
const SKILLS_DIR = path.join(PLUGIN_ROOT, "skills")
const AGENTS_DIR = path.join(PLUGIN_ROOT, "agents")
const PREFIX = "ce-"
const REF = `AGENTS.md "Naming Convention"`

// Exemptions from the ce- prefix rule. Add entries here only with a written
// reason — the exemption list shouldn't become a silent junk drawer.
const SKILL_EXEMPTIONS = new Set<string>([
  // lfg ships as the public command `/lfg` (see README.md).
  "lfg",
])
function frontmatterName(filePath: string): string {
  const { data } = parseFrontmatter(readFileSync(filePath, "utf8"), filePath)
  return typeof data.name === "string" ? data.name : ""
}

function collectMarkdownFiles(root: string): string[] {
  if (!existsSync(root)) return []
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath)
    }
  }
  return files
}

describe("compound-engineering skill ce- prefix", () => {
  const skillDirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !SKILL_EXEMPTIONS.has(entry.name))
    .map((entry) => entry.name)

  for (const dirName of skillDirs) {
    test(`skill directory "${dirName}" uses ce- prefix`, () => {
      expect(
        dirName.startsWith(PREFIX),
        `Skill directory "${dirName}" must start with "${PREFIX}" — see ${REF}`,
      ).toBe(true)
    })

    test(`skill "${dirName}" frontmatter name uses ce- prefix`, () => {
      const name = frontmatterName(path.join(SKILLS_DIR, dirName, "SKILL.md"))
      expect(name, `SKILL.md must declare a frontmatter name`).not.toBe("")
      expect(
        name.startsWith(PREFIX),
        `Skill frontmatter name "${name}" must start with "${PREFIX}" — see ${REF}`,
      ).toBe(true)
    })
  }
})

describe("compound-engineering local prompt assets", () => {
  test("does not ship standalone agents", () => {
    expect(existsSync(AGENTS_DIR)).toBe(false)
  })

  const promptFiles = collectMarkdownFiles(SKILLS_DIR).filter((file) => {
    const normalized = file.split(path.sep).join("/")
    return normalized.includes("/references/agents/") || normalized.includes("/references/personas/")
  })

  for (const filePath of promptFiles) {
    const relPath = path.relative(PLUGIN_ROOT, filePath)

    test(`prompt asset "${relPath}" is unprefixed`, () => {
      expect(
        path.basename(filePath).startsWith(PREFIX),
        `Skill-local prompt assets are internal and should not use the public "${PREFIX}" prefix — see ${REF}`,
      ).toBe(false)
    })

    test(`prompt asset "${relPath}" has no YAML frontmatter`, () => {
      expect(statSync(filePath).isFile()).toBe(true)
      const body = readFileSync(filePath, "utf8")
      expect(body.startsWith("---\n")).toBe(false)
    })
  }
})

describe("compound-engineering agentless dispatch prose", () => {
  const skillMarkdownFiles = collectMarkdownFiles(SKILLS_DIR)

  for (const filePath of skillMarkdownFiles) {
    const relPath = path.relative(PLUGIN_ROOT, filePath)

    test(`skill prose "${relPath}" does not instruct typed-agent dispatch`, () => {
      const body = readFileSync(filePath, "utf8")

      expect(body).not.toContain("Use fully-qualified agent names inside Task calls")
      expect(body).not.toMatch(/subagent_type\s*:/)
    })
  }
})
