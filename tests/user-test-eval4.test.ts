import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const REPO_ROOT = path.join(__dirname, "..")
const EVAL4_SCRIPT = path.join(
  REPO_ROOT,
  "skills/ce-user-test-eval/scripts/eval4-ledger-coverage.py",
)
const PYTHON = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3")

type Project = {
  dir: string
  flows: string
  runJson: string
  ledger: string
  bugs: string
  report: string
}

function makeProject(): Project {
  const dir = mkdtempSync(path.join(tmpdir(), "ce-user-test-eval4-"))
  const flows = path.join(dir, "tests/user-flows")
  mkdirSync(flows, { recursive: true })
  return {
    dir,
    flows,
    runJson: path.join(flows, ".user-test-last-run.json"),
    ledger: path.join(flows, ".user-test-anomalies.jsonl"),
    bugs: path.join(flows, "bugs.md"),
    report: path.join(flows, ".user-test-last-report.md"),
  }
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n")
}

function baseRun(overrides: Record<string, unknown> = {}): any {
  return {
    run_timestamp: "2026-07-01T12:00:00Z",
    scenario_slug: "checkout-quality",
    schema_version: 11,
    completed: true,
    final_execution_index: 2,
    disconnects: { count: 0, contexts: [] },
    anomalies: [],
    explore_next_run: [],
    verification_results: [],
    ...overrides,
  }
}

function ledgerText(run: any, entries: any[], header: Record<string, unknown> = {}): string {
  return [
    {
      ledger_version: 1,
      run_timestamp: run.run_timestamp,
      scenario_slug: run.scenario_slug,
      ...header,
    },
    ...entries,
  ].map((line) => JSON.stringify(line)).join("\n") + "\n"
}

function ledgerDigest(text: string): { lines: number; sha256: string } {
  const trimmed = text.replace(/\r?\n$/, "")
  return {
    lines: trimmed === "" ? 0 : trimmed.split(/\r?\n/).length,
    sha256: createHash("sha256").update(text, "utf8").digest("hex"),
  }
}

function writeLedger(
  project: Project,
  run: any,
  entries: any[],
  header: Record<string, unknown> = {},
): void {
  const text = ledgerText(run, entries, header)
  writeFileSync(project.ledger, text)
  run.anomaly_ledger_digest = ledgerDigest(text)
}

function writeArtifacts(project: Project, run: any): void {
  writeJson(project.runJson, run)
  writeFileSync(project.bugs, "#101 Existing checkout issue\n")
  writeFileSync(project.report, "# User Test Report\n\ncheckout/cart report detail\n")
}

function runEval4(project: Project): any {
  const result = spawnSync(
    PYTHON,
    [
      EVAL4_SCRIPT,
      "--run-json",
      project.runJson,
      "--ledger",
      project.ledger,
      "--bugs",
      project.bugs,
      "--report",
      project.report,
    ],
    {
      cwd: project.dir,
      encoding: "utf8",
    },
  )
  expect(result.status).toBe(0)
  expect(result.stderr ?? "").toBe("")
  return JSON.parse(result.stdout ?? "{}")
}

function validationCodes(output: any): string[] {
  return output.errors.map((error: any) => error.validation_code).filter(Boolean)
}

