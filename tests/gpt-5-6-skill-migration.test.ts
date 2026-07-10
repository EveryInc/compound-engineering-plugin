import { readdir, readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const repoRoot = process.cwd()
const skillsRoot = path.join(repoRoot, "skills")

async function markdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(root, entry.name)
      if (entry.isDirectory()) return markdownFiles(absolute)
      return entry.isFile() && entry.name.endsWith(".md") ? [absolute] : []
    }),
  )
  return nested.flat()
}

async function filesMatching(pattern: RegExp, files?: string[]): Promise<string[]> {
  const candidates = files ?? await markdownFiles(skillsRoot)
  const matches = await Promise.all(
    candidates.map(async (file) => ((await readFile(file, "utf8")).match(pattern) ? file : null)),
  )
  return matches
    .filter((file): file is string => file !== null)
    .map((file) => path.relative(repoRoot, file))
}

async function readSkill(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, "skills", relativePath), "utf8")
}

describe("GPT-5.6 skill migration", () => {
  test("keeps runtime prompt assets free of provider-specific GPT-5.6 variants", async () => {
    const promptAssets = (await markdownFiles(skillsRoot)).filter((file) =>
      /\/references\/(?:agents|personas)\//.test(file),
    )

    expect(await filesMatching(/gpt-5\.6-(?:sol|terra|luna)/i, promptAssets)).toEqual([])
  })

  test("removes the obsolete Codex mini/mid-tier label", async () => {
    expect(await filesMatching(/mini\/mid-tier/i)).toEqual([])
  })

  test("does not treat Codex task wording as a model override", async () => {
    const [codeReview, simplifyCode] = await Promise.all([
      readSkill("ce-code-review/SKILL.md"),
      readSkill("ce-simplify-code/SKILL.md"),
    ])

    for (const skill of [codeReview, simplifyCode]) {
      expect(skill).toContain("explicit model or custom-agent selector")
      expect(skill).toContain("task wording alone does not select a different model")
      expect(skill).not.toContain("request the host's current lower-cost supporting-agent configuration")
    }
  })

  test("does not reference the retired Codex work-delegation config", async () => {
    expect(await filesMatching(/work_delegate_/i)).toEqual([])
  })

  test("does not rely on generic prompt exhortations", async () => {
    expect(await filesMatching(/\bbe thorough\b/i)).toEqual([])
    expect(await filesMatching(/leave no stone unturned/i)).toEqual([])
    expect(await filesMatching(/last line of defense/i)).toEqual([])
  })
})
