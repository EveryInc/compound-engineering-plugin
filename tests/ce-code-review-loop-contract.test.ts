import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "fs/promises"
import os from "os"
import path from "path"

// Real git commits and pre-commit hooks contend with the suite's parallel
// subprocess load; preserve the executable coverage with the repo-standard
// bound used by other subprocess-heavy test files.
setDefaultTimeout(30_000)

const skillPath = path.join(process.cwd(), "skills/ce-code-review-loop/SKILL.md")
const protocolPath = path.join(process.cwd(), "skills/ce-code-review-loop/references/loop-protocol.md")
const helperPath = path.join(process.cwd(), "skills/ce-code-review-loop/scripts/loop-state.mjs")
const neutralGitConfig = path.join(os.tmpdir(), `ce-loop-neutral-git-${crypto.randomUUID()}`)
const tempRoots: string[] = []

type RepoFixture = {
  repo: string
  baseSha: string
  headSha: string
  activePath: string
  unrelatedPath: string
}

async function run(
  command: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(command, {
    cwd,
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: neutralGitConfig,
      GIT_CONFIG_NOSYSTEM: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stdout, stderr }
}

async function git(repo: string, ...args: string[]): Promise<string> {
  const result = await run(["git", ...args], repo)
  expect(result.code, result.stderr).toBe(0)
  return result.stdout.trim()
}

async function createRepo(): Promise<RepoFixture> {
  const repo = await mkdtemp(path.join(os.tmpdir(), "ce-review-loop-"))
  tempRoots.push(repo)
  await git(repo, "init", "-b", "main")
  await git(repo, "config", "user.name", "Loop Contract")
  await git(repo, "config", "user.email", "loop@example.invalid")
  await git(repo, "config", "commit.gpgsign", "false")

  const activePath = path.join(repo, "active.txt")
  const unrelatedPath = path.join(repo, "unrelated.txt")
  await writeFile(activePath, "value=bad\n")
  await writeFile(unrelatedPath, "owner=user\n")
  await git(repo, "add", "active.txt", "unrelated.txt")
  await git(repo, "commit", "-m", "base")
  const baseSha = await git(repo, "rev-parse", "HEAD")

  await writeFile(path.join(repo, "history.txt"), "second commit\n")
  await git(repo, "add", "history.txt")
  await git(repo, "commit", "-m", "head")
  const headSha = await git(repo, "rev-parse", "HEAD")
  return { repo, baseSha, headSha, activePath, unrelatedPath }
}

async function createDivergedRepo() {
  const fixture = await createRepo()
  const forkSha = fixture.headSha

  await git(fixture.repo, "checkout", "-b", "feature")
  await writeFile(path.join(fixture.repo, "feature.txt"), "feature work\n")
  await git(fixture.repo, "add", "feature.txt")
  await git(fixture.repo, "commit", "-m", "feature work")
  const featureSha = await git(fixture.repo, "rev-parse", "HEAD")

  await git(fixture.repo, "checkout", "main")
  await writeFile(path.join(fixture.repo, "base-advance.txt"), "base branch advanced\n")
  await git(fixture.repo, "add", "base-advance.txt")
  await git(fixture.repo, "commit", "-m", "advance base")
  const baseTipSha = await git(fixture.repo, "rev-parse", "HEAD")
  await git(fixture.repo, "checkout", "feature")

  return { ...fixture, forkSha, featureSha, baseTipSha }
}

async function helper(repo: string, ...args: string[]): Promise<Record<string, any>> {
  const result = await run(["node", helperPath, ...args], repo)
  expect(result.stdout.trim().split("\n")).toHaveLength(1)
  return JSON.parse(result.stdout)
}

function finding(id: number, overrides: Record<string, any> = {}) {
  return {
    "#": id,
    title: `Finding ${id}`,
    severity: "P1",
    file: "active.txt",
    line: 1,
    confidence: 100,
    autofix_class: "gated_auto",
    owner: "downstream-resolver",
    requires_verification: true,
    pre_existing: false,
    suggested_fix: "Correct the defect.",
    first_evidence: "value=active",
    why_it_matters: "The behavior is incorrect.",
    evidence: ["value=active"],
    reviewers: ["correctness"],
    independent_reviewers: ["correctness"],
    ...overrides,
  }
}

function validReview(fixture: RepoFixture, overrides: Record<string, any> = {}) {
  const { review_receipt: receiptOverrides, ...topLevelOverrides } = overrides
  const receipt = {
    base_sha: fixture.baseSha,
    head_sha: fixture.headSha,
    branch: "main",
    selected_reviewers: ["correctness"],
    required_reviewers: ["correctness"],
    completed_reviewers: ["correctness"],
    failed_reviewers: [],
    terminal_status: "complete",
    ...receiptOverrides,
  }
  return {
    status: "complete",
    verdict: "Ready to merge",
    findings: [],
    actionable_findings: [],
    triage_groups: [],
    ...topLevelOverrides,
    review_receipt: receipt,
  }
}

async function writeValidationFiles(
  fixture: RepoFixture,
  review: Record<string, any>,
): Promise<{ expectedPath: string; reviewPath: string }> {
  const expectedPath = path.join(os.tmpdir(), `ce-loop-expected-${crypto.randomUUID()}.json`)
  const reviewPath = path.join(os.tmpdir(), `ce-loop-review-${crypto.randomUUID()}.json`)
  tempRoots.push(expectedPath, reviewPath)
  await writeFile(expectedPath, JSON.stringify({
    branch: "main",
    base_sha: fixture.baseSha,
    head_sha: fixture.headSha,
  }))
  await writeFile(reviewPath, JSON.stringify(review))
  return { expectedPath, reviewPath }
}

async function writeCycleFiles(paths: string[], verification: Record<string, any>) {
  const statePath = path.join(os.tmpdir(), `ce-loop-state-${crypto.randomUUID()}.json`)
  const pathsPath = path.join(os.tmpdir(), `ce-loop-paths-${crypto.randomUUID()}.json`)
  const verificationPath = path.join(os.tmpdir(), `ce-loop-verification-${crypto.randomUUID()}.json`)
  tempRoots.push(statePath, pathsPath, verificationPath)
  await writeFile(pathsPath, JSON.stringify(paths))
  await writeFile(verificationPath, JSON.stringify(verification))
  return { statePath, pathsPath, verificationPath }
}

async function installPreCommitHook(fixture: RepoFixture, body: string) {
  const hookPath = path.join(fixture.repo, ".git/hooks/pre-commit")
  await writeFile(hookPath, `#!/bin/sh\nset -eu\n${body}\n`)
  await chmod(hookPath, 0o755)
}


afterAll(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  await rm(neutralGitConfig, { force: true })
})

