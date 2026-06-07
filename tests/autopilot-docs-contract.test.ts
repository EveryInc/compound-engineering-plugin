import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("plan-bounded autopilot docs", () => {
  test("lfg docs describe the bounded autopilot contract", async () => {
    const content = await readRepoFile("docs/skills/lfg.md")

    expect(content).toMatch(/plan-bounded autopilot/i)
    expect(content).toMatch(/run ledger/i)
    expect(content).toMatch(/3 review iterations/i)
    expect(content).toMatch(/3 fix attempts/i)
    expect(content).toMatch(/draft PR/i)
    expect(content).toMatch(/no automatic merge|without automatic merge/i)
    expect(content).toMatch(/escalation triggers/i)
  })

  test("related skill docs expose the contract and draft boundary", async () => {
    const planDoc = await readRepoFile("docs/skills/ce-plan.md")
    const workDoc = await readRepoFile("docs/skills/ce-work.md")
    const prDoc = await readRepoFile("docs/skills/ce-commit-push-pr.md")

    expect(planDoc).toMatch(/optional Autopilot Run Contract/i)
    expect(workDoc).toMatch(/Autopilot Run Contract/)
    expect(workDoc).toMatch(/evidence-research triggers/i)
    expect(prDoc).toContain("draft:true")
    expect(prDoc).toContain("autopilot:true")
    expect(prDoc).toContain("ledger:<path>")
    expect(prDoc).toContain("gh pr create --draft")
    expect(prDoc).toMatch(/existing PR.*draft\/ready state|existing PR.*readiness/i)
    expect(prDoc).toMatch(/updates the PR description.*without asking whether to rewrite/s)
  })

  test("plugin index links the lfg documentation", async () => {
    const pluginReadme = await readRepoFile("plugins/compound-engineering/README.md")
    const skillIndex = await readRepoFile("docs/skills/README.md")

    expect(pluginReadme).toContain("../../docs/skills/lfg.md")
    expect(pluginReadme).toMatch(/Plan-bounded autopilot/i)
    expect(skillIndex).toContain("./lfg.md")
    expect(skillIndex).toMatch(/without automatic merge or release/i)
  })
})
