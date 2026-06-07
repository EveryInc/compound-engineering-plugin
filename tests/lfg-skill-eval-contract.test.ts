import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { existsSync } from "fs"
import { execFileSync } from "child_process"
import os from "os"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

type LfgEval = {
  id: string
  user_prompt?: string
  expected_behavior: string[]
  forbidden_behavior: string[]
  mock_state?: Record<string, unknown>
}

type LfgWriteBoundary = {
  commit_allowed?: boolean
  push_allowed?: boolean
  draft_pr_allowed?: boolean
  pr_body_update_allowed?: boolean
}

type LfgExecutableDryRun = {
  id: string
  allow_file_writes: boolean
  fake_commands: boolean
  mock_state: {
    ledger_path: string
    ledger_json: {
      pr_body_sections: {
        residual_review_findings: string
      }
      residual_fallback_path: string
      github_write_boundary?: LfgWriteBoundary
    }
    residual_fallback_path: string
    github_write_boundary?: LfgWriteBoundary
  }
  expected_files: string[]
  expected_pr_body_contains: string[]
  expected_command_log_contains: string[]
  forbidden_pr_body: string[]
}

async function writeWorkspaceFile(root: string, relativePath: string, content: string): Promise<string> {
  const target = path.join(root, ...relativePath.split("/"))
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content, "utf8")
  return target
}

function composeDraftPrBodyFromLedger(baseBody: string, ledgerMarkdown: string): string {
  const jsonMatch = ledgerMarkdown.match(/```json\r?\n([\s\S]*?)\r?\n```/)
  expect(jsonMatch, "ledger should contain a fenced JSON block").not.toBeNull()

  const ledger = JSON.parse(jsonMatch![1]) as {
    pr_body_sections?: { residual_review_findings?: string }
  }
  const residualSection = ledger.pr_body_sections?.residual_review_findings
  expect(residualSection, "ledger should hand residual findings to PR composition").toContain(
    "## Residual Review Findings",
  )

  return [baseBody.trimEnd(), residualSection].join("\n\n")
}

function writeBoundaryFor(mockState: Record<string, unknown> | undefined): LfgWriteBoundary | undefined {
  const topLevel = mockState?.github_write_boundary
  if (topLevel && typeof topLevel === "object") return topLevel as LfgWriteBoundary

  const ledgerJson = mockState?.ledger_json
  if (ledgerJson && typeof ledgerJson === "object") {
    const nested = (ledgerJson as { github_write_boundary?: unknown }).github_write_boundary
    if (nested && typeof nested === "object") return nested as LfgWriteBoundary
  }
}

