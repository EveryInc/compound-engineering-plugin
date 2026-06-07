import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-work Autopilot Run Contract", () => {
  test("stable ce-work carries run-contract escalation rules into execution", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    expect(content).toContain("Autopilot Run Contract")
    expect(content).toMatch(/allowed actions/i)
    expect(content).toMatch(/forbidden actions/i)
    expect(content).toMatch(/escalation triggers/i)
    expect(content).toMatch(/Evidence-research triggers|evidence-research triggers/i)
    expect(content).toMatch(/fast-moving technical decisions/i)
    expect(content).toMatch(/assumption|residual/i)
  })

  test("ce-work-beta mirrors run-contract escalation rules", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/SKILL.md")

    expect(content).toContain("Autopilot Run Contract")
    expect(content).toMatch(/allowed actions/i)
    expect(content).toMatch(/forbidden actions/i)
    expect(content).toMatch(/escalation triggers/i)
    expect(content).toMatch(/Evidence-research triggers|evidence-research triggers/i)
    expect(content).toMatch(/fast-moving technical decisions/i)
    expect(content).toMatch(/assumption|residual/i)
  })

  test("ce-work and ce-work-beta parse implementation-only autopilot caller tokens", async () => {
    for (const skillPath of [
      "plugins/compound-engineering/skills/ce-work/SKILL.md",
      "plugins/compound-engineering/skills/ce-work-beta/SKILL.md",
    ]) {
      const content = await readRepoFile(skillPath)

      expect(content).toContain("autopilot:true")
      expect(content).toContain("implementation-only:true")
      expect(content).toContain("plan:<path>")
      expect(content).toContain("ledger:<path>")
      expect(content).toMatch(/literal-prefix|literal prefix/i)
      expect(content).toMatch(/autopilot_context/)
      expect(content).toMatch(/implementation_only/)
      expect(content).toMatch(/caller_plan_path/)
      expect(content).toMatch(/caller_ledger_path/)
    }
  })

  test("implementation-only autopilot continues on feature branch and returns before shipping", async () => {
    for (const skillPath of [
      "plugins/compound-engineering/skills/ce-work/SKILL.md",
      "plugins/compound-engineering/skills/ce-work-beta/SKILL.md",
    ]) {
      const content = await readRepoFile(skillPath)

      expect(content).toMatch(/continue automatically on the current feature branch/i)
      expect(content).toMatch(/record a rename suggestion/i)
      expect(content).toMatch(/do not prompt/i)
      expect(content).toMatch(/stop before the shipping workflow/i)
      expect(content).toMatch(/return control to the caller/i)
      expect(content).toMatch(/Do not enter `references\/shipping-workflow\.md`/i)
      expect(content).toMatch(/do not invoke `ce-code-review`/i)
      expect(content).toMatch(/do not invoke `ce-commit-push-pr`/i)
    }
  })

  test("implementation-only autopilot suppresses all pre-return commit paths", async () => {
    for (const skillPath of [
      "plugins/compound-engineering/skills/ce-work/SKILL.md",
      "plugins/compound-engineering/skills/ce-work-beta/SKILL.md",
    ]) {
      const content = await readRepoFile(skillPath)
      const overrideIndex = content.indexOf("Implementation-only override")
      const worktreeCommitIndex = content.indexOf("After all parallel subagents in a batch complete (worktree-isolated mode)")
      const incrementalIndex = content.indexOf("2. **Incremental Commits**")
      const skipIncrementalIndex = content.indexOf("skip incremental commits entirely")
      const shippingReturnIndex = content.indexOf("stop before the shipping workflow")

      expect(overrideIndex, `${skillPath} should define an implementation-only override before commit paths`).toBeGreaterThan(-1)
      expect(worktreeCommitIndex, `${skillPath} should still document worktree commit mode for normal runs`).toBeGreaterThan(-1)
      expect(incrementalIndex, `${skillPath} should still document incremental commits for normal runs`).toBeGreaterThan(-1)
      expect(skipIncrementalIndex, `${skillPath} should explicitly skip incremental commits`).toBeGreaterThan(-1)
      expect(overrideIndex, `${skillPath} override must appear before worktree commit/merge instructions`).toBeLessThan(worktreeCommitIndex)
      expect(skipIncrementalIndex, `${skillPath} incremental skip must appear inside the incremental commit section`).toBeGreaterThan(incrementalIndex)
      expect(skipIncrementalIndex, `${skillPath} incremental skip must appear before the shipping return`).toBeLessThan(shippingReturnIndex)
      expect(content).toMatch(/Force all subagents(?: and Codex delegates)? into no-git mode/i)
      expect(content).toMatch(/Do not stage files \(`git add`\), create commits, push, or open PRs/i)
      expect(content).toMatch(/neither subagents nor the orchestrator commit/i)
    }
  })

  test("ce-work-beta delegation preserves implementation-only commit ownership", async () => {
    const workflow = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/references/codex-delegation-workflow.md")
    const classificationIndex = workflow.indexOf("Result classification")
    const commitOnSuccessIndex = workflow.indexOf("Commit on success")

    expect(workflow).toMatch(/implementation_only=true/)
    expect(workflow).toMatch(/delegates must not stage, commit, push, or open PRs/i)
    expect(workflow).toMatch(/completed.*without staging or committing/is)
    expect(workflow).toMatch(/Skip this entire commit step when `implementation_only=true`/i)
    expect(classificationIndex).toBeGreaterThan(-1)
    expect(commitOnSuccessIndex).toBeGreaterThan(classificationIndex)
  })

  test("lfg invokes ce-work as implementation-only with plan and ledger context", async () => {
    const lfg = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")
    const evals = await readRepoFile("plugins/compound-engineering/skills/lfg/evals/evals.json")

    expect(lfg).toContain("autopilot:true implementation-only:true plan:<plan-path> ledger:<ledger-path>")
    expect(lfg).toMatch(/execute implementation and verification only/i)
    expect(lfg).toMatch(/return control to LFG before its own shipping workflow/i)
    expect(evals).toContain("autopilot:true implementation-only:true plan:<plan-path> ledger:<ledger-path>")
  })
})