function section(body: string, start: string, end: string): string {
  const from = body.indexOf(start)
  const to = body.indexOf(end, from + start.length)
  expect(from, `missing section start: ${start}`).toBeGreaterThanOrEqual(0)
  expect(to, `missing section end: ${end}`).toBeGreaterThan(from)
  return body.slice(from, to)
}

describe("ce-code-review-loop contract", () => {
  test("delegates every global wave to canonical full ce-code-review", async () => {
    const skill = await readFile(skillPath, "utf8")
    const workflow = section(skill, "## Workflow", "## Authority and Interaction")

    expect(skill).toContain("name: ce-code-review-loop")
    expect(skill).toContain("REQUIRED SUB-SKILL")
    expect(workflow).toContain("callable skill mechanism")
    expect(workflow).toContain("mode:agent")
    expect(workflow).toContain("depth:full")
    expect(workflow).toContain("grouping:auto")
    expect(workflow).toContain("base:<resolved-base-sha>")
    expect(workflow).toContain("not a substitute")
    expect(workflow).not.toContain("apply:local")
  })

  test("restricts mutation to a clean current local branch", async () => {
    const skill = await readFile(skillPath, "utf8")
    const input = section(skill, "## Input and Preflight", "## Workflow")
    const authority = section(skill, "## Authority and Interaction", "## Circuit Breaker")

    for (const state of ["staged", "unstaged", "untracked"]) {
      expect(input).toContain(state)
    }
    expect(input).toContain("current local branch")
    expect(input).toContain("detached HEAD")
    for (const rejected of ["PR number", "PR URL", "branch target"]) {
      expect(input).toContain(rejected)
    }

    for (const forbidden of ["push", "rebase", "worktree", "check out", "amend", "squash"]) {
      expect(authority).toContain(forbidden)
    }
    expect(authority).toContain("local commit")
    expect(authority).toContain("fix(review):")
  })
  test("uses the bundled deterministic helper for preflight and review validation", async () => {
    const skill = await readFile(skillPath, "utf8")
    const protocol = await readFile(protocolPath, "utf8")

    for (const document of [skill, protocol]) {
      expect(document).toContain('$SKILL_DIR/scripts/loop-state.mjs')
      expect(document).toContain("preflight --repo <path> --base <ref>")
      expect(document).toContain("validate-review --repo <path> --expected <json-file> --review <json-file>")
      expect(document).toContain("validate-final --repo <path> --expected <json-file> --review <json-file>")
    }
    expect(protocol).toMatch(/do not improvise|instead of improvising/i)
  })

  test("resolves and freezes the diff merge base for every wave", async () => {
    const skill = await readFile(skillPath, "utf8")
    const protocol = await readFile(protocolPath, "utf8")
    const preflight = section(protocol, "## Preflight", "## Canonical Review Wave")

    expect(skill).toContain("base:<ref>")
    expect(skill).toContain("git merge-base HEAD <resolved-ref>")
    expect(skill).toContain("missing merge base")
    expect(skill).toContain("invalid_base")
    expect(preflight).toContain("<ref>^{commit}")
    expect(preflight).toContain("git merge-base HEAD <resolved-ref>")
    expect(preflight).toContain("concrete merge-base SHA")
    expect(preflight).toContain("direct SHA")
    expect(preflight).toContain("starting HEAD")
    expect(preflight).toContain("branch")
    expect(preflight).toMatch(/same.*diff base|diff base.*every.*wave/i)
  })

  test("keeps starting HEAD immutable while refreshing expected HEAD before every wave", async () => {
    const skill = await readFile(skillPath, "utf8")
    const protocol = await readFile(protocolPath, "utf8")
    const preflight = section(protocol, "## Preflight", "## Canonical Review Wave")
    const wave = section(protocol, "## Canonical Review Wave", "## Finding Revalidation")

    expect(preflight).toMatch(/starting HEAD[\s\S]*(?:immutable|never overwrite)/i)
    expect(wave).toMatch(/(?:rewrite|refresh|generate|write)[\s\S]*expected JSON[\s\S]*current checkpoint HEAD/i)
    expect(wave).toMatch(/before every canonical review|before invoking.*canonical/i)
    expect(skill).toMatch(/per-wave expected JSON[\s\S]*current checkpoint HEAD/i)
    expect(skill).toMatch(/starting HEAD[\s\S]*(?:immutable|never overwrite)/i)
  })


  test("consumes canonical required-reviewer coverage without guessing", async () => {
    const protocol = await readFile(protocolPath, "utf8")
    const review = section(protocol, "## Canonical Review Wave", "## Finding Revalidation")

    for (const field of [
      "base_sha",
      "head_sha",
      "branch",
      "selected_reviewers",
      "required_reviewers",
      "completed_reviewers",
      "failed_reviewers",
      "terminal_status",
    ]) {
      expect(review).toContain(field)
    }
    expect(review).toMatch(/required_reviewers[\s\S]*verbatim/)
    expect(review).toMatch(/never infer|requiredness.*not.*infer/i)
    expect(review).toContain("malformed")
    expect(review).toContain("coverage gap")
    expect(review).toContain("working tree")
  })

  test("documents canonical roster relationship validation", async () => {
    const protocol = await readFile(protocolPath, "utf8")
    const review = section(protocol, "## Canonical Review Wave", "## Finding Revalidation")

    expect(review).toMatch(/unique[\s\S]*selected_reviewers[\s\S]*required_reviewers[\s\S]*completed_reviewers/i)
    expect(review).toMatch(/required[\s\S]*completed[\s\S]*failed[\s\S]*subset[\s\S]*selected/i)
    expect(review).toMatch(/exactly one terminal outcome/i)
    expect(review).toMatch(/completed[\s\S]*failed[\s\S]*(?:overlap|disjoint)/i)
    expect(review).toMatch(/failure\.required[\s\S]*membership[\s\S]*required_reviewers/i)
  })


  test("revalidates finding identity before mutation", async () => {
    const protocol = await readFile(protocolPath, "utf8")
    const findings = section(protocol, "## Finding Revalidation", "## Remediation Cycle")

    for (const field of ["stable `#`", "file", "line", "evidence", "why_it_matters", "autofix_class", "owner"]) {
      expect(findings).toContain(field)
    }
    expect(findings).toContain("current HEAD")
    expect(findings).toContain("stale")
    expect(findings).toContain("actionable_findings")
    expect(findings).toContain("triage_groups")
    expect(findings).toContain("intersect")
    expect(findings).not.toMatch(/For every queued finding require[^\n]*\broute\b/i)
  })

  test("fixes only mechanical findings and blocks semantic decisions", async () => {
    const protocol = await readFile(protocolPath, "utf8")
    const findings = section(protocol, "## Finding Revalidation", "## Remediation Cycle")
    const authority = section(
      await readFile(skillPath, "utf8"),
      "## Authority and Interaction",
      "## Circuit Breaker",
    )

    expect(findings).toContain("mechanical")
    expect(findings).toContain("decision-bearing")
    expect(findings).toMatch(/product|design/)
    expect(findings).toMatch(/compatibility|migration|rollout/)
    expect(findings).toContain("blocker")
    expect(authority).toMatch(/never guess|do not guess/)
    expect(authority).toContain("Non-converged")
  })

  test("never resolves a decision-bearing finding inside the invocation", async () => {
    const skill = await readFile(skillPath, "utf8")
    const protocol = await readFile(protocolPath, "utf8")

    for (const document of [skill, protocol]) {
      expect(document).toContain("A decision-bearing finding is never resolved inside this invocation.")
      expect(document).toMatch(/decision outside this invocation[\s\S]*rerun/i)
      expect(document).toMatch(/never turns?[\s\S]*automatic repair authority/i)
    }
    expect(skill).not.toMatch(/Ask only when a decision-bearing blocker/i)
  })

  test("remediates bounded independent mechanical families before returning a decision blocker", async () => {
    const skill = await readFile(skillPath, "utf8")
    const protocol = await readFile(protocolPath, "utf8")
    const workflow = section(skill, "## Workflow", "## Authority and Interaction")
    const findings = section(protocol, "## Finding Revalidation", "## Remediation Cycle")

    expect(workflow).toMatch(/partition[\s\S]*independent mechanical families[\s\S]*Non-converged/i)
    expect(findings).toMatch(/partition[\s\S]*all independent mechanical families[\s\S]*decision-bearing blocker/i)
    expect(findings).toMatch(/scope[\s\S]*budget|budget[\s\S]*scope/i)
    expect(findings).toMatch(/never (?:guess|converge)[\s\S]*blocker/i)
  })

  test("treats each defect family as one verified local commit", async () => {
    const protocol = await readFile(protocolPath, "utf8")
    const remediation = section(protocol, "## Remediation Cycle", "## Non-convergence")

    for (const evidence of [
      "checkpoint HEAD",
      "touched paths",
      "verification plan",
      "complete cycle diff",
      "fix(review):",
      "one local commit",
    ]) {
      expect(remediation).toContain(evidence)
    }
    expect(remediation).toMatch(/targeted verification|blast radius/)
    expect(remediation).toContain("concurrent")
    expect(remediation).toMatch(/preserve.*stop|stop.*preserve/i)
    expect(remediation).toMatch(/revert only|restore only/)
  })

  test("routes remediation checkpoints, restores, and commits through the helper", async () => {
    const skill = await readFile(skillPath, "utf8")
    const protocol = await readFile(protocolPath, "utf8")

    for (const command of ["cycle-checkpoint", "cycle-restore", "cycle-commit"]) {
      expect(skill).toContain(command)
      expect(protocol).toContain(command)
    }
    expect(protocol).toMatch(/Do not improvise|only through these helper commands/i)
    expect(protocol).not.toContain("git reset --hard")
    expect(protocol).not.toContain("git checkout --")
  })

  test("requires staged-byte and post-commit tree integrity checks", async () => {
    const skill = await readFile(skillPath, "utf8")
    const protocol = await readFile(protocolPath, "utf8")
    const remediation = section(protocol, "## Remediation Cycle", "## Non-convergence")

    expect(remediation).toContain("verified staged snapshot")
    expect(remediation).toMatch(/existence[\s\S]*(?:bytes|blob digest)[\s\S]*(?:executable|tree mode)/i)
    expect(remediation).toMatch(/parent[\s\S]*checkpoint HEAD/i)
    expect(remediation).toMatch(/commit diff path set[\s\S]*intended paths/i)
    expect(remediation).toMatch(/committed[\s\S]*(?:bytes|blob digest)[\s\S]*mode[\s\S]*staged snapshot/i)
    expect(remediation).toContain("commit_integrity_failure")
    expect(remediation).toMatch(/preserve[\s\S]*(?:commit|history|bytes)[\s\S]*Non-converged/i)
    expect(skill).toContain("commit_integrity_failure")
  })


  test("detects oscillation without confusing progressive repair", async () => {
    const protocol = await readFile(protocolPath, "utf8")
    const nonConvergence = section(protocol, "## Non-convergence", "## Final Convergence Gate")

    for (const signal of ["reappears", "alternate", "sibling", "contradict", "trajectory"]) {
      expect(nonConvergence).toContain(signal)
    }
    expect(nonConvergence).toContain("Progressive failure migration")
    expect(nonConvergence).toContain("ordinary progress")
    expect(nonConvergence).toContain("Non-converged")
  })

  test("invalidates all convergence evidence after any remediation commit", async () => {
    const skill = await readFile(skillPath, "utf8")
    const protocol = await readFile(protocolPath, "utf8")

    expect(skill).toMatch(/Any remediation commit[\s\S]*fresh canonical/)
    expect(protocol).toMatch(/Any remediation commit[\s\S]*invalidates/)
    expect(protocol).toMatch(/finding count|declining finding/)
    expect(protocol).toMatch(/tests.*not convergence|passing tests.*not convergence/i)
  })

  test("requires a ready-to-merge full review of the unchanged final HEAD", async () => {
    const protocol = await readFile(protocolPath, "utf8")
    const gate = section(protocol, "## Final Convergence Gate", "## Quick Reference")

    for (const condition of [
      "mode:agent",
      "depth:full",
      "status: complete",
      "Ready to merge",
      "actionable_findings",
      "required_reviewers",
      "final project verification",
      "working tree",
      "final HEAD",
    ]) {
      expect(gate).toContain(condition)
    }
    expect(gate).toMatch(/actionable_findings[\s\S]*empty|empty[\s\S]*actionable_findings/)
    expect(gate).toContain("decision-bearing blocker")
    expect(gate).toContain("residual_risks")
    expect(gate).toContain("testing_gaps")
    expect(gate).toContain("advisory")
  })

  test("routes the final convergence gate through deterministic final validation", async () => {
    const skill = await readFile(skillPath, "utf8")
    const protocol = await readFile(protocolPath, "utf8")
    const gate = section(protocol, "## Final Convergence Gate", "## Quick Reference")

    expect(skill).toContain("validate-final --repo <path> --expected <json-file> --review <json-file>")
    expect(gate).toContain("validate-final")
    expect(gate).toMatch(/exactly `Ready to merge`|verdict is exactly `Ready to merge`/)
    expect(gate).toMatch(/empty `actionable_findings`|`actionable_findings` is empty/)
  })

  test("uses max-work-units only as a circuit breaker", async () => {
    const skill = await readFile(skillPath, "utf8")
    const protocol = await readFile(protocolPath, "utf8")

    expect(skill).toContain("`max-work-units:N`")
    expect(skill).toContain("Default: `8`")
    expect(skill).toContain("integer from 2 through 10")
    expect(skill).toContain("global review wave")
    expect(skill).toContain("defect-family remediation cycle")
    expect(skill).toContain("discarded")
    expect(protocol).toContain("budget exhaustion")
    expect(protocol).toContain("never convergence")
  })

  test("pins complete success and failure envelopes", async () => {
    const skill = await readFile(skillPath, "utf8")
    const success = section(skill, "Code review loop converged", "```")
    const failure = section(skill, "Non-converged\nBranch:", "## Completion Rules")

    for (const field of [
      "Branch:",
      "Base:",
      "Final HEAD:",
      "Review waves:",
      "Remediation commits:",
      "Ready to merge, no actionable findings",
      "Verification:",
      "Residual advisories:",
    ]) {
      expect(success).toContain(field)
    }

    for (const field of [
      "Starting HEAD:",
      "Last reviewed HEAD:",
      "Completed work units:",
      "Open actionable findings:",
      "Decision blockers:",
      "Reviewer coverage gaps:",
      "Verification failures:",
      "Concurrent change:",
      "ce-code-review:",
      "Next bounded cycle:",
    ]) {
      expect(failure).toContain(field)
    }
  })

  test("keeps run state invocation-scoped and private", async () => {
    const protocol = await readFile(protocolPath, "utf8")
    const mechanics = section(protocol, "## Mechanics", "## Preflight")

    expect(mechanics).toContain("/tmp/compound-engineering-$(id -u)/ce-code-review-loop/")
    expect(mechanics).toContain("run-state.json")
    expect(mechanics).toContain("fresh")
    expect(mechanics).toContain("umask 077")
    expect(mechanics).toContain("chmod 700")
    expect(mechanics).toContain("symlink")
    expect(mechanics).toContain("owned by the current user")
  })
})

