import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("lfg review-fix-review loop", () => {
  test("loops significant actionable review findings until clean or capped", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")
    const followup = await readRepoFile("plugins/compound-engineering/skills/lfg/references/review-followup.md")

    expect(content).toContain("review-fix-review")
    expect(content).toMatch(/3 review iterations/i)
    expect(content).toMatch(/significant actionable findings/i)
    expect(content).toMatch(/re-run review|rerun review|runs another review/i)
    expect(content).toMatch(/low-signal|duplicate|stylistic|speculative/i)
    expect(content).toMatch(/ledger/i)
    expect(content).toMatch(/mode:agent plan:<plan-path>/)
    expect(content).toMatch(/status.*complete/i)
    expect(content).toContain("actionable_findings")
    expect(content).toMatch(/malformed/i)
    expect(content).toMatch(/status` is `failed`, `degraded`, or `skipped`/i)
    expect(content).toMatch(/record `reason`.*`artifact_path` in the ledger/i)
    expect(content).toMatch(/only proceeds after a complete review result/i)
    expect(content).toMatch(/Do not require `actionable_findings` for these non-complete statuses/i)
    expect(content).toMatch(/For `status: "complete"`, require `actionable_findings` and `findings` to be arrays/i)
    expect(content).toMatch(/residual_findings/)
    expect(content).toMatch(/not just `actionable_findings: \[\]`/i)
    expect(content).toMatch(/unsupported review status/i)
    expect(content).toMatch(/stop before residual handoff, browser tests, commit, push, or PR update/i)
    expect(content).not.toContain("Actionable findings: none.")
    expect(followup).toContain("actionable_findings")
    expect(followup).toContain("residual_findings")
    expect(followup).toMatch(/malformed/i)
    expect(followup).toMatch(/status: "failed"/i)
    expect(followup).toMatch(/status: "degraded"/i)
    expect(followup).toMatch(/status: "skipped"/i)
    expect(followup).toMatch(/do not require `actionable_findings` for these non-complete statuses/i)
    expect(followup).toMatch(/A clean review requires `status: "complete"`, `actionable_findings: \[\]`, and no significant `residual_findings`/i)
    expect(followup).toMatch(/stop before applying fixes or shipping/i)
    expect(followup).toMatch(/mode:agent.*does not emit/i)
    expect(followup).not.toContain("or the markdown Actionable Findings section")
  })

  test("handles non-complete review JSON before requiring complete-result arrays", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")
    const followup = await readRepoFile("plugins/compound-engineering/skills/lfg/references/review-followup.md")
    const nonCompleteIndex = content.indexOf("If `status` is `failed`, `degraded`, or `skipped`")
    const completeShapeIndex = content.indexOf('For `status: "complete"`, require `actionable_findings` and `findings` to be arrays')
    const followupNonCompleteIndex = followup.indexOf('status: "failed"')
    const followupCompleteShapeIndex = followup.indexOf('For `status: "complete"`, require `actionable_findings` and `findings` to be arrays')

    expect(nonCompleteIndex).toBeGreaterThan(-1)
    expect(completeShapeIndex).toBeGreaterThan(-1)
    expect(nonCompleteIndex).toBeLessThan(completeShapeIndex)
    expect(followupNonCompleteIndex).toBeGreaterThan(-1)
    expect(followupCompleteShapeIndex).toBeGreaterThan(-1)
    expect(followupNonCompleteIndex).toBeLessThan(followupCompleteShapeIndex)
    expect(content).not.toMatch(/missing `status`, or missing `actionable_findings`/)
    expect(followup).not.toMatch(/missing `status`, missing `actionable_findings`/)
  })

  test("human and release owned significant findings become durable residuals, not clean review", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")
    const followup = await readRepoFile("plugins/compound-engineering/skills/lfg/references/review-followup.md")
    const cleanIndex = content.indexOf("If `fixable_findings`, current `residual_findings`, and `accumulated_residual_findings` are all empty")
    const residualIndex = content.indexOf("If no eligible fixable finding remains and `accumulated_residual_findings` is non-empty")
    const handoffIndex = content.indexOf("Autonomous residual handoff")

    expect(content).toMatch(/owner `human`, owner `release`/)
    expect(content).toMatch(/Record the accumulated residual set in the ledger and exit the loop so step 5 makes it durable/i)
    expect(content).toMatch(/Human\/release\/advisory\/capped `accumulated_residual_findings`.*`no_sink` entries/i)
    expect(content).toMatch(/skip only when.*no significant residuals derived from full `findings`.*`accumulated_residual_findings` is empty/is)
    expect(cleanIndex).toBeGreaterThan(-1)
    expect(residualIndex).toBeGreaterThan(cleanIndex)
    expect(handoffIndex).toBeGreaterThan(residualIndex)
    expect(followup).toMatch(/owner `human`, owner `release`/)
    expect(followup).toMatch(/include them directly in the residual markdown as `no_sink` entries/i)
  })

  test("mixed fixable and residual review findings keep residuals across reruns", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")
    const followup = await readRepoFile("plugins/compound-engineering/skills/lfg/references/review-followup.md")
    const deriveIndex = content.indexOf("Derive two sets from the complete JSON")
    const accumulateIndex = content.indexOf("Append every significant `residual_findings` item")
    const applyIndex = content.indexOf("For significant actionable downstream-resolver findings")
    const cleanIndex = content.indexOf("If `fixable_findings`, current `residual_findings`, and `accumulated_residual_findings` are all empty")
    const handoffIndex = content.indexOf("Autonomous residual handoff")

    expect(accumulateIndex, "LFG should accumulate residuals before applying fixes and rerunning review").toBeGreaterThan(deriveIndex)
    expect(applyIndex).toBeGreaterThan(accumulateIndex)
    expect(cleanIndex).toBeGreaterThan(accumulateIndex)
    expect(handoffIndex).toBeGreaterThan(cleanIndex)
    expect(content).toMatch(/accumulated_residual_findings/)
    expect(content).toMatch(/Do not clear `accumulated_residual_findings` when a later review returns clean/i)
    expect(content).toMatch(/skip only when.*`accumulated_residual_findings` is empty/is)
    expect(followup).toMatch(/append significant residuals before applying fixable findings/i)
    expect(followup).toMatch(/mixed review result/i)
  })

  test("review-fix persistence respects the GitHub write boundary before commit and push", async () => {
    const followup = await readRepoFile("plugins/compound-engineering/skills/lfg/references/review-followup.md")

    expect(followup).toContain("github_write_boundary")
    expect(followup).toMatch(/If `github_write_boundary\.commit_allowed` is false/i)
    expect(followup).toMatch(/do not stage, commit, or push/i)
    expect(followup).toMatch(/record the blocked commit as a residual in the ledger/i)
    expect(followup).toMatch(/If `github_write_boundary\.push_allowed` is false/i)
    expect(followup).toMatch(/do not push/i)
    expect(followup).toMatch(/record the blocked push as a residual in the ledger/i)
  })

  test("no-PR residual fallback is passed forward into new draft PR body", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")
    const docs = await readRepoFile("docs/skills/lfg.md")
    const fallbackIndex = content.indexOf("If no open PR exists")
    const shippingIndex = content.indexOf("Invoke `ce-commit-push-pr` in draft mode")

    expect(fallbackIndex).toBeGreaterThan(-1)
    expect(shippingIndex).toBeGreaterThan(fallbackIndex)
    expect(content).toMatch(/pr_body_sections\.residual_review_findings/)
    expect(content).toMatch(/residual_fallback_path/)
    expect(content).toMatch(/ledger-supplied `## Residual Review Findings` section must be included in the newly created draft PR body/i)
    expect(docs).toMatch(/records the exact section in the ledger so the subsequent new draft PR body includes it too/i)
  })
})
