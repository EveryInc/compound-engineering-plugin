import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_DIR = path.join(process.cwd(), "skills/ce-prototype")
const SKILL_BODY = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8")
const PREVIEW_BODY = readFileSync(path.join(SKILL_DIR, "references/preview.md"), "utf8")

function frontmatter(body: string): string {
  const match = body.match(/^---\n([\s\S]*?)\n---/)
  expect(match, "SKILL.md must have YAML frontmatter").not.toBeNull()
  return match![1]
}

describe("ce-prototype protocol", () => {
  test("frontmatter is model-invocable and names adjacent negatives", () => {
    const fm = frontmatter(SKILL_BODY)
    expect(fm).toMatch(/^name:\s*ce-prototype\s*$/m)
    expect(fm).not.toMatch(/disable-model-invocation/)
    const description = fm.match(/^description:\s*(.+)$/m)?.[1] ?? ""
    expect(description.length).toBeGreaterThan(0)
    expect(description.length).toBeLessThanOrEqual(1024)
    expect(description.toLowerCase()).toMatch(/probe/)
    expect(description.toLowerCase()).toMatch(/polish/)
  })

  test("skill tree has no sibling-directory references", () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith(".md") || entry.name.endsWith(".js")) files.push(full)
      }
    }
    walk(SKILL_DIR)

    for (const file of files) {
      const body = readFileSync(file, "utf8")
      expect(body, file).not.toMatch(/\.\.\/[A-Za-z]/)
    }
  })

  test("every references/ and scripts/ path exists in-skill", () => {
    const mentioned = [
      ...SKILL_BODY.matchAll(/`((?:references|scripts)\/[^`]+)`/g),
      ...PREVIEW_BODY.matchAll(/`((?:references|scripts)\/[^`]+)`/g),
    ].map((match) => match[1].replace(/#.*/, ""))

    expect(mentioned.length).toBeGreaterThan(0)
    for (const rel of mentioned) {
      const target = path.join(SKILL_DIR, rel)
      expect(existsSync(target), target).toBe(true)
      expect(statSync(target).isFile(), target).toBe(true)
    }
  })

  test("executed preview commands use SKILL_DIR with a trailing semicolon", () => {
    expect(PREVIEW_BODY).toMatch(/SKILL_DIR="[^"]+";/)
    expect(PREVIEW_BODY).not.toContain("${CLAUDE_SKILL_DIR}")
    expect(SKILL_BODY).not.toContain("${CLAUDE_SKILL_DIR}")
  })

  test("repo grounding is scoped, not a tree scan", () => {
    expect(SKILL_BODY).toMatch(/do not scan the tree/i)
  })

  test("apply-time write-back is a late load", () => {
    expect(SKILL_BODY).toContain("`references/write-back.md`")
    expect(SKILL_BODY).toContain("`references/preview.md`")
  })

  test("successive prototypes keep a scratch decision log, not a durable note", () => {
    expect(SKILL_BODY).toContain("decisions.md")
    expect(PREVIEW_BODY).toContain("decisions.md")
    expect(SKILL_BODY).toMatch(/run capsule at `decisions\.md`/)
    expect(SKILL_BODY).toMatch(/Point at the prototype/)
    expect(SKILL_BODY).toMatch(/Do not pause to confirm every write/)
    expect(SKILL_BODY).toMatch(/Read `decisions\.md` before/)
    expect(SKILL_BODY).toMatch(/Do not treat `decisions\.md` as a plan/)
    expect(SKILL_BODY).toMatch(/Recap from `decisions\.md`/)
  })
})
