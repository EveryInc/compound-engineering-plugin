import { readdir, readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-codex-loop contract", () => {
  test("defines a self-contained public orchestrator skill", async () => {
    const content = await readRepoFile("skills/ce-codex-loop/SKILL.md")

    expect(content).toContain("name: ce-codex-loop")
    expect(content).toContain("argument-hint:")
    expect(content).toContain("## Argument Parsing")
    expect(content).toContain("required existing code-execution plan path")
    expect(content).toContain("Reject missing, unreadable, `execution: knowledge-work`, or unsafe-scope plans")
    expect(content).toContain("Preflight downstream contracts before mutation")

    expect(content).toContain("references/stage-result-schemas.md")
    expect(content).toContain("references/terminal-statuses.md")
    expect(content).toContain("references/working-tree-manifest.md")
    expect(content).toContain("references/review-followup-eligibility.md")

    expect(content).not.toContain("skills/ce-work/")
    expect(content).not.toContain("skills/lfg/")
    expect(content).not.toContain("../ce-work")
    expect(content).not.toContain("../lfg")
  })

  test("orchestrates composition modes and preserves runtime mutation boundary", async () => {
    const content = await readRepoFile("skills/ce-codex-loop/SKILL.md")

    expect(content).toContain("ce-work mode:implementation-only")
    expect(content).toContain("ce-simplify-code mode:structured manifest:<manifest-path>")
    expect(content).toContain("ce-code-review mode:agent base:<stable-base> manifest:<manifest-path> run-id:<run-id>")
    expect(content).toContain("ce-compound mode:headless")
    expect(content).toContain("run exactly once")
    expect(content).toContain("only after clean review and green final verification")

    expect(content).toMatch(/must never commit/i)
    expect(content).toMatch(/must never push/i)
    expect(content).toMatch(/must never create or edit a PR/i)
    expect(content).toMatch(/must never watch CI/i)
    expect(content).toMatch(/must never run release automation/i)
  })

  test("documents review-loop gates, three-attempt cap, and terminal statuses", async () => {
    const content = await readRepoFile("skills/ce-codex-loop/SKILL.md")

    expect(content).toContain("Clean review requires all three predicates")
    expect(content).toContain("status == complete")
    expect(content).toContain("verdict == Ready to merge")
    expect(content).toContain("actionable_findings.length == 0")
    expect(content).toContain("At most three total review attempts")
    expect(content).toContain("one eligible fix wave")
    expect(content).toContain("one repair-or-revert pass")
    expect(content).toContain("Never review an unchanged tree")
    expect(content).toContain("Never review a known red tree")
    expect(content).toContain("Never review findings outside the current manifest")

    for (const status of [
      "success",
      "failed",
      "unverified",
      "already_satisfied",
      "quality_verified_but_compound_failed",
    ]) {
      expect(content).toContain(status)
    }
  })

  test("uses skill-local review followup policy only", async () => {
    const content = await readRepoFile("skills/ce-codex-loop/SKILL.md")
    const policy = await readRepoFile("skills/ce-codex-loop/references/review-followup-eligibility.md")

    expect(content).toContain("Load `references/review-followup-eligibility.md`")
    expect(policy).toContain("Filter only `actionable_findings`")
    expect(policy).toContain("Severity is priority only")
    expect(policy).toContain("`requires_verification` controls test scope only")
    expect(policy).toContain("outside the manifest")
    expect(policy).toContain("No eligible findings")
    expect(policy).toContain("terminal `failed`")
    expect(policy).not.toContain("skills/ce-work")
    expect(policy).not.toContain("skills/lfg")
  })

  test("fixtures cover every terminal path", async () => {
    const fixtureDir = path.join(process.cwd(), "tests/fixtures/ce-codex-loop")
    const files = await readdir(fixtureDir)
    const statuses = new Set<string>()

    for (const file of files.filter((name) => name.endsWith(".json"))) {
      const fixture = JSON.parse(await readFile(path.join(fixtureDir, file), "utf8")) as {
        terminal_status?: string
      }
      if (fixture.terminal_status) statuses.add(fixture.terminal_status)
    }

    expect([...statuses].sort()).toEqual([
      "already_satisfied",
      "failed",
      "quality_verified_but_compound_failed",
      "success",
      "unverified",
    ])
  })
})
