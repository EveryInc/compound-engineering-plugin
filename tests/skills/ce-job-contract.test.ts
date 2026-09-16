import { accessSync, constants, readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8")
}

const skill = readRepoFile("skills/ce-job/SKILL.md")
const guardedStart = readRepoFile("skills/ce-job/references/guarded-start.md")
const jobIndex = readRepoFile("skills/ce-job/references/job-index.md")
const feedback = readRepoFile("skills/ce-job/references/feedback.md")
const herdr = readRepoFile("skills/ce-job/references/herdr-control.md")
const operator = readRepoFile("skills/ce-job/references/operator.md")

describe("ce-job guarded orchestration contract", () => {
  test("owns job state and leaves implementation and shipping to sibling skills", () => {
    expect(skill).toContain("**Result:**")
    expect(skill).toContain("**Next consumer:**")
    expect(skill).toContain("**Done:**")
    expect(skill).toContain("**Boundary:**")
    expect(skill).toContain("does not implement product changes, commit, push, open PRs, merge, deploy")
    expect(skill).toContain("`ce-plan`")
    expect(skill).toContain("`ce-work`")
    expect(skill).toContain("`ce-code-review`")
    expect(skill).toContain("`ce-doc-review`")
  })

  test("uses a deterministic helper for repeatable ledger mechanics", () => {
    expect(skill).toContain("## Deterministic helper")
    expect(skill).toContain("run its bundled helper from that anchor")
    expect(skill).toContain("Do not run `scripts/ce-job` relative to the user's working directory")
    expect(skill).toContain("`root`, `start`, `list`, `queue`, `status`, `feedback`")
    expect(skill).toContain("`receipt`, `prove`, `pause`, `resume`, `ready`, `done`, `attach`, `live-status`, `heartbeat`, `operator-status`, and `next`")
    expect(skill).toContain("append-only event logging")
    expect(skill).toContain("Prefer the helper over hand-editing")
    accessSync(path.join(process.cwd(), "skills/ce-job/scripts/ce-job"), constants.X_OK)
  })

  test("ledger schema carries guarded state, test requests, live control, and evidence", () => {
    for (const token of ["draft", "active", "blocked", "paused", "ready-for-work", "needs-review", "complete"]) {
      expect(skill).toContain(token)
    }
    for (const section of [
      "## Kickoff",
      "## Test requests",
      "## Evidence",
      "## Reviews",
      "## Live control",
      "## Done criteria",
    ]) {
      expect(skill).toContain(section)
    }
    expect(skill).toContain("each done criterion and test request is either proven by evidence")
  })

  test("guarded start aligns, routes through ce-plan, and requires ce-doc-review before work readiness", () => {
    expect(skill).toContain("read `references/guarded-start.md`")
    expect(guardedStart).toContain("Context pass")
    expect(guardedStart).toContain("Ask only material questions")
    expect(guardedStart).toContain("Invoke `ce-plan` through the host's normal skill-invocation mechanism")
    expect(guardedStart).toContain("job:<ledger>")
    expect(guardedStart).toContain("mandatory `ce-doc-review` phase")
    expect(guardedStart).toContain("A guarded job becomes `ready-for-work` only after")
    expect(guardedStart).toContain("skill_unreachable")
  })

  test("operator coordinates users, ledgers, specialist skills, and workers without becoming the worker", () => {
    expect(skill).toContain("### `operator`")
    expect(skill).toContain("Read `references/operator.md`")
    expect(operator).toContain("The operator is the user's control surface for the job")
    expect(operator).toContain("It does not become the implementation worker")
    expect(operator).toContain("Update durable state before sending prompts to workers")
    expect(operator).toContain("`ce-plan job:<ledger> ...`")
    expect(operator).toContain("`ce-work job:<ledger> <plan-or-brief>`")
    expect(operator).toContain("worker says done, but ledger still lacks test evidence")
    expect(operator).toContain("Use `scripts/ce-job done <job> --message ...` only when the evidence supports closure")
  })

  test("list and status derive from durable ledger state and never live-agent done alone", () => {
    expect(skill).toContain("Read `references/job-index.md`")
    expect(jobIndex).toContain("Classify from durable ledger state first")
    expect(jobIndex).toContain("needs plan review")
    expect(jobIndex).toContain("needs evidence")
    expect(jobIndex).toContain("needs review")
    expect(jobIndex).toContain("A live agent in `done` means ready for input, not that the job is done")
  })

  test("feedback and test requests are durable before live delivery", () => {
    expect(skill).toContain("Read `references/feedback.md`")
    expect(feedback).toContain("Write the ledger update before any live Herdr prompt")
    expect(feedback).toContain("A `test` action creates an evidence requirement")
    expect(feedback).toContain("The next worker must either satisfy the request and add evidence, or record why it is blocked")
    expect(feedback).toContain("After the durable update, live delivery is allowed only")
  })

  test("Herdr live control is optional, gated, explicit-targeted, and local-state backed", () => {
    expect(skill).toContain("Read `references/herdr-control.md`")
    expect(herdr).toContain("test \"${HERDR_ENV:-}\" = 1")
    expect(herdr).toContain("If this fails, do not run Herdr commands")
    expect(herdr).toContain("Never rely on another client's focused pane")
    expect(herdr).toContain("`.context/compound-engineering/jobs/<job_id>.json`")
    expect(herdr).toContain("`blocked` means inspect before sending input")
    expect(herdr).toContain("herdr agent send-keys <target> ctrl+c")
  })
})

describe("job ledger context carriers", () => {
  test("ce-plan accepts job ledger context and carries doc-review receipts back", () => {
    const plan = readRepoFile("skills/ce-plan/SKILL.md")
    const outputMode = readRepoFile("skills/ce-plan/references/output-mode.md")
    const handoff = readRepoFile("skills/ce-plan/references/plan-handoff.md")

    expect(plan).toContain("job:<ledger>")
    expect(plan).toContain("After writing and reviewing the plan, append the plan path")
    expect(outputMode).toContain("`job:<repo-relative-ledger>` context carrier")
    expect(handoff).toContain("include that ledger path in the `ce-doc-review` invocation as `job:<ledger>`")
    expect(handoff).toContain("pass `job:<ledger>` too")
  })

  test("ce-doc-review accepts job context and records skipped or completed review state", () => {
    const docReview = readRepoFile("skills/ce-doc-review/SKILL.md")
    const modes = readRepoFile("skills/ce-doc-review/references/modes.md")

    expect(docReview).toContain("job:<ledger>")
    expect(docReview).toContain("append fixes applied, proposed fixes, decisions, FYIs, blockers")
    expect(docReview).toContain("If review cannot start, record that skipped state")
    expect(modes).toContain("`job:<repo-relative-ledger>` context carrier")
  })

  test("ce-work and ce-code-review consume job ledgers without creating them", () => {
    const work = readRepoFile("skills/ce-work/SKILL.md")
    const workTriage = readRepoFile("skills/ce-work/references/input-triage.md")
    const codeReview = readRepoFile("skills/ce-code-review/SKILL.md")
    const reviewModes = readRepoFile("skills/ce-code-review/references/modes-and-output.md")

    expect(work).toContain("job:<ledger>")
    expect(work).toContain("Do not create a job ledger from this skill")
    expect(workTriage).toContain("`job:<repo-relative-ledger>` token")
    expect(codeReview).toContain("Do not create a job ledger here")
    expect(reviewModes).toContain("`job:<path>`")
  })
})
