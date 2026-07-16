import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"

const skillPath = path.join(process.cwd(), "skills/ce-brainstorm/SKILL.md")

describe("ce-brainstorm integration aggregation check", () => {
  test("checks platform aggregators before multiplying vendor integrations", async () => {
    const skill = await readFile(skillPath, "utf8")

    expect(skill).toContain("Check for aggregation before multiplying integrations")
    expect(skill).toContain(
      "verify whether an existing OS, platform, or project-level aggregator already covers them",
    )
    expect(skill).toContain(
      "do not infer that one connector per vendor is necessary from the vendor list alone",
    )
  })
})
