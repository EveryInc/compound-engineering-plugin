import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, symlink, writeFile } from "fs/promises"
import { mkdtempSync } from "fs"
import os from "os"
import path from "path"

// Real git commits and pre-commit hooks contend with the suite's parallel
// subprocess load; preserve the executable coverage with the repo-standard
// bound used by other subprocess-heavy test files.
setDefaultTimeout(30_000)

const skillPath = path.join(process.cwd(), "skills/ce-code-review-loop/SKILL.md")
const protocolPath = path.join(process.cwd(), "skills/ce-code-review-loop/references/loop-protocol.md")
const helperPath = path.join(process.cwd(), "skills/ce-code-review-loop/scripts/loop-state.mjs")
const fileTempRoot = mkdtempSync(path.join(os.tmpdir(), "ce-review-loop-contract-"))
const neutralGitConfig = path.join(fileTempRoot, "neutral-gitconfig")
const tempRoots: string[] = [fileTempRoot]

type RepoFixture = {
  repo: string
  baseSha: string
  headSha: string
  activePath: string
  unrelatedPath: string
}

type AuthorizationFixture = {
  runRoot: string
  statePath: string
  packetPath: string
  reviewPath: string
  pathsPath: string
  verificationPath: string
  familyPath: string
  actionable: Record<string, any>
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
  expect(result.code, result.stderr).toBe(0)
  expect(result.stdout.trim().split("\n"), result.stderr).toHaveLength(1)
  return JSON.parse(result.stdout)
}

async function authorizeCycle(fixture: RepoFixture, cycle: AuthorizationFixture) {
  return helper(fixture.repo, "cycle-authorize", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath, "--family-json", cycle.familyPath, "--review", cycle.reviewPath, "--base", fixture.baseSha, "--packet", cycle.packetPath)
}

async function beginCycle(fixture: RepoFixture, cycle: AuthorizationFixture) {
  const active = await authorizeCycle(fixture, cycle)
  expect(active.status).toBe("authorized")
  expect(await helper(fixture.repo, "cycle-begin", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "dispatched" })
  return active
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
  const { review_receipt: receiptOverrides, scope: scopeOverrides, reviewers, ...topLevelOverrides } = overrides
  const receipt = {
    base_sha: fixture.baseSha,
    head_sha: fixture.headSha,
    branch: "main",
    selected_reviewers: ["correctness-reviewer"],
    required_reviewers: ["correctness-reviewer"],
    completed_reviewers: ["correctness-reviewer"],
    failed_reviewers: [],
    terminal_status: "complete",
    ...receiptOverrides,
  }
  return {
    status: "complete",
    verdict: "Ready to merge",
    scope: {
      base: fixture.baseSha,
      branch: "main",
      head_sha: fixture.headSha,
      pr_url: null,
      files_changed: 1,
      ...scopeOverrides,
    },
    intent: "Review the current branch against the frozen base.",
    intent_confidence: "explicit",
    reviewers: reviewers ?? receipt.selected_reviewers.map((identity: string) =>
      identity === "correctness-reviewer" ? "correctness" : identity,
    ),
    findings: [],
    actionable_findings: [],
    triage_groups: [],
    pre_existing_findings: [],
    requirements_completeness: null,
    learnings: [],
    agent_native_gaps: [],
    deployment_notes: [],
    residual_risks: [],
    testing_gaps: [],
    coverage: {},
    artifact_path: "/tmp/ce-code-review-loop-fixture",
    run_id: "loop-fixture",
    ...topLevelOverrides,
    review_receipt: receipt,
  }
}

async function writeValidationFiles(
  fixture: RepoFixture,
  review: Record<string, any>,
): Promise<{ expectedPath: string; reviewPath: string }> {
  const expectedPath = path.join(fileTempRoot, `expected-${crypto.randomUUID()}.json`)
  const reviewPath = path.join(fileTempRoot, `review-${crypto.randomUUID()}.json`)
  await writeFile(expectedPath, JSON.stringify({
    branch: "main",
    base_sha: fixture.baseSha,
    head_sha: fixture.headSha,
  }))
  await writeFile(reviewPath, JSON.stringify(review))
  return { expectedPath, reviewPath }
}

async function writeCycleFiles(paths: string[], verification: Record<string, any>) {
  const cycleRoot = await mkdtemp(path.join(fileTempRoot, "cycle-"))
  const statePath = path.join(cycleRoot, "state.json")
  const pathsPath = path.join(cycleRoot, "paths.json")
  const verificationPath = path.join(cycleRoot, "verification.json")
  await writeFile(pathsPath, JSON.stringify(paths))
  await writeFile(verificationPath, JSON.stringify(verification))
  return { statePath, pathsPath, verificationPath }
}

