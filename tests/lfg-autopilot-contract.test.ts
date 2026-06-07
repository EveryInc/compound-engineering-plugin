import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("lfg plan-bounded autopilot contract", () => {
  test("accepts plan paths and resume signals before invoking ce-plan", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")

    expect(content).toContain("plan path")
    expect(content).toMatch(/resume signal|resume/i)
    expect(content).toMatch(/existing plan/i)
    expect(content).toMatch(/If no plan path/i)
  })

  test("creates and updates a repo-safe run ledger", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")
    const ledger = await readRepoFile("plugins/compound-engineering/skills/lfg/references/run-ledger.md")

    expect(content).toContain("references/run-ledger.md")
    expect(content).toMatch(/before implementation/i)
    expect(content).toMatch(/current phase|next action/i)
    expect(ledger).toContain(".context/compound-engineering/autopilot-runs/<run-id>/")
    expect(ledger).toContain("<os-temp>/compound-engineering/lfg/<run-id>/")
    expect(ledger).toContain("/tmp/compound-engineering/lfg/<run-id>/")
    expect(ledger).toMatch(/Skills authored here assume Unix-like shells|native Windows is not a current target/i)
    expect(ledger).not.toMatch(/%TEMP%|\$env:TEMP/)
    expect(ledger).not.toMatch(/Do not hard-code `\/tmp` on Windows/)
    expect(ledger).toMatch(/ignored or explicitly allowed/i)
    for (const field of [
      "ledger_path",
      "repo_root",
      "repo_remote",
      "plan_path",
      "branch",
      "head_sha",
      "current_phase",
      "retry_counters",
      "last_verification",
      "open_residuals",
      "escalation_state",
      "next_action",
    ]) {
      expect(ledger).toContain(field)
    }
    expect(ledger).toMatch(/repo identity/i)
    expect(ledger).toMatch(/git rev-parse --show-toplevel/)
    expect(ledger).toMatch(/git remote get-url origin/)
    expect(ledger).toMatch(/Match repo identity first/i)
    expect(content).toMatch(/repo root, repo remote/i)
  })

  test("requires a concrete Autopilot Run Contract section before implementation", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")

    expect(content).toMatch(/actual `## Autopilot Run Contract` section/)
    expect(content).toMatch(/Implied permission is not enough/i)
    expect(content).toMatch(/re-invoke `ce-plan`.*hands-off\/autopilot context/i)
    expect(content).toMatch(/stop before implementation.*missing contract/i)
    expect(content).not.toContain("contains or implies an Autopilot Run Contract")
  })

  test("enforces the GitHub write boundary before commit, push, PR, and CI writes", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")
    const ledger = await readRepoFile("plugins/compound-engineering/skills/lfg/references/run-ledger.md")
    const docs = await readRepoFile("docs/skills/lfg.md")
    const boundaryIndex = content.indexOf("github_write_boundary")
    const residualIndex = content.indexOf("Autonomous residual handoff")
    const shippingIndex = content.indexOf("Invoke `ce-commit-push-pr` in draft mode")
    const ciIndex = content.indexOf("CI watch and autofix loop")

    expect(boundaryIndex, "LFG should parse and record github_write_boundary during the plan gate").toBeGreaterThan(-1)
    expect(residualIndex).toBeGreaterThan(boundaryIndex)
    expect(shippingIndex).toBeGreaterThan(boundaryIndex)
    expect(ciIndex).toBeGreaterThan(boundaryIndex)
    expect(content).toMatch(/If `github_write_boundary\.commit_allowed` is false, do not run `git commit`/i)
    expect(content).toMatch(/If `github_write_boundary\.push_allowed` is false, do not run `git push`/i)
    expect(content).toMatch(/If `github_write_boundary\.draft_pr_allowed` is false, do not invoke `ce-commit-push-pr`/i)
    expect(content).toMatch(/If `github_write_boundary\.pr_body_update_allowed` is false, do not run `gh pr edit`/i)
    expect(content).toMatch(/record the blocked write as a residual/i)
    expect(ledger).toContain("github_write_boundary")
    expect(ledger).toContain("commit_allowed")
    expect(ledger).toContain("push_allowed")
    expect(ledger).toContain("draft_pr_allowed")
    expect(ledger).toContain("pr_body_update_allowed")
    expect(docs).toMatch(/enforces the contract's GitHub write boundary/i)
  })

  test("does not invoke ce-commit-push-pr when an existing PR body update is forbidden", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")
    const shippingIndex = content.indexOf("Invoke `ce-commit-push-pr` in draft mode")
    const shippingSection = content.slice(shippingIndex)

    expect(shippingIndex).toBeGreaterThan(-1)
    expect(shippingSection).toMatch(/open PR exists/i)
    expect(shippingSection).toMatch(/`github_write_boundary\.pr_body_update_allowed` is false/i)
    expect(shippingSection).toMatch(/do not invoke `ce-commit-push-pr`/i)
    expect(shippingSection).toMatch(/would update the existing PR body with `gh pr edit`/i)
    expect(shippingSection).toMatch(/commit and push remaining scoped changes without editing the PR body/i)
  })

  test("points to a concrete skill-creator eval suite for live autopilot scenarios", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")
    const ledger = await readRepoFile("plugins/compound-engineering/skills/lfg/references/run-ledger.md")
    const evals = await readRepoFile("plugins/compound-engineering/skills/lfg/evals/evals.json")

    expect(evals).toMatch(/skill-creator/i)
    expect(evals).toMatch(/plan-path-autopilot-run/i)
    expect(evals).toMatch(/resume-after-interruption/i)
    expect(evals).toMatch(/review-loop-cap/i)
    expect(evals).toMatch(/draft-pr-existing-pr-no-prompt/i)
    expect(evals).toMatch(/review-noncomplete-hard-stop/i)
    expect(evals).toMatch(/existing-pr-preserve-residual-sections/i)
    expect(evals).toMatch(/github-write-boundary-blocks-shipping/i)
    expect(content).toMatch(/Existing plan path.*Do not invoke `ce-plan`/s)
    expect(content).toMatch(/Resume signal.*current_phase.*next_action/s)
    expect(ledger).toMatch(/When a user message is only context.*keep `next_action` moving/)
    expect(content).toMatch(/3 review iterations/i)
    expect(content).toContain("draft:true autopilot:true plan:<plan-path> ledger:<ledger-path>")
  })
})
