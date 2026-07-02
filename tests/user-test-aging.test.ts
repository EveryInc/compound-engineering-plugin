import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const REPO_ROOT = path.join(__dirname, "..")
const SCRIPTS = path.join(REPO_ROOT, "skills/ce-user-test/scripts")
const COMMIT_SCRIPT = path.join(SCRIPTS, "commit-engine.py")
const DEDUP_SCRIPT = path.join(SCRIPTS, "issue-dedup.py")
const MIGRATE_SCRIPT = path.join(SCRIPTS, "migrate-test-file.py")
const REGISTRY = JSON.parse(
  readFileSync(path.join(SCRIPTS, "caps-registry.json"), "utf8"),
)
const FIXTURES = path.join(__dirname, "fixtures/user-test")

type Project = {
  dir: string
  flows: string
  testFile: string
  testFileRel: string
  scenario: string
}

function runPython(
  script: string,
  cwd: string,
  args: string[],
  env: Record<string, string> = {},
): { code: number; stdout: string; stderr: string } {
  const result = spawnSync("python3", [script, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  })
  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

function runCommit(
  project: Project,
  args: string[],
  env: Record<string, string> = {},
): { code: number; stdout: string; stderr: string } {
  return runPython(COMMIT_SCRIPT, project.dir, args, env)
}

function runDedup(
  project: Project,
  title: string,
  corpus: string,
): { code: number; stdout: string; stderr: string } {
  return runPython(DEDUP_SCRIPT, project.dir, [title, corpus])
}

function runMigrate(file: string): { code: number; stdout: string; stderr: string } {
  return runPython(MIGRATE_SCRIPT, REPO_ROOT, ["migrate", file])
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n")
}

function readJson(file: string): any {
  return JSON.parse(readFileSync(file, "utf8"))
}

function resultJson(stdout: string): any {
  const lines = stdout.trim().split(/\r?\n/)
  return JSON.parse(lines.slice(1).join("\n"))
}

function startsWithLine(stdout: string, sentinel: string): boolean {
  return stdout.startsWith(`${sentinel}\n`) || stdout.startsWith(`${sentinel}\r\n`)
}

function makeProject(
  fixture = "current-v10.md",
  target = "checkout-quality.md",
  scenario = "checkout-quality",
): Project {
  const dir = mkdtempSync(path.join(tmpdir(), "ce-user-test-aging-"))
  const flows = path.join(dir, "tests/user-flows")
  mkdirSync(flows, { recursive: true })
  const testFile = path.join(flows, target)
  copyFileSync(path.join(FIXTURES, fixture), testFile)
  return {
    dir,
    flows,
    testFile,
    testFileRel: `tests/user-flows/${target}`,
    scenario,
  }
}

function payloadPath(project: Project, payload: any): string {
  const file = path.join(project.dir, "payload.json")
  writeJson(file, payload)
  return file
}

function issuePath(project: Project, issues: unknown[]): string {
  const file = path.join(project.dir, "issues.json")
  writeJson(file, { issues })
  return file
}

function dateForCycle(cycle: number): string {
  const date = new Date(Date.UTC(2026, 6, 1 + cycle))
  return date.toISOString().slice(0, 10)
}

function cyclePayload(
  project: Project,
  cycle: number,
  overrides: Record<string, unknown> = {},
): any {
  const score = [4, 5, 4, 3, 4, 2][cycle % 6]
  const passing = score >= REGISTRY.entries.pass_threshold.value
  const issueCandidates =
    cycle % 7 === 0
      ? [
          {
            id: `I${cycle + 1}`,
            area: "checkout/cart",
            title: `Checkout aging issue ${cycle + 1}`,
            body: `Aging harness issue from cycle ${cycle + 1}.`,
            dedup_verdict: "UNIQUE",
          },
        ]
      : []
  const generatedProbe =
    cycle % 10 === 0
      ? [
          {
            area: "checkout/cart",
            query: `P${String(cycle / 10 + 1).padStart(3, "0")} aging probe`,
            verify: `Aging probe ${cycle / 10 + 1} remains valid`,
            status: "untested",
            priority: "P2",
            confidence: "medium",
            generated_from: `run-${cycle + 1} aging harness`,
          },
        ]
      : []

  const payload = {
    scenario_slug: project.scenario,
    test_file: project.testFileRel,
    run_timestamp: `${dateForCycle(cycle)}T12:00:00Z`,
    run_number: cycle + 1,
    git_sha: `aging-${cycle + 1}`,
    areas: [
      {
        slug: "checkout/cart",
        ux_score: score,
        quality_score: null,
        time_seconds: 8 + (cycle % 5),
        skip_reason: null,
        assessment: `Cycle ${cycle + 1} score ${score}`,
        previous_status: "Proven",
        next_status: score <= 2 ? "Known-bug" : "Proven",
        consecutive_passes_before: passing ? 2 : 0,
        consecutive_passes_after: passing ? 3 : 0,
        tactical_note: `cycle ${cycle + 1} selector stayed stable`,
      },
    ],
    maturity_transitions: [],
    qualitative: {
      best_moment: {
        area: "checkout/cart",
        text: "Cart still updates",
      },
      worst_moment: {
        area: "checkout/cart",
        text: score <= 2 ? "Invalid zip still weak" : "No severe issue",
      },
      demo_readiness: score <= 2 ? "partial" : "yes",
      verdict: `Cycle ${cycle + 1} completed`,
      context: `aging cycle ${cycle + 1}`,
      key_finding: `score ${score}`,
    },
    explore_next_run: [],
    ux_opportunities: [],
    good_patterns: [
      {
        area: "checkout/cart",
        pattern: "Cart quantity changes update totals immediately",
      },
    ],
    verification_results: [],
    probes_run: [
      {
        area: "checkout/cart",
        query: "ship to 00000",
        verify: "Inline error shown",
        status: passing ? "passing" : "failing",
        priority: "P1",
        confidence: "high",
        generated_from: "aging harness",
        result_detail: passing ? "Inline validation appeared" : "Validation missing",
      },
    ],
    probes_generated: generatedProbe,
    cross_area_probes_run: [],
    journeys_run: [],
    novelty_fingerprints: {
      "checkout/cart": [`checkout/cart:edge-query:aging-${cycle + 1}`],
    },
    issue_candidates: issueCandidates,
  }

  return { ...payload, ...overrides }
}

function planApplyConfirm(project: Project, payload: any): any {
  const plan = runCommit(project, ["plan", payloadPath(project, payload)])
  expect(plan.code).toBe(0)
  expect(plan.stdout.trim()).toBe("PLANNED")

  const apply = runCommit(project, ["apply"])
  expect(apply.code).toBe(0)
  expect(startsWithLine(apply.stdout, "APPLIED")).toBe(true)
  const applyResult = resultJson(apply.stdout)

  const issues = payload.issue_candidates.map((candidate: any, index: number) => ({
    id: candidate.id,
    number: 1000 + payload.run_number * 10 + index,
  }))
  const confirm = runCommit(project, ["confirm-issues", issuePath(project, issues)])
  expect(confirm.code).toBe(0)
  expect(startsWithLine(confirm.stdout, "CONFIRMED")).toBe(true)
  expect(existsSync(path.join(project.flows, ".user-test-commit-journal.json"))).toBe(
    false,
  )

  return applyResult
}

function tableRows(markdown: string, headerPrefix: string): string[] {
  const lines = markdown.split(/\r?\n/)
  const header = lines.findIndex((line) => line.startsWith(headerPrefix))
  if (header === -1) {
    return []
  }
  const rows: string[] = []
  for (let index = header + 2; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.startsWith("|")) {
      break
    }
    if (!/^\|\s*-/.test(line)) {
      rows.push(line)
    }
  }
  return rows
}

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
}