async function writeAuthorizationFiles(
  fixture: RepoFixture,
  paths = ["active.txt"],
  existingRunRoot?: string,
): Promise<AuthorizationFixture> {
  const runRoot = existingRunRoot ?? await mkdtemp(path.join(fileTempRoot, "authorization-"))
  const suffix = crypto.randomUUID()
  const statePath = path.join(runRoot, `cycle-${suffix}.json`)
  const packetPath = path.join(runRoot, `fixer-packet-${suffix}.json`)
  const reviewPath = path.join(runRoot, `review-${suffix}.json`)
  const pathsPath = path.join(runRoot, `paths-${suffix}.json`)
  const verificationPath = path.join(runRoot, `verification-${suffix}.json`)
  const familyPath = path.join(runRoot, `family-${suffix}.json`)
  const actionable = finding(1)
  await writeFile(reviewPath, JSON.stringify(validReview(fixture, {
    verdict: "Ready with fixes",
    findings: [actionable],
    actionable_findings: [actionable],
    run_id: "canonical-run",
  })))
  await writeFile(pathsPath, JSON.stringify(paths))
  await writeFile(verificationPath, JSON.stringify({ status: "planned", checks: ["active value"] }))
  await writeFile(familyPath, JSON.stringify({
    family_id: "family-1",
    root_invariant: "active value must be good",
    finding_ids: [1],
    authority: "mechanical",
  }))
  return { runRoot, statePath, packetPath, reviewPath, pathsPath, verificationPath, familyPath, actionable }
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

    expect(skill).toContain('$SKILL_DIR/scripts/loop-state.mjs')
    expect(skill).toContain('for c in node nodejs')
    for (const document of [skill, protocol]) {
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

  test("routes every writable remediation through a mutation lease", async () => {
    const skill = await readFile(skillPath, "utf8")
    const protocol = await readFile(protocolPath, "utf8")

    for (const command of [
      "cycle-authorize",
      "cycle-begin",
      "cycle-status",
      "cycle-seal",
      "cycle-scope-expansion",
      "cycle-cancel",
      "cycle-restore",
      "cycle-commit",
    ]) {
      expect(skill).toContain(command)
      expect(protocol).toContain(command)
    }
    const workflow = section(skill, "## Workflow", "## Authority and Interaction")
    expect(workflow).toContain("sole writable remediation entrypoint")
    expect(workflow).toContain("Never batch or parallelize writable defect-family fixers")
    expect(workflow).toContain("exact fixer packet")
    expect(workflow).toMatch(/cycle-authorize[\s\S]*dispatch[\s\S]*cycle-begin/)
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
        selected_reviewers: ["correctness-reviewer", "security-reviewer"],
        required_reviewers: ["correctness-reviewer", "security-reviewer"],
        failed_reviewers: [{ reviewer: "security-reviewer", reason: "timeout", required: true }],
      },
    })
    const coverageFiles = await writeValidationFiles(coverage, coverageReview)
    expect(await helper(coverage.repo, "validate-review", "--repo", coverage.repo, "--expected", coverageFiles.expectedPath, "--review", coverageFiles.reviewPath)).toMatchObject({
      status: "coverage_gap",
      missing_required_reviewers: ["security-reviewer"],
      failed_required_reviewers: ["security-reviewer"],
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
        selected_reviewers: ["correctness-reviewer", "security-reviewer"],
        required_reviewers: ["correctness-reviewer", "security-reviewer"],
        completed_reviewers: ["correctness-reviewer"],
        failed_reviewers: [{ reviewer: "security-reviewer", reason: "timeout", required: true }],
        terminal_status: "degraded",
      },
    }))

    const ordinary = await helper(fixture.repo, "validate-review", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)
    expect(ordinary).toMatchObject({
      status: "coverage_gap",
      terminal_status: "degraded",
      missing_required_reviewers: ["security-reviewer"],
      failed_required_reviewers: ["security-reviewer"],
    })

    const final = await helper(fixture.repo, "validate-final", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)
    expect(final).toMatchObject({
      status: "coverage_gap",
      terminal_status: "degraded",
      missing_required_reviewers: ["security-reviewer"],
      failed_required_reviewers: ["security-reviewer"],
    })
    expect(final.status).not.toBe("valid")
  })

  test("rejects degraded receipts without a required coverage gap", async () => {
    const fixture = await createRepo()
    const files = await writeValidationFiles(fixture, validReview(fixture, {
      status: "degraded",
      review_receipt: {
        selected_reviewers: ["correctness-reviewer", "adversarial-openai"],
        required_reviewers: ["correctness-reviewer"],
        completed_reviewers: ["correctness-reviewer"],
        failed_reviewers: [{ reviewer: "adversarial-openai", reason: "unavailable", required: false }],
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
        selected_reviewers: ["correctness-reviewer", "security-reviewer"],
        required_reviewers: ["correctness-reviewer", "security-reviewer"],
        completed_reviewers: [],
        failed_reviewers: [
          { reviewer: "correctness-reviewer", reason: "malformed output", required: true },
          { reviewer: "security-reviewer", reason: "timeout", required: true },
        ],
        terminal_status: "failed",
      },
    }))

    const ordinary = await helper(fixture.repo, "validate-review", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)
    expect(ordinary).toMatchObject({
      status: "coverage_gap",
      terminal_status: "failed",
      missing_required_reviewers: ["correctness-reviewer", "security-reviewer"],
      failed_required_reviewers: ["correctness-reviewer", "security-reviewer"],
    })

    const final = await helper(fixture.repo, "validate-final", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)
    expect(final).toMatchObject({
      status: "coverage_gap",
      terminal_status: "failed",
      missing_required_reviewers: ["correctness-reviewer", "security-reviewer"],
      failed_required_reviewers: ["correctness-reviewer", "security-reviewer"],
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
      { selected_reviewers: ["correctness-reviewer", "correctness-reviewer"] },
      { required_reviewers: ["correctness-reviewer", "correctness-reviewer"] },
      { completed_reviewers: ["correctness-reviewer", "correctness-reviewer"] },
      { failed_reviewers: [
        { reviewer: "security-reviewer", reason: "timeout", required: false },
        { reviewer: "security-reviewer", reason: "crash", required: false },
      ], selected_reviewers: ["correctness-reviewer", "security-reviewer"] },
      { required_reviewers: ["security-reviewer"] },
      { completed_reviewers: ["security-reviewer"] },
      { failed_reviewers: [{ reviewer: "security-reviewer", reason: "timeout", required: false }] },
      {
        selected_reviewers: ["correctness-reviewer", "security-reviewer"],
        completed_reviewers: ["correctness-reviewer", "security-reviewer"],
        failed_reviewers: [{ reviewer: "security-reviewer", reason: "timeout", required: false }],
      },
      { selected_reviewers: ["correctness-reviewer", "security-reviewer"] },
      {
        selected_reviewers: ["correctness-reviewer", "security-reviewer"],
        required_reviewers: [],
        failed_reviewers: [{ reviewer: "security-reviewer", reason: "timeout", required: true }],
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
        selected_reviewers: ["correctness-reviewer", "adversarial-openai"],
        failed_reviewers: [{ reviewer: "adversarial-openai", reason: "unavailable", required: false }],
      },
    }))
    expect((await helper(optionalFailure.repo, "validate-review", "--repo", optionalFailure.repo, "--expected", optionalFailureFiles.expectedPath, "--review", optionalFailureFiles.reviewPath)).status).toBe("valid")
  })
  test("rejects every truncated canonical review envelope field", async () => {
    const topLevelFields = [
      "scope", "intent", "intent_confidence", "reviewers", "findings", "actionable_findings",
      "triage_groups", "pre_existing_findings", "requirements_completeness", "learnings",
      "agent_native_gaps", "deployment_notes", "residual_risks", "testing_gaps", "coverage",
      "artifact_path", "run_id", "review_receipt",
    ]
    for (const field of topLevelFields) {
      const fixture = await createRepo()
      const review = validReview(fixture)
      delete review[field]
      const files = await writeValidationFiles(fixture, review)
      expect((await helper(fixture.repo, "validate-review", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)).status, field).toBe("malformed")
    }
    for (const field of ["base", "branch", "head_sha", "pr_url", "files_changed"]) {
      const fixture = await createRepo()
      const review = validReview(fixture)
      delete review.scope[field]
      const files = await writeValidationFiles(fixture, review)
      expect((await helper(fixture.repo, "validate-review", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)).status, `scope.${field}`).toBe("malformed")
    }
  })

  test("rejects top-level scope identity that disagrees with the frozen review scope", async () => {
    const fixture = await createRepo()
    for (const scope of [
      { base: "f".repeat(40) },
      { branch: "other-branch" },
      { head_sha: "e".repeat(40) },
    ]) {
      const files = await writeValidationFiles(fixture, validReview(fixture, { scope }))
      expect((await helper(fixture.repo, "validate-review", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)).status).toBe("malformed")
    }
  })

  test("rejects zero, coreless, and top-level mismatched reviewer coverage", async () => {
    const cases = [
      {
        reviewers: [],
        review_receipt: { selected_reviewers: [], required_reviewers: [], completed_reviewers: [], failed_reviewers: [], terminal_status: "failed" },
        status: "failed",
        verdict: "Not ready",
      },
      {
        reviewers: ["testing"],
        review_receipt: { selected_reviewers: ["testing-reviewer"], required_reviewers: ["testing-reviewer"], completed_reviewers: ["testing-reviewer"] },
      },
      { reviewers: ["security"] },
      { reviewers: ["correctness-v2"] },
    ]
    for (const overrides of cases) {
      const fixture = await createRepo()
      const files = await writeValidationFiles(fixture, validReview(fixture, overrides))
      expect((await helper(fixture.repo, "validate-review", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)).status).toBe("malformed")
    }
  })

  test("rejects suppressed and confidence-ineligible actionable findings", async () => {
    for (const confidence of [0, 25]) {
      const fixture = await createRepo()
      const files = await writeValidationFiles(fixture, validReview(fixture, {
        findings: [finding(1, { confidence, autofix_class: "advisory", owner: "human" })],
      }))
      expect((await helper(fixture.repo, "validate-review", "--repo", fixture.repo, "--expected", files.expectedPath, "--review", files.reviewPath)).status).toBe("malformed")
    }

    const moderate = await createRepo()
    const moderateFinding = finding(1, { confidence: 50 })
    const moderateFiles = await writeValidationFiles(moderate, validReview(moderate, {
      verdict: "Ready with fixes", findings: [moderateFinding], actionable_findings: [moderateFinding],
    }))
    expect((await helper(moderate.repo, "validate-review", "--repo", moderate.repo, "--expected", moderateFiles.expectedPath, "--review", moderateFiles.reviewPath)).status).toBe("malformed")

    const urgent = await createRepo()
    const urgentFinding = finding(1, { severity: "P0", confidence: 50 })
    const urgentFiles = await writeValidationFiles(urgent, validReview(urgent, {
      verdict: "Ready with fixes", findings: [urgentFinding], actionable_findings: [urgentFinding],
    }))
    expect((await helper(urgent.repo, "validate-review", "--repo", urgent.repo, "--expected", urgentFiles.expectedPath, "--review", urgentFiles.reviewPath)).status).toBe("valid")
  })
})