describe("loop-state helper", () => {
  test("preflight reports clean, staged, unstaged, untracked, and detached states", async () => {
    const clean = await createRepo()
    expect(await helper(clean.repo, "preflight", "--repo", clean.repo, "--base", clean.baseSha)).toEqual({
      status: "ok",
      input: "valid",
      branch: "main",
      base_sha: clean.baseSha,
      head_sha: clean.headSha,
      clean: true,
    })

    await writeFile(clean.activePath, "value=staged\n")
    await git(clean.repo, "add", "active.txt")
    expect((await helper(clean.repo, "preflight", "--repo", clean.repo, "--base", clean.baseSha)).clean).toBe(false)
    await git(clean.repo, "reset", "--hard", "HEAD")

    await writeFile(clean.activePath, "value=unstaged\n")
    expect((await helper(clean.repo, "preflight", "--repo", clean.repo, "--base", clean.baseSha)).clean).toBe(false)
    await git(clean.repo, "reset", "--hard", "HEAD")

    await writeFile(path.join(clean.repo, "untracked.txt"), "new\n")
    expect((await helper(clean.repo, "preflight", "--repo", clean.repo, "--base", clean.baseSha)).clean).toBe(false)
    await rm(path.join(clean.repo, "untracked.txt"))

    await git(clean.repo, "checkout", "--detach", "HEAD")
    expect(await helper(clean.repo, "preflight", "--repo", clean.repo, "--base", clean.baseSha)).toMatchObject({
      status: "blocked",
      input: "detached_head",
      branch: null,
      base_sha: clean.baseSha,
      head_sha: clean.headSha,
      clean: true,
    })
  })

  test("preflight freezes the merge base when the supplied base advances after divergence", async () => {
    const fixture = await createDivergedRepo()

    expect(await helper(fixture.repo, "preflight", "--repo", fixture.repo, "--base", "main")).toMatchObject({
      status: "ok",
      input: "valid",
      branch: "feature",
      base_sha: fixture.forkSha,
      head_sha: fixture.featureSha,
      clean: true,
    })
    expect(await helper(fixture.repo, "preflight", "--repo", fixture.repo, "--base", fixture.baseTipSha)).toMatchObject({
      status: "ok",
      input: "valid",
      base_sha: fixture.forkSha,
    })
  })

  test("preflight fails closed when the supplied commit has no merge base with HEAD", async () => {
    const fixture = await createRepo()
    const treeSha = await git(fixture.repo, "show", "-s", "--format=%T", "HEAD")
    const unrelatedSha = await git(fixture.repo, "commit-tree", treeSha, "-m", "unrelated root")
    await git(fixture.repo, "update-ref", "refs/heads/unrelated", unrelatedSha)

    expect(await helper(fixture.repo, "preflight", "--repo", fixture.repo, "--base", "unrelated")).toMatchObject({
      status: "blocked",
      input: "invalid_base",
      base_sha: null,
      head_sha: fixture.headSha,
    })
  })

  test("preflight fails closed for invalid repositories and base refs", async () => {
    const fixture = await createRepo()
    const invalidBase = await helper(fixture.repo, "preflight", "--repo", fixture.repo, "--base", "missing-ref")
    expect(invalidBase).toMatchObject({ status: "blocked", input: "invalid_base" })

    const missingRepo = path.join(fixture.repo, "missing")
    const invalidRepo = await helper(fixture.repo, "preflight", "--repo", missingRepo, "--base", "HEAD")
    expect(invalidRepo).toEqual({
      status: "blocked",
      input: "not_repository",
      branch: null,
      base_sha: null,
      head_sha: null,
      clean: false,
    })
  })

  test("validates a complete canonical review receipt against frozen checkout state", async () => {
    const fixture = await createRepo()
    const files = await writeValidationFiles(fixture, validReview(fixture))
    expect(await helper(
      fixture.repo,
      "validate-review",
      "--repo",
      fixture.repo,
      "--expected",
      files.expectedPath,
      "--review",
      files.reviewPath,
    )).toEqual({
      status: "valid",
      branch: "main",
      base_sha: fixture.baseSha,
      head_sha: fixture.headSha,
      clean: true,
    })
  })

  test("accepts an ordinary remediation wave with an exact actionable projection", async () => {
    const fixture = await createRepo()
    const actionable = finding(1)
    const advisory = finding(2, { autofix_class: "advisory", owner: "human" })
    const files = await writeValidationFiles(fixture, validReview(fixture, {
      verdict: "Ready with fixes",
      findings: [actionable, advisory],
      actionable_findings: [actionable],
    }))

    expect((await helper(
      fixture.repo,
      "validate-review",
      "--repo",
      fixture.repo,
      "--expected",
      files.expectedPath,
      "--review",
      files.reviewPath,
    )).status).toBe("valid")
  })

  test("rejects every actionable projection field mismatch", async () => {
    const mutations: Array<[string, (value: Record<string, any>) => void]> = [
      ["file", (value) => { value.file = "unrelated.txt" }],
      ["line", (value) => { value.line = 2 }],
      ["evidence", (value) => { value.evidence = ["different evidence"] }],
      ["why_it_matters", (value) => { value.why_it_matters = "Different consequence." }],
      ["suggested_fix", (value) => { value.suggested_fix = "Apply a different fix." }],
    ]

    for (const [field, mutate] of mutations) {
      const fixture = await createRepo()
      const full = finding(1)
      const projected = structuredClone(full)
      mutate(projected)
      const files = await writeValidationFiles(fixture, validReview(fixture, {
        verdict: "Ready with fixes",
        findings: [full],
        actionable_findings: [projected],
      }))

      expect(
        (await helper(fixture.repo, "validate-review", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)).status,
        field,
      ).toBe("malformed")
    }
  })

  test("rejects missing full findings and duplicate stable finding identities", async () => {
    const cases = [
      { findings: undefined },
      { findings: [finding(1), finding(1)], actionable_findings: [finding(1)] },
      { findings: [finding(1)], actionable_findings: [finding(1), finding(1)] },
    ]

    for (const reviewOverrides of cases) {
      const fixture = await createRepo()
      const review = validReview(fixture, reviewOverrides)
      if (reviewOverrides.findings === undefined) delete review.findings
      const files = await writeValidationFiles(fixture, review)
      expect((await helper(fixture.repo, "validate-review", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)).status).toBe("malformed")
    }
  })

  test("rejects missing, extra, and routing-mismatched actionable queue items", async () => {
    const cases = [
      { findings: [finding(1)], actionable_findings: [] },
      {
        findings: [finding(1, { autofix_class: "advisory", owner: "human" })],
        actionable_findings: [finding(1)],
      },
      {
        findings: [finding(1)],
        actionable_findings: [finding(1, { autofix_class: "manual" })],
      },
    ]

    for (const reviewOverrides of cases) {
      const fixture = await createRepo()
      const files = await writeValidationFiles(fixture, validReview(fixture, reviewOverrides))
      expect((await helper(fixture.repo, "validate-review", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)).status).toBe("malformed")
    }
  })

  test("validates canonical verdicts ordinarily and enforces the final convergence verdict", async () => {
    for (const verdict of ["Ready to merge", "Ready with fixes", "Not ready"]) {
      const fixture = await createRepo()
      const files = await writeValidationFiles(fixture, validReview(fixture, { verdict }))
      expect((await helper(fixture.repo, "validate-review", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)).status).toBe("valid")
      expect((await helper(fixture.repo, "validate-final", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)).status).toBe(verdict === "Ready to merge" ? "valid" : "not_final")
    }

    const malformedVerdict = await createRepo()
    const malformedFiles = await writeValidationFiles(malformedVerdict, validReview(malformedVerdict, { verdict: "Looks good" }))
    expect((await helper(malformedVerdict.repo, "validate-review", "--repo", malformedVerdict.repo, "--expected", malformedFiles.expectedPath, "--review", malformedFiles.reviewPath)).status).toBe("malformed")

    const actionableFinal = await createRepo()
    const actionable = finding(1)
    const actionableFiles = await writeValidationFiles(actionableFinal, validReview(actionableFinal, {
      findings: [actionable],
      actionable_findings: [actionable],
    }))
    expect((await helper(actionableFinal.repo, "validate-final", "--repo", actionableFinal.repo, "--expected", actionableFiles.expectedPath, "--review", actionableFiles.reviewPath)).status).toBe("not_final")
  })

  test("distinguishes malformed, coverage-gap, and concurrent review states", async () => {
    const malformed = await createRepo()
    const malformedFiles = await writeValidationFiles(malformed, validReview(malformed))
    await writeFile(malformedFiles.reviewPath, "not json")
    expect((await helper(malformed.repo, "validate-review", "--repo", malformed.repo, "--expected", malformedFiles.expectedPath, "--review", malformedFiles.reviewPath)).status).toBe("malformed")

    const coverage = await createRepo()
    const coverageReview = validReview(coverage, {
      review_receipt: {
        selected_reviewers: ["correctness", "security"],
        required_reviewers: ["correctness", "security"],
        failed_reviewers: [{ reviewer: "security", reason: "timeout", required: true }],
      },
    })
    const coverageFiles = await writeValidationFiles(coverage, coverageReview)
    expect(await helper(coverage.repo, "validate-review", "--repo", coverage.repo, "--expected", coverageFiles.expectedPath, "--review", coverageFiles.reviewPath)).toMatchObject({
      status: "coverage_gap",
      missing_required_reviewers: ["security"],
      failed_required_reviewers: ["security"],
    })

    const concurrent = await createRepo()
    const concurrentFiles = await writeValidationFiles(concurrent, validReview(concurrent))
    await writeFile(concurrent.unrelatedPath, "owner=concurrent\n")
    await git(concurrent.repo, "add", "unrelated.txt")
    await git(concurrent.repo, "commit", "-m", "concurrent change")
    const concurrentHead = await git(concurrent.repo, "rev-parse", "HEAD")
    expect(await helper(concurrent.repo, "validate-review", "--repo", concurrent.repo, "--expected", concurrentFiles.expectedPath, "--review", concurrentFiles.reviewPath)).toMatchObject({
      status: "concurrent_change",
      branch: "main",
      head_sha: concurrentHead,
      clean: true,
    })
  })

  test("preserves required-reviewer identities for canonical degraded receipts", async () => {
    const fixture = await createRepo()
    const files = await writeValidationFiles(fixture, validReview(fixture, {
      status: "degraded",
      review_receipt: {
        selected_reviewers: ["correctness", "security"],
        required_reviewers: ["correctness", "security"],
        completed_reviewers: ["correctness"],
        failed_reviewers: [{ reviewer: "security", reason: "timeout", required: true }],
        terminal_status: "degraded",
      },
    }))

    const ordinary = await helper(fixture.repo, "validate-review", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)
    expect(ordinary).toMatchObject({
      status: "coverage_gap",
      terminal_status: "degraded",
      missing_required_reviewers: ["security"],
      failed_required_reviewers: ["security"],
    })

    const final = await helper(fixture.repo, "validate-final", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)
    expect(final).toMatchObject({
      status: "coverage_gap",
      terminal_status: "degraded",
      missing_required_reviewers: ["security"],
      failed_required_reviewers: ["security"],
    })
    expect(final.status).not.toBe("valid")
  })

  test("rejects degraded receipts without a required coverage gap", async () => {
    const fixture = await createRepo()
    const files = await writeValidationFiles(fixture, validReview(fixture, {
      status: "degraded",
      review_receipt: {
        selected_reviewers: ["correctness", "advisory"],
        required_reviewers: ["correctness"],
        completed_reviewers: ["correctness"],
        failed_reviewers: [{ reviewer: "advisory", reason: "unavailable", required: false }],
        terminal_status: "degraded",
      },
    }))

    for (const command of ["validate-review", "validate-final"]) {
      expect(await helper(fixture.repo, command, "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)).toMatchObject({
        status: "malformed",
        reason: "degraded_without_coverage_gap",
      })
    }
  })

  test("preserves all failed required-reviewer identities for canonical failed receipts", async () => {
    const fixture = await createRepo()
    const files = await writeValidationFiles(fixture, validReview(fixture, {
      status: "failed",
      review_receipt: {
        selected_reviewers: ["correctness", "security"],
        required_reviewers: ["correctness", "security"],
        completed_reviewers: [],
        failed_reviewers: [
          { reviewer: "correctness", reason: "malformed output", required: true },
          { reviewer: "security", reason: "timeout", required: true },
        ],
        terminal_status: "failed",
      },
    }))

    const ordinary = await helper(fixture.repo, "validate-review", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)
    expect(ordinary).toMatchObject({
      status: "coverage_gap",
      terminal_status: "failed",
      missing_required_reviewers: ["correctness", "security"],
      failed_required_reviewers: ["correctness", "security"],
    })

    const final = await helper(fixture.repo, "validate-final", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)
    expect(final).toMatchObject({
      status: "coverage_gap",
      terminal_status: "failed",
      missing_required_reviewers: ["correctness", "security"],
      failed_required_reviewers: ["correctness", "security"],
    })
    expect(final.status).not.toBe("valid")
  })

  test("rejects top-level and receipt terminal-status mismatches", async () => {
    const fixture = await createRepo()
    const files = await writeValidationFiles(fixture, validReview(fixture, {
      status: "degraded",
      review_receipt: { terminal_status: "complete" },
    }))

    expect((await helper(fixture.repo, "validate-review", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)).status).toBe("malformed")
  })

  test("enforces every canonical roster relationship", async () => {
    const cases = [
      { selected_reviewers: ["correctness", "correctness"] },
      { required_reviewers: ["correctness", "correctness"] },
      { completed_reviewers: ["correctness", "correctness"] },
      { failed_reviewers: [
        { reviewer: "security", reason: "timeout", required: false },
        { reviewer: "security", reason: "crash", required: false },
      ], selected_reviewers: ["correctness", "security"] },
      { required_reviewers: ["security"] },
      { completed_reviewers: ["security"] },
      { failed_reviewers: [{ reviewer: "security", reason: "timeout", required: false }] },
      {
        selected_reviewers: ["correctness", "security"],
        completed_reviewers: ["correctness", "security"],
        failed_reviewers: [{ reviewer: "security", reason: "timeout", required: false }],
      },
      { selected_reviewers: ["correctness", "security"] },
      {
        selected_reviewers: ["correctness", "security"],
        required_reviewers: [],
        failed_reviewers: [{ reviewer: "security", reason: "timeout", required: true }],
      },
    ]

    for (const receipt of cases) {
      const fixture = await createRepo()
      const files = await writeValidationFiles(fixture, validReview(fixture, { review_receipt: receipt }))
      expect((await helper(fixture.repo, "validate-review", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)).status).toBe("malformed")
    }

    const optionalFailure = await createRepo()
    const optionalFailureFiles = await writeValidationFiles(optionalFailure, validReview(optionalFailure, {
      review_receipt: {
        selected_reviewers: ["correctness", "advisory"],
        failed_reviewers: [{ reviewer: "advisory", reason: "unavailable", required: false }],
      },
    }))
    expect((await helper(optionalFailure.repo, "validate-review", "--repo", optionalFailure.repo, "--expected", optionalFailureFiles.expectedPath, "--review", optionalFailureFiles.reviewPath)).status).toBe("valid")
  })
})