function probeHistoryTokens(project: Project): string[] {
  const markdown = readFileSync(project.testFile, "utf8")
  const row = tableRows(markdown, "| Query | Verify | Status |").find((line) =>
    line.includes("| ship to 00000 | Inline error shown |"),
  )
  expect(row).toBeDefined()
  const columns = cells(row ?? "")
  return columns[6] ? columns[6].split(",").filter(Boolean) : []
}

function assertSequential(values: number[]): void {
  const unique = new Set(values)
  expect(unique.size).toBe(values.length)
  values.forEach((value, index) => {
    expect(value).toBe(index + 1)
  })
}

function bugIds(project: Project): number[] {
  const file = path.join(project.flows, "bugs.md")
  if (!existsSync(file)) {
    return []
  }
  return [...readFileSync(file, "utf8").matchAll(/\|\s*B(\d{3})\s*\|/g)].map(
    (match) => Number(match[1]),
  )
}

function probeIds(project: Project): number[] {
  return [
    ...readFileSync(project.testFile, "utf8").matchAll(/\|\s*P(\d{3}) aging probe\s*\|/g),
  ].map((match) => Number(match[1]))
}

function assertCapsHold(project: Project): void {
  const scoreCap = REGISTRY.entries.score_history_per_area_cap.value
  const testHistoryCap = REGISTRY.entries.test_history_cap.value
  const probeCap = REGISTRY.entries.probe_run_history_cap.value
  const noveltyCap = REGISTRY.entries.novelty_fingerprints_per_area_cap.value
  const tacticalCap = REGISTRY.entries.tactical_notes_per_area_cap.value

  const scoreHistory = readJson(path.join(project.flows, "score-history.json"))
  expect(scoreHistory.areas["checkout/cart"].scores.length).toBeLessThanOrEqual(
    scoreCap,
  )

  const history = readFileSync(path.join(project.flows, "test-history.md"), "utf8")
  expect(tableRows(history, "| Date | Areas Tested |").length).toBeLessThanOrEqual(
    testHistoryCap,
  )

  expect(probeHistoryTokens(project).length).toBeLessThanOrEqual(probeCap)

  const lastRun = readJson(path.join(project.flows, ".user-test-last-run.json"))
  expect(lastRun.novelty_fingerprints["checkout/cart"].length).toBeLessThanOrEqual(
    noveltyCap,
  )

  const areaRow = tableRows(
    readFileSync(project.testFile, "utf8"),
    "| Area | Status | Last Score |",
  ).find((line) => line.includes("| checkout/cart |"))
  expect(areaRow).toBeDefined()
  const notes = cells(areaRow ?? "").at(-1) ?? ""
  expect(notes.split("<br>").filter(Boolean).length).toBeLessThanOrEqual(tacticalCap)

  assertSequential(bugIds(project))
  assertSequential(probeIds(project))
}

