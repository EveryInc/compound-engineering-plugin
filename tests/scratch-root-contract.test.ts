import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"

async function scratchContractFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(root, entry.name)
      if (entry.isDirectory()) return scratchContractFiles(absolute)
      return entry.isFile() && /\.(md|py|sh)$/.test(entry.name) ? [absolute] : []
    }),
  )
  return nested.flat()
}

describe("owner-scoped scratch root contract", () => {
  test("skill instructions never use the legacy shared scratch root", async () => {
    const files = await scratchContractFiles(path.join(process.cwd(), "skills"))
    const offenders: string[] = []

    for (const file of files) {
      const content = await readFile(file, "utf8")
      if (content.includes("/tmp/compound-engineering/")) {
        offenders.push(path.relative(process.cwd(), file))
      }
    }

    expect(offenders).toEqual([])
  })

  test("run-producing skills resolve a UID-scoped or overridden root", async () => {
    const runProducingSkills = [
      "ce-brainstorm",
      "ce-babysit-pr",
      "ce-code-review",
      "ce-compound",
      "ce-doc-review",
      "ce-explain",
      "ce-ideate",
      "ce-pov",
      "ce-sweep",
    ]

    for (const skill of runProducingSkills) {
      const files = await scratchContractFiles(path.join(process.cwd(), "skills", skill))
      const content = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n")
      expect(content).toContain("COMPOUND_ENGINEERING_SCRATCH_ROOT")
      expect(content).toContain("/tmp/compound-engineering-$(id -u)")
    }
  })
})