describe("guarded remediation cycle helper", () => {
  test("checkpoints and commits a verified exact-path fix", async () => {
    const fixture = await createRepo()
    const cycle = await writeCycleFiles(["active.txt"], { status: "pending" })
    expect(await helper(fixture.repo, "cycle-checkpoint", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath)).toMatchObject({
      status: "checkpointed",
      branch: "main",
      head_sha: fixture.headSha,
      paths: ["active.txt"],
    })

    await writeFile(fixture.activePath, "value=good\n")
    await writeFile(cycle.verificationPath, JSON.stringify({ status: "passed", checks: ["active value"] }))
    const committed = await helper(fixture.repo, "cycle-commit", "--repo", fixture.repo, "--state", cycle.statePath, "--message", "fix(review): correct active value")

    expect(committed).toMatchObject({ status: "committed", clean: true })
    expect(committed.commit_sha).toBe(await git(fixture.repo, "rev-parse", "HEAD"))
    expect(await git(fixture.repo, "status", "--porcelain=v1", "--untracked-files=all")).toBe("")
    expect(await git(fixture.repo, "log", "-1", "--pretty=%s")).toBe("fix(review): correct active value")
    expect(await readFile(fixture.activePath, "utf8")).toBe("value=good\n")
  })

  test("checkpoints and commits a new intended fixture file", async () => {
    const fixture = await createRepo()
    const fixtureDir = path.join(fixture.repo, "test")
    const fixturePath = path.join(fixtureDir, "new-fixture.txt")
    await mkdir(fixtureDir)
    const cycle = await writeCycleFiles(["test/new-fixture.txt"], { status: "pending" })

    expect(await helper(fixture.repo, "cycle-checkpoint", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath)).toMatchObject({
      status: "checkpointed",
      paths: ["test/new-fixture.txt"],
    })
    expect(JSON.parse(await readFile(cycle.statePath, "utf8")).files).toEqual([
      { path: "test/new-fixture.txt", exists: false },
    ])

    await writeFile(fixturePath, "new fixture bytes\n")
    await writeFile(cycle.verificationPath, JSON.stringify({ status: "passed", checks: ["new fixture"] }))
    expect(await helper(fixture.repo, "cycle-commit", "--repo", fixture.repo, "--state", cycle.statePath, "--message", "test(review): add regression fixture")).toMatchObject({
      status: "committed",
      clean: true,
      paths: ["test/new-fixture.txt"],
    })
    expect(await git(fixture.repo, "show", "HEAD:test/new-fixture.txt")).toBe("new fixture bytes")
  })

  test("detects a pre-commit hook that mutates and stages verified intended bytes", async () => {
    const fixture = await createRepo()
    const cycle = await writeCycleFiles(["active.txt"], { status: "pending" })
    expect((await helper(fixture.repo, "cycle-checkpoint", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath)).status).toBe("checkpointed")

    await writeFile(fixture.activePath, "value=verified\n")
    await writeFile(cycle.verificationPath, JSON.stringify({ status: "passed", checks: ["active value"] }))
    await installPreCommitHook(fixture, "printf 'value=hook-mutated\\n' > active.txt\ngit add -- active.txt")

    const result = await helper(fixture.repo, "cycle-commit", "--repo", fixture.repo, "--state", cycle.statePath, "--message", "fix(review): correct active value")
    expect(result).toMatchObject({
      status: "commit_integrity_failure",
      reason: "committed_snapshot_mismatch",
      changed_paths: ["active.txt"],
      clean: true,
    })
    expect(result.commit_sha).toBe(await git(fixture.repo, "rev-parse", "HEAD"))
    expect(await git(fixture.repo, "rev-parse", "HEAD^" )).toBe(fixture.headSha)
    expect(await readFile(fixture.activePath, "utf8")).toBe("value=hook-mutated\n")
    expect(await git(fixture.repo, "show", "HEAD:active.txt")).toBe("value=hook-mutated")
  })

  test("detects a pre-commit hook that mutates and stages the verified intended mode", async () => {
    const fixture = await createRepo()
    const cycle = await writeCycleFiles(["active.txt"], { status: "pending" })
    expect((await helper(fixture.repo, "cycle-checkpoint", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath)).status).toBe("checkpointed")

    await writeFile(fixture.activePath, "value=verified\n")
    await chmod(fixture.activePath, 0o644)
    await writeFile(cycle.verificationPath, JSON.stringify({ status: "passed", checks: ["active value"] }))
    await installPreCommitHook(fixture, "chmod 755 active.txt\ngit add -- active.txt")

    const result = await helper(fixture.repo, "cycle-commit", "--repo", fixture.repo, "--state", cycle.statePath, "--message", "fix(review): correct active value")
    expect(result).toMatchObject({
      status: "commit_integrity_failure",
      reason: "committed_snapshot_mismatch",
      changed_paths: ["active.txt"],
      clean: true,
    })
    expect(result.commit_sha).toBe(await git(fixture.repo, "rev-parse", "HEAD"))
    expect((await git(fixture.repo, "ls-tree", "HEAD", "active.txt")).split(" ")[0]).toBe("100755")
  })

  test("detects a pre-commit hook that adds and stages an extra path", async () => {
    const fixture = await createRepo()
    const cycle = await writeCycleFiles(["active.txt"], { status: "pending" })
    expect((await helper(fixture.repo, "cycle-checkpoint", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath)).status).toBe("checkpointed")

    await writeFile(fixture.activePath, "value=verified\n")
    await writeFile(cycle.verificationPath, JSON.stringify({ status: "passed", checks: ["active value"] }))
    await installPreCommitHook(fixture, "printf 'hook extra\\n' > hook-extra.txt\ngit add -- hook-extra.txt")

    const result = await helper(fixture.repo, "cycle-commit", "--repo", fixture.repo, "--state", cycle.statePath, "--message", "fix(review): correct active value")
    expect(result).toMatchObject({
      status: "commit_integrity_failure",
      reason: "commit_diff_paths_mismatch",
      changed_paths: ["hook-extra.txt"],
      clean: true,
    })
    expect(result.commit_sha).toBe(await git(fixture.repo, "rev-parse", "HEAD"))
    expect(await git(fixture.repo, "show", "HEAD:hook-extra.txt")).toBe("hook extra")
    expect(await git(fixture.repo, "status", "--porcelain=v1", "--untracked-files=all")).toBe("")
  })

  test("detects a pre-commit hook that leaves the post-commit working tree dirty", async () => {
    const fixture = await createRepo()
    const cycle = await writeCycleFiles(["active.txt"], { status: "pending" })
    expect((await helper(fixture.repo, "cycle-checkpoint", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath)).status).toBe("checkpointed")

    await writeFile(fixture.activePath, "value=verified\n")
    await writeFile(cycle.verificationPath, JSON.stringify({ status: "passed", checks: ["active value"] }))
    await installPreCommitHook(fixture, "printf 'value=post-commit-dirty\\n' > active.txt")

    const result = await helper(fixture.repo, "cycle-commit", "--repo", fixture.repo, "--state", cycle.statePath, "--message", "fix(review): correct active value")
    expect(result).toMatchObject({
      status: "commit_integrity_failure",
      reason: "working_tree_not_clean",
      changed_paths: ["active.txt"],
      clean: false,
    })
    expect(result.commit_sha).toBe(await git(fixture.repo, "rev-parse", "HEAD"))
    expect(await git(fixture.repo, "show", "HEAD:active.txt")).toBe("value=verified")
    expect(await readFile(fixture.activePath, "utf8")).toBe("value=post-commit-dirty\n")
  })

  test("refuses a failed verification and restores only checkpointed bytes", async () => {
    const fixture = await createRepo()
    const before = await readFile(fixture.activePath)
    const beforeMode = (await stat(fixture.activePath)).mode & 0o777
    const cycle = await writeCycleFiles(["active.txt"], { status: "pending" })
    expect((await helper(fixture.repo, "cycle-checkpoint", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath)).status).toBe("checkpointed")

    await chmod(fixture.activePath, 0o600)
    await writeFile(fixture.activePath, "value=broken-fix\n")
    await writeFile(cycle.verificationPath, JSON.stringify({ status: "failed", checks: ["active value"] }))
    expect(await helper(fixture.repo, "cycle-commit", "--repo", fixture.repo, "--state", cycle.statePath, "--message", "fix(review): broken")).toMatchObject({ status: "verification_failed" })
    expect(await readFile(fixture.activePath, "utf8")).toBe("value=broken-fix\n")

    expect(await helper(fixture.repo, "cycle-restore", "--repo", fixture.repo, "--state", cycle.statePath)).toMatchObject({ status: "restored", clean: true })

    expect((await stat(fixture.activePath)).mode & 0o777).toBe(beforeMode)
    expect(await readFile(fixture.activePath)).toEqual(before)
    expect(await readFile(fixture.unrelatedPath, "utf8")).toBe("owner=user\n")
    expect(await git(fixture.repo, "status", "--porcelain=v1", "--untracked-files=all")).toBe("")
  })

  test("verification failure removes a file that was missing at checkpoint", async () => {
    const fixture = await createRepo()
    const fixtureDir = path.join(fixture.repo, "test")
    const fixturePath = path.join(fixtureDir, "new-fixture.txt")
    await mkdir(fixtureDir)
    const cycle = await writeCycleFiles(["test/new-fixture.txt"], { status: "pending" })
    expect((await helper(fixture.repo, "cycle-checkpoint", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath)).status).toBe("checkpointed")

    await writeFile(fixturePath, "failed fixture bytes\n")
    await writeFile(cycle.verificationPath, JSON.stringify({ status: "failed", checks: ["new fixture"] }))
    expect(await helper(fixture.repo, "cycle-commit", "--repo", fixture.repo, "--state", cycle.statePath, "--message", "test(review): broken fixture")).toMatchObject({ status: "verification_failed" })
    expect(await helper(fixture.repo, "cycle-restore", "--repo", fixture.repo, "--state", cycle.statePath)).toMatchObject({ status: "restored", clean: true })
    expect(await Bun.file(fixturePath).exists()).toBe(false)
    expect(await git(fixture.repo, "status", "--porcelain=v1", "--untracked-files=all")).toBe("")
  })

  test("preserves all bytes when tracked or untracked unrelated work appears", async () => {
    const fixture = await createRepo()
    const cycle = await writeCycleFiles(["active.txt"], { status: "failed" })
    expect((await helper(fixture.repo, "cycle-checkpoint", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath)).status).toBe("checkpointed")

    await writeFile(fixture.activePath, "value=broken-fix\n")
    await writeFile(fixture.unrelatedPath, "owner=concurrent\n")
    const untrackedPath = path.join(fixture.repo, "concurrent.txt")
    await writeFile(untrackedPath, "new concurrent bytes\n")
    const observedActive = await readFile(fixture.activePath)
    const observedUnrelated = await readFile(fixture.unrelatedPath)
    const observedUntracked = await readFile(untrackedPath)

    expect(await helper(fixture.repo, "cycle-restore", "--repo", fixture.repo, "--state", cycle.statePath)).toMatchObject({
      status: "concurrent_change",
      changed_paths: ["concurrent.txt", "unrelated.txt"],
    })

    expect(await readFile(fixture.activePath)).toEqual(observedActive)
    expect(await readFile(fixture.unrelatedPath)).toEqual(observedUnrelated)
    expect(await readFile(untrackedPath)).toEqual(observedUntracked)
    expect(await git(fixture.repo, "rev-parse", "HEAD")).toBe(fixture.headSha)
  })

  test("preserves a created intended file when unrelated concurrent work appears", async () => {
    const fixture = await createRepo()
    const fixtureDir = path.join(fixture.repo, "test")
    const fixturePath = path.join(fixtureDir, "new-fixture.txt")
    await mkdir(fixtureDir)
    const cycle = await writeCycleFiles(["test/new-fixture.txt"], { status: "failed" })
    expect((await helper(fixture.repo, "cycle-checkpoint", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath)).status).toBe("checkpointed")

    await writeFile(fixturePath, "loop-created bytes\n")
    await writeFile(fixture.unrelatedPath, "owner=concurrent\n")
    const concurrentPath = path.join(fixture.repo, "concurrent.txt")
    await writeFile(concurrentPath, "concurrent untracked bytes\n")
    const intendedBytes = await readFile(fixturePath)
    const unrelatedBytes = await readFile(fixture.unrelatedPath)
    const concurrentBytes = await readFile(concurrentPath)

    expect(await helper(fixture.repo, "cycle-restore", "--repo", fixture.repo, "--state", cycle.statePath)).toMatchObject({
      status: "concurrent_change",
      changed_paths: ["concurrent.txt", "unrelated.txt"],
    })
    expect(await readFile(fixturePath)).toEqual(intendedBytes)
    expect(await readFile(fixture.unrelatedPath)).toEqual(unrelatedBytes)
    expect(await readFile(concurrentPath)).toEqual(concurrentBytes)
    expect(await git(fixture.repo, "rev-parse", "HEAD")).toBe(fixture.headSha)
  })

  test("rejects missing parents, symlinks, and escaping checkpoint paths without writing state", async () => {
    const cases: Array<{ paths: string[]; prepare?: (fixture: RepoFixture) => Promise<void> }> = [
      { paths: ["missing-parent/missing.txt"] },
      { paths: ["../outside.txt"] },
      {
        paths: ["linked.txt"],
        prepare: async (fixture) => { await symlink(fixture.activePath, path.join(fixture.repo, "linked.txt")) },
      },
    ]

    for (const { paths, prepare } of cases) {
      const fixture = await createRepo()
      await prepare?.(fixture)
      const cycle = await writeCycleFiles(paths, { status: "pending" })
      expect((await helper(fixture.repo, "cycle-checkpoint", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath)).status).toBe("malformed")
      expect(Bun.file(cycle.statePath).size).toBe(0)
    }
  })
})