function snapshot(project: Project): Record<string, string | null> {
  const files = [
    project.testFileRel,
    "tests/user-flows/score-history.json",
    "tests/user-flows/bugs.md",
    "tests/user-flows/test-history.md",
    "tests/user-flows/.user-test-last-run.json",
  ]
  return Object.fromEntries(
    files.map((file) => {
      const absolute = path.join(project.dir, file)
      return [file, existsSync(absolute) ? readFileSync(absolute, "utf8") : null]
    }),
  )
}

function runCrashConvergence(payload: any, crashAfter: number | null): void {
  const control = makeProject()
  planApplyConfirm(control, payload)

  const crashed = makeProject()
  const plan = runCommit(crashed, ["plan", payloadPath(crashed, payload)])
  expect(plan.code).toBe(0)
  if (crashAfter === null) {
    const resume = runCommit(crashed, ["resume"])
    expect(resume.code).toBe(0)
    expect(startsWithLine(resume.stdout, "APPLIED")).toBe(true)
  } else {
    const apply = runCommit(crashed, ["apply"], {
      CRASH_AFTER_FILE: String(crashAfter),
    })
    expect(apply.code).toBe(1)
    expect(apply.stdout.trim()).toBe(`CRASHED-AFTER-FILE ${crashAfter}`)
    const resume = runCommit(crashed, ["resume"])
    expect(resume.code).toBe(0)
    expect(startsWithLine(resume.stdout, "APPLIED")).toBe(true)
  }

  const issues = payload.issue_candidates.map((candidate: any, index: number) => ({
    id: candidate.id,
    number: 1000 + payload.run_number * 10 + index,
  }))
  const confirm = runCommit(crashed, [
    "confirm-issues",
    issuePath(crashed, issues),
  ])
  expect(confirm.code).toBe(0)
  expect(startsWithLine(confirm.stdout, "CONFIRMED")).toBe(true)

  expect(snapshot(crashed)).toEqual(snapshot(control))
}

function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 0x100000000
  }
}

