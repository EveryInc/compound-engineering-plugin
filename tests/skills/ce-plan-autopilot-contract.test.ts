import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-plan Autopilot Run Contract", () => {
  test("SKILL.md gates the contract to explicit autopilot or LFG hands-off runs", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-plan/SKILL.md")

    expect(content).toContain("Autopilot Run Contract")
    expect(content).toMatch(/autopilot|hands-off/i)
    expect(content).toMatch(/\/lfg|LFG/)
    expect(content).toMatch(/ordinary plans should not gain/i)
    expect(content).toMatch(/pipeline mode alone|pipeline alone|disable-model-invocation alone/i)
  })

  test("plan-sections defines the required run-contract fields", async () => {
    const content = await readRepoFile(
      "plugins/compound-engineering/skills/ce-plan/references/plan-sections.md",
    )

    expect(content).toContain("Autopilot Run Contract")
    for (const phrase of [
      "Allowed actions",
      "Forbidden actions",
      "Escalation triggers",
      "Retry caps",
      "GitHub write boundary",
      "Resume state",
      "Evidence-research triggers",
    ]) {
      expect(content).toContain(phrase)
    }
  })

  test("requires the exact GitHub write-boundary keys parsed by LFG", async () => {
    const skill = await readRepoFile("plugins/compound-engineering/skills/ce-plan/SKILL.md")
    const sections = await readRepoFile(
      "plugins/compound-engineering/skills/ce-plan/references/plan-sections.md",
    )

    for (const content of [skill, sections]) {
      expect(content).toContain("commit_allowed")
      expect(content).toContain("push_allowed")
      expect(content).toContain("draft_pr_allowed")
      expect(content).toContain("pr_body_update_allowed")
      expect(content).toMatch(/missing or ambiguous.*false/i)
    }

    expect(sections).toMatch(/```json[\s\S]*"commit_allowed"[\s\S]*"push_allowed"[\s\S]*"draft_pr_allowed"[\s\S]*"pr_body_update_allowed"[\s\S]*```/)
  })
})