describe("lfg skill-creator eval suite", () => {
  test("defines concrete autopilot scenarios beyond prose-only contract checks", async () => {
    const raw = await readRepoFile("plugins/compound-engineering/skills/lfg/evals/evals.json")
    const suite = JSON.parse(raw) as { runner: string; common_prompt: string; evals: LfgEval[] }

    expect(suite.runner).toBe("skill-creator")
    expect(suite.common_prompt).toMatch(/Do not edit files or run shell commands/)

    const evalsById = new Map(suite.evals.map((scenario) => [scenario.id, scenario]))
    for (const id of [
      "plan-path-autopilot-run",
      "resume-after-interruption",
      "review-loop-cap",
      "draft-pr-existing-pr-no-prompt",
      "review-noncomplete-hard-stop",
      "existing-pr-preserve-residual-sections",
      "mixed-review-residual-survives-rerun",
      "human-residual-empty-actionables-handoff",
      "github-write-boundary-blocks-shipping",
      "existing-pr-body-update-boundary",
      "review-fix-persistence-write-boundary",
    ]) {
      expect(evalsById.has(id), `${id} should exist`).toBe(true)
      expect(evalsById.get(id)!.expected_behavior.length).toBeGreaterThanOrEqual(4)
      expect(evalsById.get(id)!.forbidden_behavior.length).toBeGreaterThanOrEqual(3)
    }
  })

  test("write-positive evals explicitly grant the matching GitHub write boundary", async () => {
    const raw = await readRepoFile("plugins/compound-engineering/skills/lfg/evals/evals.json")
    const suite = JSON.parse(raw) as {
      executable_dry_runs: Array<LfgExecutableDryRun>
      evals: Array<LfgEval>
    }
    const writePositiveEntries = [
      ...suite.executable_dry_runs.map((entry) => ({
        id: entry.id,
        text: entry.expected_command_log_contains.join("\n"),
        mock_state: entry.mock_state as unknown as Record<string, unknown>,
      })),
      ...suite.evals.map((entry) => ({
        id: entry.id,
        text: entry.expected_behavior
          .filter((line) => !/\b(do not|stop without|without invoking|blocked|forbidden|must not)\b/i.test(line))
          .join("\n"),
        mock_state: entry.mock_state,
      })),
    ]

    for (const entry of writePositiveEntries) {
      const boundary = writeBoundaryFor(entry.mock_state)

      if (/git commit/i.test(entry.text)) {
        expect(boundary?.commit_allowed, `${entry.id} expects git commit, so commit_allowed must be true`).toBe(true)
      }
      if (/git push/i.test(entry.text)) {
        expect(boundary?.push_allowed, `${entry.id} expects git push, so push_allowed must be true`).toBe(true)
      }
      if (/gh pr create|ce-commit-push-pr/i.test(entry.text)) {
        expect(boundary?.draft_pr_allowed, `${entry.id} expects PR creation/shipping, so draft_pr_allowed must be true`).toBe(true)
      }
      if (/gh pr edit|PR body update|description update|PR description update/i.test(entry.text)) {
        expect(
          boundary?.pr_body_update_allowed,
          `${entry.id} expects a PR body update, so pr_body_update_allowed must be true`,
        ).toBe(true)
      }
    }
  })

  test("checked-in plan-path evals claiming an Autopilot Run Contract point to a real contract section", async () => {
    const raw = await readRepoFile("plugins/compound-engineering/skills/lfg/evals/evals.json")
    const suite = JSON.parse(raw) as { evals: LfgEval[] }
    let checkedPlans = 0

    for (const scenario of suite.evals) {
      const planPath = scenario.user_prompt?.match(/^\/lfg\s+(docs\/plans\/\S+\.md)\b/)?.[1]
      if (!planPath || scenario.mock_state?.plan_has_autopilot_run_contract !== true) continue
      if (!existsSync(path.join(process.cwd(), planPath))) continue

      const plan = await readRepoFile(planPath)
      checkedPlans += 1
      expect(plan, `${scenario.id} points at ${planPath}, which should contain the runtime contract it claims`).toContain(
        "## Autopilot Run Contract",
      )
      for (const key of ["commit_allowed", "push_allowed", "draft_pr_allowed", "pr_body_update_allowed"]) {
        expect(plan, `${scenario.id} contract should expose ${key}`).toContain(key)
      }
    }

    expect(checkedPlans, "at least one eval should exercise a checked-in plan path").toBeGreaterThan(0)
  })

  test("no-PR residual dry-run requires the fallback commit to be pushed before draft PR creation", async () => {
    const raw = await readRepoFile("plugins/compound-engineering/skills/lfg/evals/evals.json")
    const suite = JSON.parse(raw) as { executable_dry_runs: LfgExecutableDryRun[] }
    const dryRun = suite.executable_dry_runs.find((entry) => entry.id === "no-pr-residual-fallback-to-new-draft-pr")

    expect(dryRun, "no-PR residual dry-run should exist").toBeDefined()
    const commands = dryRun!.expected_command_log_contains
    const fallbackCommitIndex = commands.findIndex((command) => /git commit .*record residual review findings/i.test(command))
    const pushIndex = commands.findIndex((command) => /git push/i.test(command))
    const draftPrIndex = commands.findIndex((command) => /gh pr create --draft/i.test(command))

    expect(fallbackCommitIndex, "dry-run should require committing the fallback residual file").toBeGreaterThanOrEqual(0)
    expect(pushIndex, "dry-run should require pushing the fallback residual commit").toBeGreaterThanOrEqual(0)
    expect(draftPrIndex, "dry-run should require creating the draft PR after durable fallback push").toBeGreaterThanOrEqual(0)
    expect(fallbackCommitIndex).toBeLessThan(pushIndex)
    expect(pushIndex).toBeLessThan(draftPrIndex)
  })

  test("covers the existing-PR no-prompt shipping failure mode", async () => {
    const raw = await readRepoFile("plugins/compound-engineering/skills/lfg/evals/evals.json")
    const suite = JSON.parse(raw) as { evals: LfgEval[] }
    const scenario = suite.evals.find((entry) => entry.id === "draft-pr-existing-pr-no-prompt")

    expect(scenario, "draft PR existing-PR eval should exist").toBeDefined()
    expect(scenario!.expected_behavior.join("\n")).toMatch(/draft:true autopilot:true plan:<plan-path> ledger:<ledger-path>/)
    expect(scenario!.expected_behavior.join("\n")).toMatch(/without asking whether to rewrite/i)
    expect(scenario!.forbidden_behavior.join("\n")).toMatch(/Asks whether to rewrite the PR description/)
    expect(scenario!.forbidden_behavior.join("\n")).toMatch(/preview confirmation/)
    expect(scenario!.forbidden_behavior.join("\n")).toMatch(/gh pr ready|gh pr merge/)
  })

  test("covers non-complete review hard stops and residual-section preservation", async () => {
    const raw = await readRepoFile("plugins/compound-engineering/skills/lfg/evals/evals.json")
    const suite = JSON.parse(raw) as { workspace: string; evals: LfgEval[] }
    const reviewScenario = suite.evals.find((entry) => entry.id === "review-noncomplete-hard-stop")
    const residualScenario = suite.evals.find((entry) => entry.id === "existing-pr-preserve-residual-sections")

    expect(suite.workspace).toContain("<os-temp>/compound-engineering/lfg/evals/iteration-<N>/")
    expect(reviewScenario, "non-complete review eval should exist").toBeDefined()
    expect(reviewScenario!.expected_behavior.join("\n")).toMatch(/status degraded as incomplete review coverage/i)
    expect(reviewScenario!.expected_behavior.join("\n")).toMatch(/Stop before residual handoff, browser tests, commit, push, or PR update/i)
    expect(reviewScenario!.forbidden_behavior.join("\n")).toMatch(/degraded, failed, skipped, or malformed/)
    expect(residualScenario, "residual preservation eval should exist").toBeDefined()
    expect(residualScenario!.expected_behavior.join("\n")).toMatch(/Pass the existing PR body/i)
    expect(residualScenario!.expected_behavior.join("\n")).toMatch(/Residual Review Findings, Known Residuals, and CI Failures Unresolved/)
    expect(residualScenario!.forbidden_behavior.join("\n")).toMatch(/Drops Residual Review Findings/)
  })

  test("clean review eval explicitly proves the truly clean case", async () => {
    const raw = await readRepoFile("plugins/compound-engineering/skills/lfg/evals/evals.json")
    const suite = JSON.parse(raw) as { evals: Array<LfgEval & { mock_state?: { latest_review_json?: unknown } }> }
    const scenario = suite.evals.find((entry) => entry.id === "review-loop-cap")
    const reviewJson = scenario?.mock_state?.latest_review_json as { actionable_findings?: unknown[]; findings?: unknown[] } | undefined

    expect(scenario, "review loop eval should exist").toBeDefined()
    expect(reviewJson?.actionable_findings).toEqual([])
    expect(reviewJson?.findings).toEqual([])
    expect(scenario!.expected_behavior.join("\n")).toMatch(/empty actionable_findings and no significant findings/i)
  })

  test("review-loop eval covers empty actionable findings with human and release residuals", async () => {
    const raw = await readRepoFile("plugins/compound-engineering/skills/lfg/evals/evals.json")
    const suite = JSON.parse(raw) as { evals: Array<LfgEval & { mock_state?: { latest_review_json?: unknown } }> }
    const scenario = suite.evals.find((entry) => entry.id === "human-residual-empty-actionables-handoff")
    const reviewJson = scenario?.mock_state?.latest_review_json as
      | { actionable_findings?: unknown[]; findings?: Array<{ owner?: string; severity?: string }> }
      | undefined

    expect(scenario, "human/release residual eval should exist").toBeDefined()
    expect(reviewJson?.actionable_findings).toEqual([])
    expect(reviewJson?.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ owner: "human", severity: "P1" }),
        expect.objectContaining({ owner: "release", severity: "P2" }),
      ]),
    )
    expect(scenario!.expected_behavior.join("\n")).toMatch(/not clean/i)
    expect(scenario!.expected_behavior.join("\n")).toMatch(/accumulated_residual_findings/i)
    expect(scenario!.expected_behavior.join("\n")).toMatch(/residual handoff/i)
    expect(scenario!.forbidden_behavior.join("\n")).toMatch(/treats empty actionable_findings as clean/i)
  })

  test("covers mixed review residuals and GitHub write-boundary blocking", async () => {
    const raw = await readRepoFile("plugins/compound-engineering/skills/lfg/evals/evals.json")
    const suite = JSON.parse(raw) as { evals: Array<LfgEval & { mock_state?: Record<string, unknown> }> }
    const mixedScenario = suite.evals.find((entry) => entry.id === "mixed-review-residual-survives-rerun")
    const boundaryScenario = suite.evals.find((entry) => entry.id === "github-write-boundary-blocks-shipping")

    expect(mixedScenario, "mixed review residual eval should exist").toBeDefined()
    expect(mixedScenario!.mock_state?.latest_review_json).toMatchObject({
      status: "complete",
    })
    expect(JSON.stringify(mixedScenario!.mock_state?.latest_review_json)).toMatch(/owner\":\"human/)
    expect(mixedScenario!.expected_behavior.join("\n")).toMatch(/accumulated_residual_findings/)
    expect(mixedScenario!.expected_behavior.join("\n")).toMatch(/later clean review/i)
    expect(mixedScenario!.forbidden_behavior.join("\n")).toMatch(/drops the human-owned residual/i)

    expect(boundaryScenario, "GitHub write-boundary eval should exist").toBeDefined()
    expect(boundaryScenario!.mock_state?.github_write_boundary).toMatchObject({
      commit_allowed: false,
      push_allowed: false,
      draft_pr_allowed: false,
      pr_body_update_allowed: false,
    })
    expect(boundaryScenario!.expected_behavior.join("\n")).toMatch(/record the blocked write as a residual/i)
    expect(boundaryScenario!.forbidden_behavior.join("\n")).toMatch(/git commit|git push|gh pr create|gh pr edit/)
  })

  test("covers mixed GitHub write-boundary cases for existing PR bodies and review-fix persistence", async () => {
    const raw = await readRepoFile("plugins/compound-engineering/skills/lfg/evals/evals.json")
    const suite = JSON.parse(raw) as { evals: Array<LfgEval & { mock_state?: Record<string, unknown> }> }
    const existingPrScenario = suite.evals.find((entry) => entry.id === "existing-pr-body-update-boundary")
    const reviewFixScenario = suite.evals.find((entry) => entry.id === "review-fix-persistence-write-boundary")

    expect(existingPrScenario, "existing PR body-boundary eval should exist").toBeDefined()
    expect(existingPrScenario!.mock_state?.github_write_boundary).toMatchObject({
      commit_allowed: true,
      push_allowed: true,
      draft_pr_allowed: true,
      pr_body_update_allowed: false,
    })
    expect(existingPrScenario!.mock_state?.open_pr).toBe(true)
    expect(existingPrScenario!.expected_behavior.join("\n")).toMatch(/Do not invoke ce-commit-push-pr/i)
    expect(existingPrScenario!.expected_behavior.join("\n")).toMatch(/commit and push remaining scoped changes without editing the PR body/i)
    expect(existingPrScenario!.forbidden_behavior.join("\n")).toMatch(/gh pr edit|ce-commit-push-pr/)

    expect(reviewFixScenario, "review-fix persistence boundary eval should exist").toBeDefined()
    expect(reviewFixScenario!.mock_state?.github_write_boundary).toMatchObject({
      commit_allowed: false,
      push_allowed: false,
    })
    expect(reviewFixScenario!.expected_behavior.join("\n")).toMatch(/read the active ledger's github_write_boundary/i)
    expect(reviewFixScenario!.expected_behavior.join("\n")).toMatch(/do not stage, commit, or push/i)
    expect(reviewFixScenario!.forbidden_behavior.join("\n")).toMatch(/git add|git commit|git push/)
  })

  test("ships with a grader that checks expected and forbidden behavior", async () => {
    const grader = await readRepoFile("plugins/compound-engineering/skills/lfg/evals/grader.md")
    const readme = await readRepoFile("plugins/compound-engineering/skills/lfg/evals/README.md")

    expect(grader).toMatch(/Expected behavior recall/)
    expect(grader).toMatch(/Forbidden behavior check/)
    expect(grader).toMatch(/Boundary preservation/)
    expect(grader).toMatch(/artifacts/)
    expect(grader).toMatch(/overall_passed/)
    expect(readme).toMatch(/skill-creator.*forward-testing/)
    expect(readme).toMatch(/Executable dry-runs/)
    expect(readme).toMatch(/Do not pass the expected behavior or forbidden behavior/)
    expect(readme).toContain("<os-temp>/compound-engineering/lfg/evals/iteration-<N>/")
    expect(readme).toContain("/tmp/compound-engineering/lfg/evals/iteration-<N>/")
    expect(readme).not.toMatch(/%TEMP%|\$env:TEMP/)
  })

  test("executable dry-run composes new draft PR residuals from the LFG ledger handoff", async () => {
    const raw = await readRepoFile("plugins/compound-engineering/skills/lfg/evals/evals.json")
    const lfg = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")
    const commitPushPr = await readRepoFile("plugins/compound-engineering/skills/ce-commit-push-pr/SKILL.md")
    const suite = JSON.parse(raw) as { executable_dry_runs: LfgExecutableDryRun[] }
    const dryRun = suite.executable_dry_runs.find((entry) => entry.id === "no-pr-residual-fallback-to-new-draft-pr")

    expect(dryRun, "no-PR residual dry-run should exist").toBeDefined()
    expect(dryRun!.allow_file_writes).toBe(true)
    expect(dryRun!.fake_commands).toBe(true)
    expect(lfg).toContain("pr_body_sections.residual_review_findings")
    expect(commitPushPr).toMatch(/ledger.*pr_body_sections\.residual_review_findings/is)
    expect(commitPushPr).toMatch(/New PR[\s\S]*verify the composed body includes them before running `gh pr create`/i)

    const workspace = await mkdtemp(path.join(os.tmpdir(), "ce-lfg-dry-run-"))
    try {
      const residualSection = dryRun!.mock_state.ledger_json.pr_body_sections.residual_review_findings
      const ledgerMarkdown = [
        "# LFG Run Ledger",
        "",
        "```json",
        JSON.stringify(dryRun!.mock_state.ledger_json, null, 2),
        "```",
      ].join("\n")
      const fallbackBody = `${residualSection}\n\nSource: no-pr residual dry-run\n`
      const basePrBody = [
        "## Summary",
        "Dry-run draft PR body",
        "---",
        "Generated by Compound Engineering",
      ].join("\n\n")
      const prBody = composeDraftPrBodyFromLedger(basePrBody, ledgerMarkdown)
      const commandLog = [
        `read ${dryRun!.mock_state.ledger_path}`,
        `git add ${dryRun!.mock_state.residual_fallback_path}`,
        'git commit -m "docs(review): record residual review findings"',
        "git push --set-upstream origin HEAD",
        "gh pr create --draft --body-file pr-body.md",
      ]

      await writeWorkspaceFile(workspace, dryRun!.mock_state.residual_fallback_path, fallbackBody)
      await writeWorkspaceFile(workspace, dryRun!.mock_state.ledger_path, ledgerMarkdown)
      await writeWorkspaceFile(workspace, "pr-body.md", prBody)
      await writeWorkspaceFile(workspace, "command-log.json", JSON.stringify(commandLog, null, 2))

      for (const expectedFile of dryRun!.expected_files) {
        const fileContent = await readFile(path.join(workspace, ...expectedFile.split("/")), "utf8")
        expect(fileContent.length).toBeGreaterThan(0)
      }

      const writtenPrBody = await readFile(path.join(workspace, "pr-body.md"), "utf8")
      for (const expected of dryRun!.expected_pr_body_contains) {
        expect(writtenPrBody).toContain(expected)
      }
      for (const forbidden of dryRun!.forbidden_pr_body) {
        expect(writtenPrBody).not.toContain(forbidden)
      }

      const writtenCommandLog = JSON.parse(await readFile(path.join(workspace, "command-log.json"), "utf8")) as string[]
      for (const expectedCommand of dryRun!.expected_command_log_contains) {
        expect(writtenCommandLog).toContain(expectedCommand)
      }
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  test("eval suite files are tracked by git", () => {
    const requiredPaths = [
      "plugins/compound-engineering/skills/lfg/evals/README.md",
      "plugins/compound-engineering/skills/lfg/evals/evals.json",
      "plugins/compound-engineering/skills/lfg/evals/grader.md",
      "tests/lfg-skill-eval-contract.test.ts",
    ]

    const tracked = execFileSync("git", ["ls-files", "--", ...requiredPaths], {
      cwd: process.cwd(),
      encoding: "utf8",
    })
      .split(/\r?\n/)
      .filter(Boolean)

    for (const requiredPath of requiredPaths) {
      expect(tracked).toContain(requiredPath)
    }
  })
})
