import { mkdtempSync, mkdirSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { spawnSync } from "node:child_process"
import { describe, expect, test } from "bun:test"

const SKILL_DIR = path.join(process.cwd(), "skills", "ce-code-review")
const SCOPE_SCRIPT = path.join(SKILL_DIR, "scripts", "review-scope.py")
const FINDINGS_SCRIPT = path.join(SKILL_DIR, "scripts", "findings-mechanics.py")

function run(command: string, args: string[], cwd?: string, input?: string) {
  return spawnSync(command, args, { cwd, input, encoding: "utf8" })
}

function git(cwd: string, ...args: string[]) {
  const result = run("git", args, cwd)
  expect(result.status).toBe(0)
  return result.stdout.trim()
}

function fixtureRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "ce-review-scope-"))
  git(dir, "init", "-q")
  git(dir, "config", "user.email", "eval@example.com")
  git(dir, "config", "user.name", "Eval")
  writeFileSync(path.join(dir, "service.ts"), "export const value = 1\n")
  git(dir, "add", ".")
  git(dir, "commit", "-qm", "base")
  const base = git(dir, "rev-parse", "HEAD")
  return { dir, base }
}

describe("ce-code-review deterministic mechanics", () => {
  test("scope helper counts executable changes and fails closed on uncounted files", () => {
    const { dir, base } = fixtureRepo()
    mkdirSync(path.join(dir, "docs"))
    writeFileSync(path.join(dir, "service.ts"), "export const value = 2\n")
    writeFileSync(path.join(dir, "docs", "note.md"), "context\n")
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.exec_lines).toBe(2)
    expect(scope.uncounted_files).toBe(1)
    expect(scope.changed_files).toEqual(["docs/note.md", "service.ts"])
    expect(scope.lite_eligible).toBe(false)
  })

  test("scope helper emits UNKNOWN-equivalent state for an invalid endpoint", () => {
    const { dir } = fixtureRepo()
    const result = run("python3", [SCOPE_SCRIPT, "--base", "missing-ref"], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.exec_lines).toBeNull()
    expect(scope.uncounted_files).toBeGreaterThan(0)
    expect(scope.lite_eligible).toBe(false)
  })

  test("scope helper resolves the learnings corpus under a configured docs_root", () => {
    const { dir, base } = fixtureRepo()
    // Corpus lives under a relocated root, not the default docs/.
    mkdirSync(path.join(dir, ".ce-artifacts", "solutions"), { recursive: true })
    mkdirSync(path.join(dir, "docs", "solutions"), { recursive: true })

    // Default root sees the legacy docs/solutions corpus.
    const dflt = JSON.parse(run("python3", [SCOPE_SCRIPT, "--base", base], dir).stdout)
    expect(dflt.has_learnings_corpus).toBe(true)

    // Configured root targets its own solutions dir.
    const configured = JSON.parse(
      run("python3", [SCOPE_SCRIPT, "--base", base, "--docs-root", ".ce-artifacts"], dir).stdout,
    )
    expect(configured.has_learnings_corpus).toBe(true)

    // A configured root with no corpus reports absent, without reading docs/.
    const empty = JSON.parse(
      run("python3", [SCOPE_SCRIPT, "--base", base, "--docs-root", ".ce-empty"], dir).stdout,
    )
    expect(empty.has_learnings_corpus).toBe(false)
  })

  test("scope helper treats an absolute or escaping docs_root as no corpus, not a crash", () => {
    const { dir, base } = fixtureRepo()
    mkdirSync(path.join(dir, "docs", "solutions"), { recursive: true })
    for (const badRoot of ["/etc", "../outside", ".git/hooks"]) {
      const result = run("python3", [SCOPE_SCRIPT, "--base", base, "--docs-root", badRoot], dir)
      expect(result.status).toBe(0) // read-only signal generator: degrade, never fail the scope calc
      expect(JSON.parse(result.stdout).has_learnings_corpus).toBe(false)
    }
  })

  test("scope helper resolves docs_root against the git toplevel, not the cwd subdirectory", () => {
    const { dir, base } = fixtureRepo()
    mkdirSync(path.join(dir, ".ce-artifacts", "solutions"), { recursive: true })
    const subdir = path.join(dir, "packages", "inner")
    mkdirSync(subdir, { recursive: true })
    // Run from a subdirectory: docs_root is repo-relative, so the corpus must
    // still resolve under the repo root, not <subdir>/.ce-artifacts/solutions.
    const result = run("python3", [SCOPE_SCRIPT, "--base", base, "--docs-root", ".ce-artifacts"], subdir)
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).has_learnings_corpus).toBe(true)
  })

  test("scope helper falls back to the default root for an unsubstituted or empty docs_root", () => {
    const { dir, base } = fixtureRepo()
    mkdirSync(path.join(dir, "docs", "solutions"), { recursive: true })
    // A caller that forgets to substitute the <root> placeholder, or passes an
    // empty value, must still find the default docs/solutions corpus.
    for (const value of ["<root>", ""]) {
      const result = run("python3", [SCOPE_SCRIPT, "--base", base, "--docs-root", value], dir)
      expect(result.status).toBe(0)
      expect(JSON.parse(result.stdout).has_learnings_corpus).toBe(true)
    }
  })

  test("scope helper fails closed when a remote head endpoint is empty", () => {
    const { dir, base } = fixtureRepo()
    writeFileSync(path.join(dir, "service.ts"), "export const value = 2\n")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base, "--head", ""], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.reason).toBe("invalid head endpoint")
    expect(scope.exec_lines).toBeNull()
    expect(scope.changed_files).toEqual([])
    expect(scope.lite_eligible).toBe(false)
  })

  test("scope helper excludes base-only changes after the base advances", () => {
    const { dir, base } = fixtureRepo()
    git(dir, "checkout", "-qb", "review-head")
    writeFileSync(path.join(dir, "worker.ts"), "export const worker = true\n")
    git(dir, "add", ".")
    git(dir, "commit", "-qm", "head change")
    const head = git(dir, "rev-parse", "HEAD")

    git(dir, "checkout", "-q", base)
    mkdirSync(path.join(dir, "api"))
    writeFileSync(path.join(dir, "api", "routes.test.ts"), "export const route = true\n")
    git(dir, "add", ".")
    git(dir, "commit", "-qm", "advance base")
    const advancedBase = git(dir, "rev-parse", "HEAD")

    const result = run(
      "python3",
      [SCOPE_SCRIPT, "--base", advancedBase, "--head", head],
      dir,
    )
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.changed_files).toEqual(["worker.ts"])
    expect(scope.signals).toEqual([])
    expect(scope.test_files_changed).toBe(false)
    expect(scope.exec_lines).toBe(1)
  })

  test("findings helper validates, exact-deduplicates, gates, sorts, and numbers", () => {
    const returns = [
      {
        reviewer: "correctness",
        findings: [
          {
            title: "Primary defect",
            severity: "P1",
            file: "src/worker.ts",
            line: 12,
            confidence: 75,
            autofix_class: "gated_auto",
            owner: "downstream-resolver",
            requires_verification: true,
            pre_existing: false,
            first_evidence: "src/worker.ts:12 -- result = staleValue",
          },
        ],
        residual_risks: [],
        testing_gaps: [],
      },
      {
        reviewer: "reliability",
        findings: [
          {
            title: "Primary defect",
            severity: "P1",
            file: "src/worker.ts",
            line: 12,
            confidence: 75,
            autofix_class: "manual",
            owner: "human",
            requires_verification: true,
            pre_existing: false,
            first_evidence: "src/worker.ts:12 -- result = staleValue",
          },
          {
            title: "Speculative cleanup",
            severity: "P3",
            file: "src/worker.ts",
            line: 2,
            confidence: 50,
            autofix_class: "advisory",
            owner: "human",
            requires_verification: false,
            pre_existing: false,
          },
        ],
        residual_risks: [],
        testing_gaps: [],
      },
    ]

    const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.findings).toHaveLength(1)
    expect(merged.findings[0]["#"]).toBe(1)
    expect(merged.findings[0].confidence).toBe(100)
    expect(merged.findings[0].autofix_class).toBe("manual")
    expect(merged.findings[0].owner).toBe("human")
    expect(merged.findings[0].reviewers).toEqual(["correctness", "reliability"])
    expect(merged.findings[0].independent_reviewers).toEqual(["correctness", "reliability"])
    expect(merged.suppressed_by_confidence).toEqual({ "50": 1 })
  })

  test("synthetic reruns preserve independent corroboration from semantic duplicates", () => {
    const reconciled = {
      title: "Reconciled stale-state defect",
      severity: "P1",
      file: "src/worker.ts",
      line: 12,
      confidence: 50,
      autofix_class: "manual",
      owner: "human",
      requires_verification: true,
      pre_existing: false,
      first_evidence: "src/worker.ts:12 -- result = staleValue",
      reviewers: ["correctness", "testing"],
      independent_reviewers: ["correctness", "testing"],
    }

    const result = run(
      "python3",
      [FINDINGS_SCRIPT],
      undefined,
      JSON.stringify([
        {
          reviewer: "synthesis",
          findings: [reconciled],
          residual_risks: [],
          testing_gaps: [],
        },
      ]),
    )
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.suppressed_findings).toEqual([])
    expect(merged.findings).toEqual([
      expect.objectContaining({
        title: reconciled.title,
        confidence: 75,
        reviewers: ["correctness", "testing"],
        independent_reviewers: ["correctness", "testing"],
      }),
    ])
  })

  test("synthetic reruns do not infer independence from reviewer attribution", () => {
    const result = run(
      "python3",
      [FINDINGS_SCRIPT],
      undefined,
      JSON.stringify([
        {
          reviewer: "synthesis",
          findings: [
            {
              title: "Unverified peer agreement",
              severity: "P1",
              file: "src/worker.ts",
              line: 12,
              confidence: 50,
              autofix_class: "manual",
              owner: "human",
              requires_verification: true,
              pre_existing: false,
              first_evidence: "src/worker.ts:12 -- result = staleValue",
              reviewers: ["correctness", "adversarial-cursor"],
              independent_reviewers: ["correctness"],
            },
          ],
          residual_risks: [],
          testing_gaps: [],
        },
      ]),
    )
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.findings).toEqual([])
    expect(merged.suppressed_findings).toEqual([
      expect.objectContaining({
        confidence: 50,
        reviewers: ["correctness", "adversarial-cursor"],
        independent_reviewers: ["correctness"],
      }),
    ])
  })

  test("confidence-gated testing advisories remain available for soft-bucket routing", () => {
    const returns = [
      {
        reviewer: "testing",
        findings: [
          {
            title: "Missing retry coverage",
            severity: "P2",
            file: "tests/worker.test.ts",
            line: 24,
            confidence: 50,
            autofix_class: "advisory",
            owner: "human",
            requires_verification: false,
            pre_existing: false,
          },
        ],
        residual_risks: [],
        testing_gaps: [],
      },
    ]

    const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.findings).toEqual([])
    expect(merged.suppressed_findings).toEqual([
      expect.objectContaining({
        title: "Missing retry coverage",
        confidence: 50,
        reviewers: ["testing"],
      }),
    ])
    expect(merged.suppressed_by_confidence).toEqual({ "50": 1 })
  })

  test("findings helper rejects boolean line values", () => {
    const returns = [
      {
        reviewer: "correctness",
        findings: [
          {
            title: "Invalid boolean line",
            severity: "P1",
            file: "src/worker.ts",
            line: true,
            confidence: 75,
            autofix_class: "manual",
            owner: "human",
            requires_verification: true,
            pre_existing: false,
          },
        ],
        residual_risks: [],
        testing_gaps: [],
      },
    ]

    const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.findings).toEqual([])
    expect(merged.malformed_findings).toBe(1)
  })

  test("findings helper rejects boolean confidence values", () => {
    const returns = [
      {
        reviewer: "correctness",
        findings: [
          {
            title: "Invalid boolean confidence",
            severity: "P0",
            file: "src/worker.ts",
            line: 12,
            confidence: false,
            autofix_class: "manual",
            owner: "human",
            requires_verification: true,
            pre_existing: false,
          },
        ],
        residual_risks: [],
        testing_gaps: [],
      },
    ]

    const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.findings).toEqual([])
    expect(merged.malformed_findings).toBe(1)
  })

  test("findings helper rejects malformed optional evidence without rejecting absence", () => {
    const finding = {
      severity: "P1",
      file: "src/worker.ts",
      confidence: 75,
      autofix_class: "manual",
      owner: "human",
      requires_verification: true,
      pre_existing: false,
    }
    const returns = [
      {
        reviewer: "correctness",
        findings: [
          { ...finding, title: "Boolean evidence", line: 10, first_evidence: true },
          { ...finding, title: "Numeric evidence", line: 11, first_evidence: 42 },
          { ...finding, title: "Whitespace evidence", line: 12, first_evidence: " \n\t" },
          { ...finding, title: "Optional evidence omitted", line: 13 },
        ],
        residual_risks: [],
        testing_gaps: [],
      },
    ]

    const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.findings).toEqual([])
    expect(merged.malformed_findings).toBe(3)
    expect(merged.suppressed_findings).toEqual([
      expect.objectContaining({
        title: "Optional evidence omitted",
        confidence: 50,
      }),
    ])
  })

  test("findings helper keeps settled decisions, caps fast-pass, and sorts by confidence", () => {
    const returns = [
      {
        reviewer: "synthesis",
        findings: [
          {
            title: "Settled implementation preference",
            severity: "P3",
            file: "src/z.ts",
            line: 9,
            confidence: 50,
            autofix_class: "advisory",
            owner: "human",
            requires_verification: false,
            pre_existing: false,
            settled_conflict: "KTD-2",
          },
          {
            title: "Lower confidence",
            severity: "P1",
            file: "src/a.ts",
            line: 2,
            confidence: 75,
            autofix_class: "manual",
            owner: "downstream-resolver",
            requires_verification: true,
            pre_existing: false,
            first_evidence: "src/a.ts:2 -- lower",
          },
          {
            title: "Higher confidence",
            severity: "P1",
            file: "src/z.ts",
            line: 3,
            confidence: 100,
            autofix_class: "manual",
            owner: "downstream-resolver",
            requires_verification: true,
            pre_existing: false,
            first_evidence: "src/z.ts:3 -- higher",
          },
        ],
        residual_risks: [],
        testing_gaps: [],
      },
      {
        reviewer: "fast-pass",
        findings: [
          {
            title: "Uncorroborated preliminary issue",
            severity: "P1",
            file: "src/fast.ts",
            line: 4,
            confidence: 100,
            autofix_class: "manual",
            owner: "downstream-resolver",
            requires_verification: true,
            pre_existing: false,
            first_evidence: "src/fast.ts:4 -- preliminary",
          },
        ],
        residual_risks: [],
        testing_gaps: [],
      },
    ]

    const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.findings.map((finding: { title: string }) => finding.title)).toEqual([
      "Higher confidence",
      "Lower confidence",
      "Settled implementation preference",
    ])
    expect(merged.findings[2].settled_conflict).toBe("KTD-2")
    expect(merged.suppressed_by_confidence).toEqual({ "50": 1 })
  })

  test("synthetic rerun preserves an orchestrator-stamped suppressed settled preference", () => {
    const preference = {
      title: "Prefer the rejected cache layout",
      severity: "P3",
      file: "src/cache.ts",
      line: 18,
      confidence: 50,
      autofix_class: "advisory",
      owner: "human",
      requires_verification: false,
      pre_existing: false,
    }
    const firstPass = run(
      "python3",
      [FINDINGS_SCRIPT],
      undefined,
      JSON.stringify([
        {
          reviewer: "maintainability",
          findings: [preference],
          residual_risks: [],
          testing_gaps: [],
        },
      ]),
    )
    expect(firstPass.status).toBe(0)
    const initiallyMerged = JSON.parse(firstPass.stdout)
    expect(initiallyMerged.findings).toEqual([])
    expect(initiallyMerged.suppressed_findings).toHaveLength(1)
    expect(initiallyMerged.suppressed_findings[0].settled_conflict).toBeUndefined()

    const stamped = {
      ...initiallyMerged.suppressed_findings[0],
      settled_conflict: "KTD-cache-layout",
      autofix_class: "advisory",
      owner: "human",
    }
    const rerun = run(
      "python3",
      [FINDINGS_SCRIPT],
      undefined,
      JSON.stringify([
        {
          reviewer: "synthesis",
          findings: [stamped],
          residual_risks: [],
          testing_gaps: [],
        },
      ]),
    )
    expect(rerun.status).toBe(0)
    const reconciled = JSON.parse(rerun.stdout)
    expect(reconciled.suppressed_findings).toEqual([])
    expect(reconciled.findings).toEqual([
      expect.objectContaining({
        title: preference.title,
        confidence: 50,
        settled_conflict: "KTD-cache-layout",
        autofix_class: "advisory",
        owner: "human",
      }),
    ])
  })

  test("exact duplicates stay current and preserve settlement metadata when reviewers disagree", () => {
    const finding = {
      title: "Conflicting classification",
      severity: "P2",
      file: "src/state.ts",
      line: 8,
      confidence: 50,
      autofix_class: "advisory",
      owner: "human",
      requires_verification: false,
      first_evidence: "src/state.ts:8 -- return priorState",
    }
    const returns = [
      {
        reviewer: "correctness",
        findings: [{ ...finding, pre_existing: true }],
        residual_risks: [],
        testing_gaps: [],
      },
      {
        reviewer: "project-standards",
        findings: [{ ...finding, pre_existing: false, settled_conflict: "KTD-4" }],
        residual_risks: [],
        testing_gaps: [],
      },
    ]

    const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.pre_existing_findings).toEqual([])
    expect(merged.findings).toHaveLength(1)
    expect(merged.findings[0].pre_existing).toBe(false)
    expect(merged.findings[0].settled_conflict).toBe("KTD-4")
  })
})