describe("ce-user-test commit-engine aging harness", () => {
  test("100 generated commit cycles enforce registry caps, rotations, and ID ordering", () => {
    const project = makeProject()
    const scoreCap = REGISTRY.entries.score_history_per_area_cap.value
    const testHistoryCap = REGISTRY.entries.test_history_cap.value
    const probeCap = REGISTRY.entries.probe_run_history_cap.value
    const noveltyCap = REGISTRY.entries.novelty_fingerprints_per_area_cap.value

    for (let cycle = 0; cycle < 100; cycle += 1) {
      const payload = cyclePayload(project, cycle)
      if (payload.issue_candidates.length > 0) {
        const corpus = path.join(project.dir, `corpus-${cycle}.json`)
        writeJson(corpus, [{ number: 42, title: payload.issue_candidates[0].title }])
        const dedup = runDedup(project, payload.issue_candidates[0].title, corpus)
        expect(dedup.code).toBe(0)
        expect(dedup.stdout.trim()).toBe("DUPLICATE #42")
      }

      const result = planApplyConfirm(project, payload)
      const completed = cycle + 1
      expect(result.rotations.score_history).toBe(completed > scoreCap ? 1 : 0)
      expect(result.rotations.test_history).toBe(
        completed > testHistoryCap ? 1 : 0,
      )
      expect(result.rotations.probe_run_history).toBe(
        completed > probeCap ? 1 : 0,
      )

      assertCapsHold(project)
      expect(
        readJson(path.join(project.flows, ".user-test-last-run.json"))
          .novelty_fingerprints["checkout/cart"].length,
      ).toBeLessThanOrEqual(noveltyCap)
    }
  }, 120000)

  test("seeded crash injection converges to uninterrupted output at stage and file boundaries", () => {
    const random = lcg(20260701)
    for (let cycle = 0; cycle < 20; cycle += 1) {
      const payload = cyclePayload(makeProject(), cycle, {
        issue_candidates:
          random() > 0.65
            ? [
                {
                  id: `I${cycle + 1}`,
                  area: "checkout/cart",
                  title: `Crash convergence issue ${cycle + 1}`,
                  body: "Crash convergence issue body.",
                },
              ]
            : [],
      })
      const crashAfter = cycle % 6 === 0 ? null : ((cycle - 1) % 5) + 1
      runCrashConvergence(payload, crashAfter)
    }
  }, 90000)

  test("unknown content survives migrate, commit, and current-schema migrate", () => {
    const project = makeProject("unknown-content.md", "custom-content.md", "custom-content")
    const firstMigrate = runMigrate(project.testFile)
    expect(firstMigrate.code).toBe(0)
    expect(firstMigrate.stdout.trim()).toBe("MIGRATED 5 -> 10")

    const payload = cyclePayload(project, 0, {
      areas: [
        {
          slug: "custom/area",
          ux_score: 4,
          quality_score: 4,
          time_seconds: 9,
          skip_reason: null,
          assessment: "Custom flow stayed intact",
          previous_status: "Uncharted",
          next_status: "Proven",
          consecutive_passes_before: 1,
          consecutive_passes_after: 2,
          tactical_note: "custom selector survived",
        },
      ],
      probes_run: [
        {
          area: "custom/area",
          query: "custom probe",
          verify: "custom verify",
          status: "passing",
          priority: "P2",
          confidence: "high",
          generated_from: "score-based: custom finding",
          result_detail: "custom path passed",
        },
      ],
      probes_generated: [],
      novelty_fingerprints: {
        "custom/area": ["custom/area:edge-query:round-trip"],
      },
      issue_candidates: [],
    })
    planApplyConfirm(project, payload)

    const secondMigrate = runMigrate(project.testFile)
    expect(secondMigrate.code).toBe(0)
    expect(secondMigrate.stdout.trim()).toBe("CURRENT")

    const finalFile = readFileSync(project.testFile, "utf8")
    expect(finalFile).toContain("future_key: keep-me")
    expect(finalFile).toContain("Mystery")
    expect(finalFile).toContain("hidden-cell")
    expect(finalFile).toContain(`## Custom Notes

This custom section is user-authored.
It must remain byte-for-byte within the migrated file body.`)
  }, 30000)
})
