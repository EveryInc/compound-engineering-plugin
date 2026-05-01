import { readdirSync, readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"
import { parseFrontmatter } from "../src/utils/frontmatter"

const PLUGIN_ROOT = path.join(process.cwd(), "plugins/compound-engineering")
const SKILLS_DIR = path.join(PLUGIN_ROOT, "skills")
const AGENTS_DIR = path.join(PLUGIN_ROOT, "agents")
const PREFIX = "ce-"
const REF = `plugins/compound-engineering/AGENTS.md "Naming Convention"`

// Exemptions from the ce- prefix rule. Add entries here only with a written
// reason — the exemption list shouldn't become a silent junk drawer.
const SKILL_EXEMPTIONS = new Set<string>([
  // lfg ships as the public command `/lfg` (see plugins/compound-engineering/README.md).
  "lfg",
])
const AGENT_EXEMPTIONS = new Set<string>([])

function frontmatterName(filePath: string): string {
  const { data } = parseFrontmatter(readFileSync(filePath, "utf8"), filePath)
  return typeof data.name === "string" ? data.name : ""
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

describe("compound-engineering agent ce- prefix", () => {
  const agentFiles = readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter((entry) =>
      entry.isFile() &&
      entry.name.endsWith(".agent.md") &&
      !AGENT_EXEMPTIONS.has(entry.name),
    )
    .map((entry) => entry.name)

  for (const fileName of agentFiles) {
    test(`agent file "${fileName}" uses ce- prefix`, () => {
      expect(
        fileName.startsWith(PREFIX),
        `Agent file "${fileName}" must start with "${PREFIX}" — see ${REF}`,
      ).toBe(true)
    })

    test(`agent "${fileName}" frontmatter name uses ce- prefix`, () => {
      const name = frontmatterName(path.join(AGENTS_DIR, fileName))
      expect(name, `${fileName} must declare a frontmatter name`).not.toBe("")
      expect(
        name.startsWith(PREFIX),
        `Agent frontmatter name "${name}" must start with "${PREFIX}" — see ${REF}`,
      ).toBe(true)
    })
  }
})