describe("mutation lease dispatch gate", () => {
  test("authorizes one exact canonical mechanical family and emits its fixer packet", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const authorized = await helper(
      fixture.repo,
      "cycle-authorize",
      "--repo", fixture.repo,
      "--state", cycle.statePath,
      "--paths-json", cycle.pathsPath,
      "--verification-json", cycle.verificationPath,
      "--family-json", cycle.familyPath,
      "--review", cycle.reviewPath,
      "--base", fixture.baseSha,
      "--packet", cycle.packetPath,
    )

    expect(authorized).toMatchObject({
      status: "authorized",
      branch: "main",
      head_sha: fixture.headSha,
      paths: ["active.txt"],
      state: cycle.statePath,
      packet: cycle.packetPath,
    })
    expect(authorized.lease_id).toMatch(/^[0-9a-f]{32}$/)
    const state = JSON.parse(await readFile(cycle.statePath, "utf8"))
    const packet = JSON.parse(await readFile(cycle.packetPath, "utf8"))
    expect(state).toMatchObject({ version: 2, phase: "authorized", lease_id: authorized.lease_id, base_sha: fixture.baseSha })
    expect(packet).toMatchObject({
      schema_version: 1,
      lease_id: authorized.lease_id,
      state_path: cycle.statePath,
      checkpoint_head: fixture.headSha,
      frozen_base: fixture.baseSha,
      review_run_id: "canonical-run",
      authorized_paths: ["active.txt"],
      first_action: "cycle-begin",
    })
    expect(packet.family.findings).toEqual([cycle.actionable])
  })

  test("rejects non-mechanical, noncanonical, and dirty authorization before state creation", async () => {
    const fixture = await createRepo()
    for (const mutation of ["decision", "finding", "dirty"] as const) {
      const cycle = await writeAuthorizationFiles(fixture)
      if (mutation === "decision") {
        await writeFile(cycle.familyPath, JSON.stringify({ family_id: "family-1", root_invariant: "choose behavior", finding_ids: [1], authority: "decision" }))
      } else if (mutation === "finding") {
        await writeFile(cycle.familyPath, JSON.stringify({ family_id: "family-1", root_invariant: "active value", finding_ids: [999], authority: "mechanical" }))
      } else {
        await writeFile(fixture.unrelatedPath, "owner=dirty\n")
      }
      const result = await helper(fixture.repo, "cycle-authorize", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath, "--family-json", cycle.familyPath, "--review", cycle.reviewPath, "--base", fixture.baseSha, "--packet", cycle.packetPath)
      expect(result.status).not.toBe("authorized")
      expect(await Bun.file(cycle.statePath).exists()).toBe(false)
      expect(await Bun.file(cycle.packetPath).exists()).toBe(false)
      if (mutation === "dirty") await writeFile(fixture.unrelatedPath, "owner=user\n")
    }
  })

  test("requires begin before mutation and enforces one writable lease per checkout across distinct runs", async () => {
    const fixture = await createRepo()
    const first = await writeAuthorizationFiles(fixture)
    const second = await writeAuthorizationFiles(fixture)
    const active = await authorizeCycle(fixture, first)
    expect(await authorizeCycle(fixture, second)).toMatchObject({ status: "lease_conflict" })
    expect(await helper(fixture.repo, "cycle-begin", "--repo", fixture.repo, "--state", first.statePath, "--lease", "0".repeat(32))).toMatchObject({ status: "lease_mismatch" })

    await writeFile(fixture.activePath, "value=edited-before-begin\n")
    expect(await helper(fixture.repo, "cycle-status", "--repo", fixture.repo, "--state", first.statePath, "--lease", active.lease_id)).toMatchObject({
      status: "protocol_violation",
      phase: "blocked",
      dirty_paths: ["active.txt"],
      mutation_permitted: false,
    })
  })

  test("serializes simultaneous authorization across distinct invocation roots", async () => {
    const fixture = await createRepo()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const first = await writeAuthorizationFiles(fixture)
      const second = await writeAuthorizationFiles(fixture)
      const results = await Promise.all([authorizeCycle(fixture, first), authorizeCycle(fixture, second)])
      expect(results.map((result) => result.status).sort()).toEqual(["authorized", "lease_conflict"])
      const winner = results[0].status === "authorized" ? { cycle: first, result: results[0] } : { cycle: second, result: results[1] }
      expect(await helper(fixture.repo, "cycle-cancel", "--repo", fixture.repo, "--state", winner.cycle.statePath, "--lease", winner.result.lease_id)).toMatchObject({ status: "canceled" })
    }
  })

  test("binds seal, cancel, scope expansion, restore, and commit to the same lease", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await helper(fixture.repo, "cycle-authorize", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath, "--family-json", cycle.familyPath, "--review", cycle.reviewPath, "--base", fixture.baseSha, "--packet", cycle.packetPath)
    expect(await helper(fixture.repo, "cycle-seal", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "invalid_phase" })
    expect(await helper(fixture.repo, "cycle-begin", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "dispatched" })
    expect(await helper(fixture.repo, "cycle-begin", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "invalid_phase" })
    await writeFile(fixture.activePath, "value=good\n")
    await writeFile(cycle.verificationPath, JSON.stringify({ status: "passed", checks: ["active value"], results: [{ check: "active value", status: "passed" }] }))
    expect(await helper(fixture.repo, "cycle-seal", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "sealed" })
    expect(await helper(fixture.repo, "cycle-commit", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", "f".repeat(32), "--message", "fix(review): wrong lease")).toMatchObject({ status: "lease_mismatch" })
    expect(await helper(fixture.repo, "cycle-commit", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id, "--message", "fix(review): correct active value")).toMatchObject({ status: "committed", clean: true })

    const next = await writeAuthorizationFiles({ ...fixture, headSha: await git(fixture.repo, "rev-parse", "HEAD") })
    const nextActive = await helper(fixture.repo, "cycle-authorize", "--repo", fixture.repo, "--state", next.statePath, "--paths-json", next.pathsPath, "--verification-json", next.verificationPath, "--family-json", next.familyPath, "--review", next.reviewPath, "--base", fixture.baseSha, "--packet", next.packetPath)
    expect(nextActive.status).toBe("authorized")
    expect(await helper(fixture.repo, "cycle-cancel", "--repo", fixture.repo, "--state", next.statePath, "--lease", nextActive.lease_id)).toMatchObject({ status: "canceled" })
  })
  test("rejects terminal verification that substitutes unauthorized checks", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await beginCycle(fixture, cycle)
    await writeFile(fixture.activePath, "value=good\n")
    await writeFile(cycle.verificationPath, JSON.stringify({ status: "passed", checks: ["different check"], results: [{ check: "different check", status: "passed" }] }))
    expect(await helper(fixture.repo, "cycle-seal", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "malformed", reason: "verification_json" })
  })

  test("rejects passed verification containing a failed check outcome", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await beginCycle(fixture, cycle)
    await writeFile(fixture.activePath, "value=good\n")
    await writeFile(cycle.verificationPath, JSON.stringify({ status: "passed", checks: ["active value"], results: [{ check: "active value", status: "failed" }] }))
    expect(await helper(fixture.repo, "cycle-seal", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "malformed", reason: "verification_json" })
  })

  test("rejects verification changed after sealing", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await beginCycle(fixture, cycle)
    await writeFile(fixture.activePath, "value=good\n")
    await writeFile(cycle.verificationPath, JSON.stringify({ status: "passed", checks: ["active value"], results: [{ check: "active value", status: "passed" }] }))
    expect(await helper(fixture.repo, "cycle-seal", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "sealed" })
    await writeFile(cycle.verificationPath, JSON.stringify({ status: "failed", checks: ["active value"], results: [{ check: "active value", status: "failed" }] }))
    expect(await helper(fixture.repo, "cycle-commit", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id, "--message", "fix(review): invalid verification")).toMatchObject({ status: "malformed", reason: "verification_seal", phase: "blocked" })
  })
  test("serializes concurrent begin and recovery of one authorized lease", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await authorizeCycle(fixture, cycle)
    const results = await Promise.all([
      helper(fixture.repo, "cycle-begin", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id),
      helper(fixture.repo, "cycle-recover", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id),
    ])
    const statuses = results.map((result) => result.status)
    expect(statuses.filter((status) => status === "dispatched" || status === "recovered")).toHaveLength(1)
    expect(statuses.some((status) => ["transition_conflict", "invalid_phase", "registry_invalid"].includes(status))).toBe(true)
    const state = JSON.parse(await readFile(cycle.statePath, "utf8"))
    if (state.phase === "dispatched") {
      const next = await writeAuthorizationFiles(fixture)
      expect((await authorizeCycle(fixture, next)).status).toBe("lease_conflict")
    } else {
      expect(state.phase).toBe("abandoned")
    }
  })
  test("serializes concurrent begin and cancellation of one authorized lease", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await authorizeCycle(fixture, cycle)
    const results = await Promise.all([
      helper(fixture.repo, "cycle-begin", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id),
      helper(fixture.repo, "cycle-cancel", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id),
    ])
    expect(results.filter((result) => result.status === "dispatched" || result.status === "canceled")).toHaveLength(1)
    expect(results.some((result) => ["transition_conflict", "invalid_phase", "registry_invalid"].includes(result.status))).toBe(true)
  })

  test("recovers an abandoned claimed state owned by a dead process", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await authorizeCycle(fixture, cycle)
    const staleClaim = `${cycle.statePath}.transition.2147483647.stale`
    await rename(cycle.statePath, staleClaim)
    expect(await helper(fixture.repo, "cycle-recover", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "recovered" })
  })
  test("allows only one concurrent transition claimant", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await authorizeCycle(fixture, cycle)
    await writeFile(`${cycle.statePath}.transition.lock`, JSON.stringify({ pid: 2147483647, started_at: 0 }), { mode: 0o600 })
    const results = await Promise.all([
      helper(fixture.repo, "cycle-begin", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id),
      helper(fixture.repo, "cycle-recover", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id),
    ])
    expect(results.filter((result) => result.status === "dispatched" || result.status === "recovered")).toHaveLength(1)
    expect(results.some((result) => ["transition_conflict", "invalid_phase", "registry_invalid"].includes(result.status))).toBe(true)
  })
  test("fails closed on multiple abandoned claimed states", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await authorizeCycle(fixture, cycle)
    await rename(cycle.statePath, `${cycle.statePath}.transition.2147483647.one`)
    await writeFile(`${cycle.statePath}.transition.2147483646.two`, JSON.stringify({ version: 2 }), { mode: 0o600 })
    expect(await helper(fixture.repo, "cycle-recover", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "transition_conflict" })
  })
  test("completes registry release from a stale terminal claim", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await authorizeCycle(fixture, cycle)
    const state = JSON.parse(await readFile(cycle.statePath, "utf8"))
    state.phase = "abandoned"
    state.terminal_reason = "recovered_before_begin"
    await rename(cycle.statePath, `${cycle.statePath}.transition.2147483647.terminal`)
    await writeFile(`${cycle.statePath}.transition.2147483647.terminal`, JSON.stringify(state), { mode: 0o600 })
    expect(await helper(fixture.repo, "cycle-recover", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "invalid_phase", phase: "abandoned" })
    const next = await writeAuthorizationFiles(fixture)
    expect((await authorizeCycle(fixture, next)).status).not.toBe("lease_conflict")
  })






  test("recovers only an unchanged abandoned pre-begin lease", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await authorizeCycle(fixture, cycle)
    expect(await helper(fixture.repo, "cycle-recover", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "recovered" })
    const next = await writeAuthorizationFiles(fixture)
    const nextActive = await authorizeCycle(fixture, next)
    expect(nextActive.status).toBe("authorized")

    const dirtyCycle = await writeAuthorizationFiles(fixture)
    expect(await helper(fixture.repo, "cycle-cancel", "--repo", fixture.repo, "--state", next.statePath, "--lease", nextActive.lease_id)).toMatchObject({ status: "canceled" })
    const dirtyActive = await authorizeCycle(fixture, dirtyCycle)
    await writeFile(fixture.activePath, "value=dirty-abandoned\n")
    const rejected = await helper(fixture.repo, "cycle-recover", "--repo", fixture.repo, "--state", dirtyCycle.statePath, "--lease", dirtyActive.lease_id)
    expect(rejected.status).not.toBe("recovered")
    expect(rejected.status).toBe("protocol_violation")

    const dispatchedFixture = await createRepo()
    const dispatchedCycle = await writeAuthorizationFiles(dispatchedFixture)
    const dispatched = await beginCycle(dispatchedFixture, dispatchedCycle)
    expect(await helper(dispatchedFixture.repo, "cycle-recover", "--repo", dispatchedFixture.repo, "--state", dispatchedCycle.statePath, "--lease", dispatched.lease_id)).toMatchObject({ status: "invalid_phase", phase: "dispatched" })

    const blocked = await writeAuthorizationFiles(dispatchedFixture)
    expect((await authorizeCycle(dispatchedFixture, blocked)).status).toBe("lease_conflict")
  })
  test("releases the registry when a claimed status check blocks the lease", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await authorizeCycle(fixture, cycle)
    await writeFile(fixture.activePath, "value=dirty-abandoned\n")
    expect(await helper(fixture.repo, "cycle-cancel", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "protocol_violation", phase: "blocked" })
    await writeFile(fixture.activePath, "value=bad\n")
    const next = await writeAuthorizationFiles(fixture)
    expect((await authorizeCycle(fixture, next)).status).not.toBe("lease_conflict")
  })
  test("terminalizes invalid scope-expansion paths and releases the registry", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await beginCycle(fixture, cycle)
    const resultPath = path.join(cycle.runRoot, "invalid-scope-expansion.json")
    await writeFile(resultPath, JSON.stringify({ status: "scope_expansion", lease_id: active.lease_id, requested_paths: ["../escape"], reason: "needs unsafe path", evidence: ["fixture"] }))
    expect(await helper(fixture.repo, "cycle-scope-expansion", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id, "--result", resultPath)).toMatchObject({ status: "malformed", reason: "scope_paths", phase: "blocked" })
    const next = await writeAuthorizationFiles(fixture)
    expect((await authorizeCycle(fixture, next)).status).not.toBe("lease_conflict")
  })



  test("restores a failed leased cycle, releases the registry, and rejects terminal lease reuse", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await beginCycle(fixture, cycle)
    await writeFile(fixture.activePath, "value=broken-fix\n")
    await writeFile(cycle.verificationPath, JSON.stringify({ status: "failed", checks: ["active value"], results: [{ check: "active value", status: "failed" }] }))
    expect(await helper(fixture.repo, "cycle-seal", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "sealed", verification_status: "failed" })
    expect(await helper(fixture.repo, "cycle-restore", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", "f".repeat(32))).toMatchObject({ status: "lease_mismatch" })
    expect(await helper(fixture.repo, "cycle-restore", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "restored", clean: true })
    expect(await helper(fixture.repo, "cycle-restore", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "invalid_phase", phase: "restored" })
    const next = await writeAuthorizationFiles(fixture)
    expect((await authorizeCycle(fixture, next)).status).toBe("authorized")
  })
  test("serializes competing restore and commit transitions", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await beginCycle(fixture, cycle)
    await writeFile(fixture.activePath, "value=verified\n")
    await writeFile(cycle.verificationPath, JSON.stringify({ status: "passed", checks: ["active value"], results: [{ check: "active value", status: "passed" }] }))
    expect(await helper(fixture.repo, "cycle-seal", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "sealed" })
    const results = await Promise.all([
      helper(fixture.repo, "cycle-restore", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id),
      helper(fixture.repo, "cycle-commit", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id, "--message", "fix(review): serialized terminal transition"),
    ])
    expect(results.filter((result) => result.status === "restored" || result.status === "committed")).toHaveLength(1)
    expect(results.some((result) => ["transition_conflict", "invalid_phase", "registry_invalid"].includes(result.status))).toBe(true)
  })


  test("terminalizes a rejecting commit hook and permits fresh authorization", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await beginCycle(fixture, cycle)
    await writeFile(fixture.activePath, "value=verified\n")
    await writeFile(cycle.verificationPath, JSON.stringify({ status: "passed", checks: ["active value"], results: [{ check: "active value", status: "passed" }] }))
    expect(await helper(fixture.repo, "cycle-seal", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "sealed" })
    await installPreCommitHook(fixture, "exit 1")
    const failed = await helper(fixture.repo, "cycle-commit", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id, "--message", "fix(review): rejected")
    expect(failed).toMatchObject({ status: "commit_failed", phase: "blocked", lease_id: active.lease_id })
    expect(failed.reason).toBeString()
    expect(JSON.parse(await readFile(cycle.statePath, "utf8"))).toMatchObject({ phase: "blocked", terminal_reason: "commit_failed" })
    const dirtyNext = await writeAuthorizationFiles(fixture)
    expect((await authorizeCycle(fixture, dirtyNext)).status).toBe("concurrent_change")
    await git(fixture.repo, "reset", "--mixed", "HEAD")
    await writeFile(fixture.activePath, "value=bad\n")
    const cleanNext = await writeAuthorizationFiles(fixture)
    expect((await authorizeCycle(fixture, cleanNext)).status).toBe("authorized")
  })

  test("terminalizes commit integrity failure without rewriting created history", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await beginCycle(fixture, cycle)
    await writeFile(fixture.activePath, "value=verified\n")
    await writeFile(cycle.verificationPath, JSON.stringify({ status: "passed", checks: ["active value"], results: [{ check: "active value", status: "passed" }] }))
    expect(await helper(fixture.repo, "cycle-seal", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "sealed" })
    await installPreCommitHook(fixture, "printf 'value=hook-mutated\\n' > active.txt\ngit add -- active.txt")
    const failed = await helper(fixture.repo, "cycle-commit", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id, "--message", "fix(review): hook mutation")
    expect(failed).toMatchObject({ status: "commit_integrity_failure", reason: "committed_snapshot_mismatch", phase: "blocked", clean: true })
    expect(await git(fixture.repo, "show", "HEAD:active.txt")).toBe("value=hook-mutated")
    const nextFixture = { ...fixture, headSha: await git(fixture.repo, "rev-parse", "HEAD") }
    const next = await writeAuthorizationFiles(nextFixture)
    expect((await authorizeCycle(nextFixture, next)).status).toBe("authorized")
  })


  test("requires scope expansion before any edit and releases the checkout lease", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await helper(fixture.repo, "cycle-authorize", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath, "--family-json", cycle.familyPath, "--review", cycle.reviewPath, "--base", fixture.baseSha, "--packet", cycle.packetPath)
    const resultPath = path.join(cycle.runRoot, "scope-expansion.json")
    await writeFile(resultPath, JSON.stringify({ status: "scope_expansion", lease_id: active.lease_id, requested_paths: ["unrelated.txt"], reason: "caller contract", evidence: ["unrelated.txt:1"] }))
    expect(await helper(fixture.repo, "cycle-scope-expansion", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id, "--result", resultPath)).toMatchObject({ status: "scope_expansion", requested_paths: ["unrelated.txt"] })
    const next = await writeAuthorizationFiles(fixture)
    expect((await helper(fixture.repo, "cycle-authorize", "--repo", fixture.repo, "--state", next.statePath, "--paths-json", next.pathsPath, "--verification-json", next.verificationPath, "--family-json", next.familyPath, "--review", next.reviewPath, "--base", fixture.baseSha, "--packet", next.packetPath)).status).toBe("authorized")
  })

  test("does not delete pre-existing state or packet artifacts when authorization fails", async () => {
    const fixture = await createRepo()
    for (const occupied of ["state", "packet"] as const) {
      const cycle = await writeAuthorizationFiles(fixture)
      const occupiedPath = occupied === "state" ? cycle.statePath : cycle.packetPath
      await writeFile(occupiedPath, `user-owned-${occupied}\n`)
      const result = await helper(fixture.repo, "cycle-authorize", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath, "--family-json", cycle.familyPath, "--review", cycle.reviewPath, "--base", fixture.baseSha, "--packet", cycle.packetPath)
      expect(result).toMatchObject({ status: "malformed", reason: "artifact_exists" })
      expect(await readFile(occupiedPath, "utf8")).toBe(`user-owned-${occupied}\n`)
    }
  })

  test("rejects authorization envelopes missing canonical triage groups", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const review = JSON.parse(await readFile(cycle.reviewPath, "utf8"))
    delete review.triage_groups
    await writeFile(cycle.reviewPath, JSON.stringify(review))
    expect(await authorizeCycle(fixture, cycle)).toMatchObject({ status: "malformed", reason: "review_shape" })
    expect(await Bun.file(cycle.statePath).exists()).toBe(false)
    expect(await Bun.file(cycle.packetPath).exists()).toBe(false)
  })

  test("terminalizes a pre-begin violation and releases the checkout registry", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const active = await helper(fixture.repo, "cycle-authorize", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath, "--family-json", cycle.familyPath, "--review", cycle.reviewPath, "--base", fixture.baseSha, "--packet", cycle.packetPath)
    await writeFile(fixture.activePath, "value=premature\n")
    expect(await helper(fixture.repo, "cycle-status", "--repo", fixture.repo, "--state", cycle.statePath, "--lease", active.lease_id)).toMatchObject({ status: "protocol_violation", phase: "blocked" })
    const state = JSON.parse(await readFile(cycle.statePath, "utf8"))
    expect(state).toMatchObject({ phase: "blocked", terminal_reason: "protocol_violation" })
    await writeFile(fixture.activePath, "value=bad\n")
    const next = await writeAuthorizationFiles(fixture, ["active.txt"], cycle.runRoot)
    expect((await helper(fixture.repo, "cycle-authorize", "--repo", fixture.repo, "--state", next.statePath, "--paths-json", next.pathsPath, "--verification-json", next.verificationPath, "--family-json", next.familyPath, "--review", next.reviewPath, "--base", fixture.baseSha, "--packet", next.packetPath)).status).toBe("authorized")
  })

  test("rejects high-confidence findings without first evidence", async () => {
    const fixture = await createRepo()
    const actionable = finding(1)
    const review = validReview(fixture, { verdict: "Ready with fixes", findings: [actionable], actionable_findings: [actionable] })
    delete review.findings[0].first_evidence
    delete review.actionable_findings[0].first_evidence
    const validation = await writeValidationFiles(fixture, review)
    expect(await helper(fixture.repo, "validate-review", "--repo", fixture.repo, "--expected", validation.expectedPath, "--review", validation.reviewPath)).toMatchObject({ status: "malformed", reason: "review_shape" })
  })
  test("rejects high-confidence findings whose first evidence is unrelated", async () => {
    const fixture = await createRepo()
    const actionable = finding(1)
    actionable.first_evidence = "different evidence"
    const review = validReview(fixture, { verdict: "Ready with fixes", findings: [actionable], actionable_findings: [actionable] })
    const validation = await writeValidationFiles(fixture, review)
    expect(await helper(fixture.repo, "validate-review", "--repo", fixture.repo, "--expected", validation.expectedPath, "--review", validation.reviewPath)).toMatchObject({ status: "malformed", reason: "review_shape" })
  })


  test("rejects an impossible canonical reviewer roster during authorization", async () => {
    const fixture = await createRepo()
    const cycle = await writeAuthorizationFiles(fixture)
    const review = JSON.parse(await readFile(cycle.reviewPath, "utf8"))
    review.review_receipt.selected_reviewers = ["correctness-reviewer", "security-reviewer"]
    review.review_receipt.required_reviewers = ["correctness-reviewer"]
    review.review_receipt.completed_reviewers = ["correctness-reviewer"]
    review.review_receipt.failed_reviewers = []
    review.reviewers = ["correctness", "security"]
    await writeFile(cycle.reviewPath, JSON.stringify(review))
    expect(await helper(fixture.repo, "cycle-authorize", "--repo", fixture.repo, "--state", cycle.statePath, "--paths-json", cycle.pathsPath, "--verification-json", cycle.verificationPath, "--family-json", cycle.familyPath, "--review", cycle.reviewPath, "--base", fixture.baseSha, "--packet", cycle.packetPath)).toMatchObject({ status: "malformed" })
    expect(await Bun.file(cycle.statePath).exists()).toBe(false)
  })
})