describe("ce-user-test-eval Eval 4 ledger coverage", () => {
  test("tiling gap without disconnects fails", () => {
    const project = makeProject()
    const run = baseRun({ final_execution_index: 5 })
    writeLedger(project, run, [
      { area: "pre-area", kind: "none", index_range: [0, 1] },
      { area: "checkout/cart", kind: "none", index_range: [4, 5] },
    ])
    writeArtifacts(project, run)

    const output = runEval4(project)

    expect(output.verdict).toBe("FAIL")
    expect(output.pass).toBe(false)
    expect(validationCodes(output)).toContain("ledger_tiling")
  })

  test("marker-stamped run without a matching ledger is NA", () => {
    const project = makeProject()
    const run = baseRun({ migration_defaults_applied: ["areas[].evidence"] })
    writeArtifacts(project, run)

    const output = runEval4(project)

    expect(output.verdict).toBe("NA")
    expect(output.pass).toBeNull()
  })

  test("marker-stamped run with a header-matching live ledger fails", () => {
    const project = makeProject()
    const run = baseRun({ migration_defaults_applied: ["areas[].evidence"] })
    writeLedger(project, run, [{ area: "pre-area", kind: "none", index_range: [0, 2] }])
    writeArtifacts(project, run)

    const output = runEval4(project)

    expect(output.verdict).toBe("FAIL")
    expect(validationCodes(output)).toContain("marker_with_live_ledger")
  })

  test("marker-less run without a ledger is NA", () => {
    const project = makeProject()
    const run = baseRun()
    writeArtifacts(project, run)

    const output = runEval4(project)

    expect(output.verdict).toBe("NA")
    expect(output.pass).toBeNull()
    expect(output.detail).toContain("ledger_missing")
  })

  test("foreign-header ledger is NA", () => {
    const project = makeProject()
    const run = baseRun()
    writeLedger(project, run, [{ area: "pre-area", kind: "none", index_range: [0, 2] }], {
      scenario_slug: "settings-flow",
    })
    writeArtifacts(project, run)

    const output = runEval4(project)

    expect(output.verdict).toBe("NA")
    expect(output.pass).toBeNull()
    expect(output.detail).toContain("ledger_foreign")
  })

  test("none-only clean ledger passes", () => {
    const project = makeProject()
    const run = baseRun()
    writeLedger(project, run, [{ area: "pre-area", kind: "none", index_range: [0, 2] }])
    writeArtifacts(project, run)

    const output = runEval4(project)

    expect(output.verdict).toBe("PASS")
    expect(output.pass).toBe(true)
  })

  test("filed disposition with unresolved issue_ref fails", () => {
    const project = makeProject()
    const anomaly = {
      area: "checkout/cart",
      kind: "anomaly",
      what: "toast lingered after save",
      evidence: [{ type: "timing", ref: 8.2, note: "toast lingered" }],
      index_range: [0, 2],
    }
    const run = baseRun({
      anomalies: [{ ...anomaly, disposition: "filed", issue_ref: "#999" }],
    })
    writeLedger(project, run, [anomaly])
    writeArtifacts(project, run)

    const output = runEval4(project)

    expect(output.verdict).toBe("FAIL")
    expect(output.errors.some((error: any) => error.check === "filed_issue_ref_resolves")).toBe(true)
  })

  test("filed disposition with resolved issue_ref passes mechanical checks", () => {
    const project = makeProject()
    const anomaly = {
      area: "checkout/cart",
      kind: "anomaly",
      what: "toast lingered after save",
      evidence: [{ type: "timing", ref: 8.2, note: "toast lingered" }],
      index_range: [0, 2],
    }
    const run = baseRun({
      anomalies: [{ ...anomaly, disposition: "filed", issue_ref: "#101" }],
    })
    writeLedger(project, run, [anomaly])
    writeArtifacts(project, run)

    const output = runEval4(project)

    expect(output.verdict).toBe("PASS")
    expect(output.pass).toBe(true)
  })

  test("reworded explore-next-run mention passes with ambiguous match", () => {
    const project = makeProject()
    const anomaly = {
      area: "checkout/cart",
      kind: "anomaly",
      what: "toast lingered after save",
      evidence: [{ type: "timing", ref: 8.2, note: "toast lingered" }],
      index_range: [0, 2],
    }
    const run = baseRun({
      anomalies: [{ ...anomaly, disposition: "explore-next-run" }],
      explore_next_run: [
        {
          priority: "P1",
          area: "checkout/cart",
          mode: "Browser",
          why: "notification overstays after the save action",
        },
      ],
    })
    writeLedger(project, run, [anomaly])
    writeArtifacts(project, run)
    writeFileSync(project.report, "# User Test Report\n\ncheckout/cart notification timing follow-up\n")

    const output = runEval4(project)

    expect(output.verdict).toBe("PASS")
    expect(output.pass).toBe(true)
    expect(output.ambiguous_matches.length).toBeGreaterThan(0)
  })
})
