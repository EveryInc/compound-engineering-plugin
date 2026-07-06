import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const REPO_ROOT = path.join(__dirname, "..")
const COMMIT_SCRIPT = path.join(
  REPO_ROOT,
  "skills/ce-user-test/scripts/commit-engine.py",
)
const MIGRATE_SCRIPT = path.join(
  REPO_ROOT,
  "skills/ce-user-test/scripts/migrate-test-file.py",
)
const DEDUP_SCRIPT = path.join(
  REPO_ROOT,
  "skills/ce-user-test/scripts/issue-dedup.py",
)
const FIXTURES = path.join(__dirname, "fixtures/user-test")
const REGISTRY = JSON.parse(
  readFileSync(
    path.join(REPO_ROOT, "skills/ce-user-test/scripts/caps-registry.json"),
    "utf8",
  ),
)
const PYTHON = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3")

function runScript(
  script: string,
  cwd: string,
  args: string[],
  env: Record<string, string> = {},
): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(PYTHON, [script, ...args], {
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
  cwd: string,
  ...args: string[]
): { code: number; stdout: string; stderr: string } {
  return runScript(COMMIT_SCRIPT, cwd, args)
}

function runCommitEnv(
  cwd: string,
  env: Record<string, string>,
  ...args: string[]
): { code: number; stdout: string; stderr: string } {
  return runScript(COMMIT_SCRIPT, cwd, args, env)
}

function runDedup(
  cwd: string,
  ...args: string[]
): { code: number; stdout: string; stderr: string } {
  return runScript(DEDUP_SCRIPT, cwd, args)
}

function runMigrate(
  cwd: string,
  ...args: string[]
): { code: number; stdout: string; stderr: string } {
  return runScript(MIGRATE_SCRIPT, cwd, args)
}

function makeProject(): { dir: string; flows: string; testFile: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "ce-user-test-project-"))
  const flows = path.join(dir, "tests/user-flows")
  mkdirSync(flows, { recursive: true })
  const testFile = path.join(flows, "checkout-quality.md")
  copyFileSync(path.join(FIXTURES, "current-v11.md"), testFile)
  return { dir, flows, testFile }
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

function stdoutLines(stdout: string): string[] {
  return stdout.trim().split(/\r?\n/)
}

function planWarnings(stdout: string): any[] {
  const lines = stdoutLines(stdout)
  const plannedIndex = lines.indexOf("PLANNED")
  if (plannedIndex === -1 || plannedIndex === lines.length - 1) {
    return []
  }
  return JSON.parse(lines.slice(plannedIndex + 1).join("\n")).warnings ?? []
}

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
}

function journalPath(project: { flows: string }): string {
  return path.join(project.flows, ".user-test-commit-journal.json")
}

function payloadPath(project: { dir: string; flows: string }, payload: any): string {
  prepareV11Payload(project, payload)
  const file = path.join(project.dir, "payload.json")
  writeJson(file, payload)
  return file
}

function ledgerPath(project: { flows: string }): string {
  return path.join(project.flows, ".user-test-anomalies.jsonl")
}

function ledgerDigest(text: string): { lines: number; sha256: string } {
  const trimmed = text.replace(/\r?\n$/, "")
  return {
    lines: trimmed === "" ? 0 : trimmed.split(/\r?\n/).length,
    sha256: createHash("sha256").update(text, "utf8").digest("hex"),
  }
}

function ledgerText(payload: any, entries: any[], header: Record<string, unknown> = {}): string {
  const lines = [
    {
      ledger_version: 1,
      run_timestamp: payload.run_timestamp,
      scenario_slug: payload.scenario_slug,
      ...header,
    },
    ...entries,
  ].map((line) => JSON.stringify(line))
  return `${lines.join("\n")}\n`
}

function writeLedger(
  project: { flows: string },
  payload: any,
  entries: any[],
  header: Record<string, unknown> = {},
): { lines: number; sha256: string } {
  const text = ledgerText(payload, entries, header)
  writeFileSync(ledgerPath(project), text)
  return ledgerDigest(text)
}

function defaultLedgerEntries(payload: any): any[] {
  const finalIndex = payload.final_execution_index ?? 1
  return [{ area: "pre-area", kind: "none", index_range: [0, finalIndex] }]
}

function defaultEvidence(payload: any): any[] {
  const finalIndex = payload.final_execution_index ?? 1
  return [
    {
      type: "action",
      ref: Math.min(1, finalIndex),
      note: "cart interaction supported the score",
    },
    {
      type: "dom",
      ref: "cart subtotal",
      note: "subtotal matched quantity",
    },
  ]
}

function prepareV11Payload(project: { flows: string }, payload: any): void {
  const ledgerSpec = payload.__ledger
  delete payload.__ledger
  payload.schema_version = 11
  payload.final_execution_index ??= 1
  payload.disconnects ??= { count: 0, contexts: [] }
  payload.anomalies ??= []
  if (Array.isArray(payload.areas)) {
    for (const area of payload.areas) {
      if (!area.skip_reason && area.evidence === undefined) {
        area.evidence = defaultEvidence(payload)
      }
    }
  }
  if (ledgerSpec === null) {
    if (existsSync(ledgerPath(project))) {
      unlinkSync(ledgerPath(project))
    }
    delete payload.anomaly_ledger_digest
    return
  }
  const spec = ledgerSpec ?? {}
  payload.anomaly_ledger_digest = writeLedger(
    project,
    payload,
    spec.entries ?? defaultLedgerEntries(payload),
    spec.header ?? {},
  )
}

function basePayload(overrides: Record<string, unknown> = {}): any {
  const payload = {
    scenario_slug: "checkout-quality",
    test_file: "tests/user-flows/checkout-quality.md",
    run_timestamp: "2026-07-01T12:00:00Z",
    git_sha: "abc1234",
    areas: [
      {
        slug: "checkout/cart",
        ux_score: 4,
        quality_score: null,
        time_seconds: 8,
        skip_reason: null,
        assessment: "Cart flow is smooth",
        previous_status: "Uncharted",
        next_status: "Proven",
        consecutive_passes_before: 1,
        consecutive_passes_after: 2,
        tactical_note: "quantity change stays in sync",
      },
    ],
    maturity_transitions: [
      {
        area: "checkout/cart",
        from: "Uncharted",
        to: "Proven",
        consecutive_passes: 2,
        was_run: true,
      },
    ],
    qualitative: {
      best_moment: {
        area: "checkout/cart",
        text: "Cart updates immediately",
      },
      worst_moment: {
        area: "checkout/cart",
        text: "No serious issue",
      },
      demo_readiness: "yes",
      verdict: "Checkout cart is ready",
      context: "cart stable",
      key_finding: "cart stable",
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
        status: "passing",
        result_detail: "Inline validation appeared",
      },
    ],
    probes_generated: [],
    cross_area_probes_run: [],
    journeys_run: [],
    novelty_fingerprints: {
      "checkout/cart": ["checkout/cart:edge-query:invalid-zip"],
    },
    issue_candidates: [
      {
        id: "I1",
        area: "checkout/cart",
        title: "Checkout cart invalid zip lacks inline validation",
        body: "Invalid zip codes should show inline validation.",
      },
    ],
  }
  return { ...payload, ...overrides }
}

function withoutMaturityFields(payload: any): any {
  const stripped = { ...payload }
  delete stripped.maturity_transitions
  stripped.areas = (stripped.areas ?? []).map((area: any) => {
    const next = { ...area }
    delete next.previous_status
    delete next.next_status
    delete next.consecutive_passes_before
    delete next.consecutive_passes_after
    return next
  })
  return stripped
}

function fullApply(project: ReturnType<typeof makeProject>, payload = basePayload()): any {
  const plan = runCommit(project.dir, "plan", payloadPath(project, payload))
  expect(plan.code).toBe(0)
  expect(plan.stdout.trim()).toBe("PLANNED")
  const apply = runCommit(project.dir, "apply")
  expect(apply.code).toBe(0)
  expect(startsWithLine(apply.stdout, "APPLIED")).toBe(true)
  return resultJson(apply.stdout)
}

function confirmAll(
  project: ReturnType<typeof makeProject>,
  issues = [{ id: "I1", number: 101 }],
): any {
  const file = path.join(project.dir, "issues.json")
  writeJson(file, { issues })
  const confirm = runCommit(project.dir, "confirm-issues", file)
  expect(confirm.code).toBe(0)
  expect(startsWithLine(confirm.stdout, "CONFIRMED")).toBe(true)
  return resultJson(confirm.stdout)
}

function snapshot(project: ReturnType<typeof makeProject>): Record<string, string | null> {
  const files = [
    "tests/user-flows/checkout-quality.md",
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

function lastRunPath(project: ReturnType<typeof makeProject>): string {
  return path.join(project.flows, ".user-test-last-run.json")
}

function writeMarkerLastRun(
  project: ReturnType<typeof makeProject>,
  overrides: Record<string, unknown> = {},
): void {
  writeJson(lastRunPath(project), {
    run_timestamp: "2026-06-30T12:00:00Z",
    completed: true,
    scenario_slug: "checkout-quality",
    schema_version: 11,
    migration_defaults_applied: [
      "areas[].evidence",
      "anomalies[]",
      "final_execution_index",
      "schema_version",
    ],
    areas: [],
    ...overrides,
  })
}

function validationErrors(
  project: ReturnType<typeof makeProject>,
  payload: any,
): any[] {
  const before = snapshot(project)
  const result = runCommit(project.dir, "plan", payloadPath(project, payload))
  expect(result.code).toBe(1)
  expect(startsWithLine(result.stdout, "VALIDATION-FAILED")).toBe(true)
  expect(snapshot(project)).toEqual(before)
  expect(existsSync(journalPath(project))).toBe(false)
  return resultJson(result.stdout)
}

function expectValidationCode(errors: any[], code: string): void {
  expect(errors.some((error: any) => error.code === code)).toBe(true)
}

function countTableRows(markdown: string): number {
  return markdown
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|") && !/^\|\s*-/.test(line)).length - 1
}

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading)
  if (start === -1) {
    return ""
  }
  const rest = markdown.slice(start + heading.length)
  const next = rest.search(/\n#{2,3} /)
  return next === -1 ? markdown.slice(start) : markdown.slice(start, start + heading.length + next)
}

describe("ce-user-test issue-dedup.py", () => {
  test("78% overlap reports the best duplicate issue number", () => {
    const project = makeProject()
    const corpus = path.join(project.dir, "corpus.json")
    writeJson(corpus, [
      {
        number: 42,
        title: "checkout invalid zip accepts order without inline validation text",
      },
    ])

    const result = runDedup(
      project.dir,
      "checkout invalid zip accepts order without inline error message",
      corpus,
    )

    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe("DUPLICATE #42")
  })

  test("50% overlap is UNIQUE", () => {
    const project = makeProject()
    const corpus = path.join(project.dir, "corpus.json")
    writeJson(corpus, [
      { number: 9, title: "cart total wrong during promo checkout" },
    ])

    const result = runDedup(project.dir, "profile avatar upload fails after save", corpus)

    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe("UNIQUE")
  })

  test("case and punctuation variants duplicate", () => {
    const project = makeProject()
    const corpus = path.join(project.dir, "corpus.json")
    writeJson(corpus, [
      { number: 12, title: "Checkout: invalid ZIP lacks inline validation!" },
    ])

    const result = runDedup(project.dir, "checkout invalid zip lacks inline validation", corpus)

    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe("DUPLICATE #12")
  })

  test("empty corpus is UNIQUE", () => {
    const project = makeProject()
    const corpus = path.join(project.dir, "corpus.json")
    writeJson(corpus, [])

    const result = runDedup(project.dir, "checkout invalid zip lacks inline validation", corpus)

    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe("UNIQUE")
  })

  test("fetch_failed corpus is CORPUS-UNKNOWN", () => {
    const project = makeProject()
    const corpus = path.join(project.dir, "corpus.json")
    writeJson(corpus, { fetch_failed: true })

    const result = runDedup(project.dir, "checkout invalid zip lacks inline validation", corpus)

    expect(result.code).toBe(1)
    expect(result.stdout.trim()).toBe("CORPUS-UNKNOWN")
  })
})

describe("ce-user-test commit-engine.py validation", () => {
  test("invalid payloads reject whole-payload with machine-readable errors and no files touched", () => {
    const cases = [
      {
        payload: basePayload({
          areas: [{ ...basePayload().areas[0], ux_score: 7 }],
        }),
        code: "score_out_of_range",
      },
      {
        payload: basePayload({
          maturity_transitions: [
            {
              area: "checkout/payment",
              from: "Uncharted",
              to: "Proven",
              consecutive_passes: 2,
              was_run: false,
            },
          ],
        }),
        code: "promotion_for_unrun_area",
      },
      {
        payload: basePayload({
          maturity_transitions: [
            {
              area: "checkout/cart",
              from: "Uncharted",
              to: "Proven",
              consecutive_passes: 1,
              was_run: true,
            },
          ],
        }),
        code: "promotion_contradicts_evidence",
      },
    ]

    for (const item of cases) {
      const project = makeProject()
      const before = snapshot(project)
      const result = runCommit(project.dir, "plan", payloadPath(project, item.payload))

      expect(result.code).toBe(1)
      expect(startsWithLine(result.stdout, "VALIDATION-FAILED")).toBe(true)
      const errors = resultJson(result.stdout)
      expect(errors.some((error: any) => error.code === item.code)).toBe(true)
      if (item.code === "promotion_contradicts_evidence") {
        expect(errors[0].evidence.consecutive_passes).toBe(1)
      }
      expect(snapshot(project)).toEqual(before)
      expect(existsSync(journalPath(project))).toBe(false)
    }
  })

  test("skipped areas with skip_reason are valid", () => {
    const project = makeProject()
    const payload = basePayload({
      areas: [
        {
          slug: "checkout/cart",
          skip_reason: "stable in previous run",
          previous_status: "Proven",
          next_status: "Proven",
          consecutive_passes_before: 3,
          consecutive_passes_after: 3,
        },
      ],
      maturity_transitions: [],
      probes_run: [],
      issue_candidates: [],
    })

    const result = runCommit(project.dir, "plan", payloadPath(project, payload))

    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe("PLANNED")
  })

  test("ledger anomaly without a disposition is rejected before journaling", () => {
    const project = makeProject()
    const payload = basePayload({
      issue_candidates: [],
      __ledger: {
        entries: [
          {
            area: "checkout/cart",
            kind: "anomaly",
            what: "toast lingered after save",
            evidence: [],
            index_range: [0, 1],
          },
        ],
      },
    })

    const errors = validationErrors(project, payload)

    expectValidationCode(errors, "anomaly_undispositioned")
  })

  test("action-driving score with one prose-only evidence entry is rejected", () => {
    const project = makeProject()
    const payload = basePayload({
      areas: [
        {
          ...basePayload().areas[0],
          ux_score: 2,
          next_status: "Known-bug",
          evidence: [{ type: "dom", ref: "", note: "score lowered from observation" }],
        },
      ],
      maturity_transitions: [],
      issue_candidates: [],
    })

    const errors = validationErrors(project, payload)

    expectValidationCode(errors, "evidence_minimum")
  })

  test("malformed evidence entries do not satisfy the required evidence minimum", () => {
    const project = makeProject()
    const payload = basePayload({
      areas: [
        {
          ...basePayload().areas[0],
          ux_score: 3,
          evidence: [{}],
        },
      ],
      issue_candidates: [],
    })

    const errors = validationErrors(project, payload)
    const error = errors.find((item: any) => item.code === "evidence_minimum")

    expect(error).toBeDefined()
    expect(error.required).toBe(1)
    expect(error.actual).toBe(0)
  })

  test("dismissed anomaly requires a non-empty reason", () => {
    const project = makeProject()
    const anomaly = {
      area: "checkout/cart",
      kind: "anomaly",
      what: "toast lingered after save",
      evidence: [],
      index_range: [0, 1],
    }
    const payload = basePayload({
      anomalies: [{ ...anomaly, disposition: "dismissed", reason: "   " }],
      issue_candidates: [],
      __ledger: { entries: [anomaly] },
    })

    const errors = validationErrors(project, payload)

    expectValidationCode(errors, "dismissal_reason_empty")
  })

  test("action evidence ref beyond final_execution_index is rejected", () => {
    const project = makeProject()
    const payload = basePayload({
      final_execution_index: 40,
      areas: [
        {
          ...basePayload().areas[0],
          evidence: [
            { type: "action", ref: 57, note: "late action claimed evidence" },
            { type: "dom", ref: "cart subtotal", note: "subtotal visible" },
          ],
        },
      ],
      issue_candidates: [],
    })

    const errors = validationErrors(project, payload)

    expectValidationCode(errors, "evidence_ref_out_of_range")
  })

  test("anomaly action refs above final_execution_index are rejected", () => {
    const project = makeProject()
    const payload = basePayload({
      final_execution_index: 10,
      anomalies: [
        {
          area: "checkout/cart",
          kind: "anomaly",
          what: "anomaly action claimed a later index",
          evidence: [{ type: "action", ref: 11, note: "out-of-range anomaly action" }],
          index_range: [0, 1],
          disposition: "noted-in-area",
        },
      ],
      issue_candidates: [],
    })

    const errors = validationErrors(project, payload)

    expectValidationCode(errors, "evidence_ref_out_of_range")
  })

  test("multi-iteration aggregate commit uses one session ledger and persists anomalies", () => {
    const project = makeProject()
    const anomaly = {
      area: "checkout/cart",
      kind: "anomaly",
      what: "iteration 2 toast lingered after save",
      evidence: [{ type: "action", ref: 6, note: "iteration 2 save action produced the toast" }],
      index_range: [4, 7],
    }
    const payload = basePayload({
      final_execution_index: 12,
      anomalies: [{ ...anomaly, disposition: "noted-in-area" }],
      probes_run: [
        {
          area: "checkout/cart",
          query: "iteration 1 invalid zip",
          verify: "Inline error shown",
          status: "passing",
          result_detail: "iteration 1 completed",
          execution_index: 2,
        },
        {
          area: "checkout/cart",
          query: "iteration 2 save cart",
          verify: "Toast clears",
          status: "failing",
          result_detail: "toast lingered",
          execution_index: 6,
        },
        {
          area: "checkout/cart",
          query: "iteration 3 invalid zip",
          verify: "Inline error shown",
          status: "passing",
          result_detail: "iteration 3 completed",
          execution_index: 11,
        },
      ],
      issue_candidates: [],
      __ledger: {
        entries: [
          { area: "checkout/cart", kind: "none", index_range: [0, 3] },
          anomaly,
          { area: "checkout/cart", kind: "none", index_range: [8, 12] },
        ],
      },
    })

    fullApply(project, payload)
    const lastRun = readJson(lastRunPath(project))

    expect(lastRun.anomalies).toEqual([{ ...anomaly, disposition: "noted-in-area" }])
    expect(lastRun.anomaly_ledger_digest).toEqual(payload.anomaly_ledger_digest)
    expect(lastRun.final_execution_index).toBe(12)
  })

  test("ledger tiling normalizes shared boundaries and honors disconnect tolerance", () => {
    const shared = makeProject()
    let payload = basePayload({
      final_execution_index: 30,
      issue_candidates: [],
      __ledger: {
        entries: [
          { area: "pre-area", kind: "none", index_range: [0, 12] },
          { area: "checkout/cart", kind: "none", index_range: [12, 30] },
        ],
      },
    })
    let result = runCommit(shared.dir, "plan", payloadPath(shared, payload))
    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe("PLANNED")

    const tolerated = makeProject()
    payload = basePayload({
      final_execution_index: 30,
      disconnects: { count: 2, contexts: [] },
      issue_candidates: [],
      __ledger: {
        entries: [
          { area: "pre-area", kind: "none", index_range: [0, 10] },
          { area: "checkout/cart", kind: "none", index_range: [13, 30] },
        ],
      },
    })
    result = runCommit(tolerated.dir, "plan", payloadPath(tolerated, payload))
    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe("PLANNED")

    const rejected = makeProject()
    payload = basePayload({
      final_execution_index: 30,
      disconnects: { count: 2, contexts: [] },
      issue_candidates: [],
      __ledger: {
        entries: [
          { area: "pre-area", kind: "none", index_range: [0, 10] },
          { area: "checkout/cart", kind: "none", index_range: [14, 30] },
        ],
      },
    })
    const errors = validationErrors(rejected, payload)
    expectValidationCode(errors, "ledger_tiling")
  })

  test("ledger whose first span starts after zero is rejected", () => {
    const project = makeProject()
    const payload = basePayload({
      final_execution_index: 5,
      issue_candidates: [],
      __ledger: {
        entries: [{ area: "checkout/cart", kind: "none", index_range: [2, 5] }],
      },
    })

    const errors = validationErrors(project, payload)
    const error = errors.find((item: any) => item.code === "ledger_tiling")

    expect(error).toBeDefined()
    expect(error.reason).toBe("coverage_must_start_at_zero")
  })


  test("migration-defaulted run without a matching ledger warns then plans and applies", () => {
    const project = makeProject()
    writeMarkerLastRun(project)
    const payload = basePayload({ issue_candidates: [], __ledger: null })

    const plan = runCommit(project.dir, "plan", payloadPath(project, payload))

    expect(plan.code).toBe(0)
    const lines = stdoutLines(plan.stdout)
    expect(lines[0]).toBe("MIGRATION-DEFAULTS-WARN")
    expect(JSON.parse(lines[1])[0].code).toBe("migration_defaults_applied")
    expect(lines[2]).toBe("PLANNED")
    const apply = runCommit(project.dir, "apply")
    expect(apply.code).toBe(0)
    expect(startsWithLine(apply.stdout, "APPLIED")).toBe(true)
    expect(readJson(lastRunPath(project)).migration_defaults_applied).toBeUndefined()
  })

  test("foreign ledger warns for marker-stamped runs and fails for marker-less runs", () => {
    const markerStamped = makeProject()
    writeMarkerLastRun(markerStamped)
    let payload = basePayload({
      issue_candidates: [],
      __ledger: { header: { scenario_slug: "settings-flow" } },
    })
    let result = runCommit(markerStamped.dir, "plan", payloadPath(markerStamped, payload))
    expect(result.code).toBe(0)
    expect(stdoutLines(result.stdout)[0]).toBe("MIGRATION-DEFAULTS-WARN")

    const markerless = makeProject()
    payload = basePayload({
      issue_candidates: [],
      __ledger: { header: { scenario_slug: "settings-flow" } },
    })
    const errors = validationErrors(markerless, payload)
    expectValidationCode(errors, "ledger_foreign")
  })

  test("none-only ledger and empty-range marker tile cleanly with empty anomalies", () => {
    const project = makeProject()
    const payload = basePayload({
      final_execution_index: 1,
      anomalies: [],
      issue_candidates: [],
      __ledger: {
        entries: [
          { area: "pre-area", kind: "none", index_range: [0, 0] },
          { area: "checkout/cart", kind: "none", index_range: null, at_index: 1 },
          { area: "checkout/cart", kind: "none", index_range: [1, 1] },
        ],
      },
    })

    fullApply(project, payload)
    confirmAll(project, [])

    expect(readJson(lastRunPath(project)).anomalies).toEqual([])
  })

  test("ledger digest mismatch is rejected", () => {
    const project = makeProject()
    const payload = basePayload({ issue_candidates: [] })
    const file = payloadPath(project, payload)
    writeFileSync(
      ledgerPath(project),
      `${readFileSync(ledgerPath(project), "utf8")}${JSON.stringify({
        area: "checkout/cart",
        kind: "none",
        index_range: [1, 1],
      })}\n`,
    )

    const result = runCommit(project.dir, "plan", file)

    expect(result.code).toBe(1)
    expectValidationCode(resultJson(result.stdout), "ledger_digest_mismatch")
  })

  test("marker-less run without a ledger is rejected", () => {
    const project = makeProject()
    const payload = basePayload({ issue_candidates: [], __ledger: null })

    const errors = validationErrors(project, payload)

    expectValidationCode(errors, "ledger_missing")
  })

  test("anomalies are sourced from the payload only, never inherited", () => {
    const project = makeProject()
    writeJson(lastRunPath(project), {
      run_timestamp: "2026-06-30T12:00:00Z",
      completed: true,
      scenario_slug: "checkout-quality",
      schema_version: 11,
      areas: [],
      anomalies: [
        {
          area: "checkout/cart",
          kind: "anomaly",
          what: "old anomaly",
          evidence: [],
          index_range: [0, 0],
          disposition: "noted-in-area",
        },
      ],
    })

    fullApply(project, basePayload({ issue_candidates: [] }))
    confirmAll(project, [])

    expect(readJson(lastRunPath(project)).anomalies).toEqual([])
  })

  test("marker-stamped run with a matching live ledger is rejected", () => {
    const project = makeProject()
    writeMarkerLastRun(project)

    const errors = validationErrors(project, basePayload({ issue_candidates: [] }))

    expectValidationCode(errors, "marker_with_live_ledger")
  })

  test("final_execution_index below a ledger range end is rejected", () => {
    const project = makeProject()
    const payload = basePayload({
      final_execution_index: 40,
      issue_candidates: [],
      __ledger: {
        entries: [{ area: "pre-area", kind: "none", index_range: [0, 45] }],
      },
    })

    const errors = validationErrors(project, payload)

    expectValidationCode(errors, "final_index_understated")
  })

  test("final_execution_index below a nested execution_index is rejected", () => {
    const project = makeProject()
    const payload = basePayload({
      final_execution_index: 5,
      cross_area_probes_run: [
        {
          execution_index: 9,
          area: "checkout/cart",
          query: "gift card plus invalid zip",
          result_detail: "late cross-area probe",
        },
      ],
      issue_candidates: [],
    })

    const errors = validationErrors(project, payload)

    expectValidationCode(errors, "final_index_understated")
  })

  test("score drop from previous run requires two evidence entries", () => {
    const project = makeProject()
    writeJson(path.join(project.flows, "score-history.json"), {
      areas: {
        "checkout/cart": {
          scores: [{ date: "2026-06-30", ux: 4, quality: null, time: 8 }],
          trend: "stable",
        },
      },
    })
    const payload = basePayload({
      areas: [
        {
          ...basePayload().areas[0],
          ux_score: 3,
          evidence: [{ type: "action", ref: 1, note: "regression observed" }],
        },
      ],
      maturity_transitions: [],
      issue_candidates: [],
    })

    const errors = validationErrors(project, payload)

    expectValidationCode(errors, "evidence_minimum")
  })

  test("malformed score-history areas shape does not crash score validation", () => {
    const project = makeProject()
    writeJson(path.join(project.flows, "score-history.json"), {
      areas: [],
    })
    const payload = basePayload({ issue_candidates: [] })

    const result = runCommit(project.dir, "plan", payloadPath(project, payload))

    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe("PLANNED")
  })

  test("legacy bare-list score-history areas normalize and render trends", () => {
    const project = makeProject()
    writeJson(path.join(project.flows, "score-history.json"), {
      areas: {
        "checkout/cart": [
          { date: "2026-06-30", ux: 3, quality: null, time: 8 },
        ],
      },
    })

    fullApply(project, basePayload({ issue_candidates: [] }))
    confirmAll(project, [])

    const scoreHistory = readJson(path.join(project.flows, "score-history.json"))
    expect(scoreHistory.areas["checkout/cart"].scores).toHaveLength(2)
    expect(scoreHistory.areas["checkout/cart"].trend).toBe("stable")
    expect(readFileSync(project.testFile, "utf8")).toContain(
      "| checkout/cart | stable | 4 | +1.0 |",
    )
  })

  test("corrupt score-history fails with the file path in diagnostics", () => {
    const project = makeProject()
    writeFileSync(path.join(project.flows, "score-history.json"), "{not-json\n")

    const result = runCommit(
      project.dir,
      "plan",
      payloadPath(project, basePayload({ issue_candidates: [] })),
    )

    expect(result.code).toBe(2)
    expect(result.stderr).toContain("tests/user-flows/score-history.json")
    expect(result.stderr).toContain("invalid json")
    expect(existsSync(journalPath(project))).toBe(false)
  })
})

describe("ce-user-test commit-engine.py journaled apply", () => {
  test("status emits ISSUES-PENDING before journal JSON for applied pending issues", () => {
    const project = makeProject()
    fullApply(project)

    const status = runCommit(project.dir, "status")

    expect(status.code).toBe(0)
    const lines = stdoutLines(status.stdout)
    expect(lines[0]).toBe("ISSUES-PENDING")
    expect(JSON.parse(lines.slice(1).join("\n")).state).toBe("applied")
  })

  test("status emits STALE-WARN for a 26h-old journal without mutating it", () => {
    const project = makeProject()
    expect(runCommit(project.dir, "plan", payloadPath(project, basePayload())).code).toBe(0)
    const journal = readJson(journalPath(project))
    journal.start_timestamp = isoHoursAgo(26)
    journal.heartbeat_at = isoHoursAgo(26)
    writeJson(journalPath(project), journal)

    const status = runCommit(project.dir, "status")

    expect(status.code).toBe(1)
    const lines = stdoutLines(status.stdout)
    expect(lines[0]).toBe("STALE-WARN")
    expect(JSON.parse(lines.slice(1).join("\n")).scenario_slug).toBe("checkout-quality")
    expect(readJson(journalPath(project)).heartbeat_at).toBe(journal.heartbeat_at)
  })

  test("status emits FOREIGN-JOURNAL when the expected scenario differs", () => {
    const project = makeProject()
    expect(runCommit(project.dir, "plan", payloadPath(project, basePayload())).code).toBe(0)

    const status = runCommit(project.dir, "status", "settings-flow")

    expect(status.code).toBe(1)
    const lines = stdoutLines(status.stdout)
    expect(lines[0]).toBe("FOREIGN-JOURNAL checkout-quality")
    expect(JSON.parse(lines.slice(1).join("\n")).scenario_slug).toBe("checkout-quality")
  })

  test("result JSON remains parseable with unicode payload text under narrow stdout encoding", () => {
    const project = makeProject()
    const env = { PYTHONIOENCODING: "cp1252", PYTHONUTF8: "0" }
    const payload = basePayload({
      issue_candidates: [
        {
          id: "I1",
          area: "checkout/cart",
          title: "Cart \u2192 profile handoff loses state",
          body: "The cart \u2192 profile handoff should preserve state.",
        },
      ],
    })

    const plan = runCommitEnv(project.dir, env, "plan", payloadPath(project, payload))
    expect(plan.code).toBe(0)

    const apply = runCommitEnv(project.dir, env, "apply")

    expect(apply.code).toBe(0)
    expect(startsWithLine(apply.stdout, "APPLIED")).toBe(true)
    expect(resultJson(apply.stdout).pending_issues[0].title).toContain("\u2192")
    expect(apply.stderr).not.toContain("UnicodeEncodeError")
  })

  test("staged resume produces the same end state as uninterrupted apply", () => {
    const direct = makeProject()
    fullApply(direct)
    confirmAll(direct)
    const directSnapshot = snapshot(direct)

    const resumed = makeProject()
    const plan = runCommit(resumed.dir, "plan", payloadPath(resumed, basePayload()))
    expect(plan.code).toBe(0)
    const resume = runCommit(resumed.dir, "resume")
    expect(resume.code).toBe(0)
    expect(startsWithLine(resume.stdout, "APPLIED")).toBe(true)
    confirmAll(resumed)

    expect(snapshot(resumed)).toEqual(directSnapshot)
  })

  test("resume reconciles a target replaced before the journal marked it applied", () => {
    const direct = makeProject()
    fullApply(direct, basePayload({ issue_candidates: [] }))
    confirmAll(direct, [])
    const directSnapshot = snapshot(direct)

    const resumed = makeProject()
    expect(runCommit(resumed.dir, "plan", payloadPath(resumed, basePayload({ issue_candidates: [] }))).code).toBe(0)
    const journal = readJson(journalPath(resumed))
    const firstFile = journal.files[0]
    renameSync(
      path.join(resumed.dir, firstFile.staged_path),
      path.join(resumed.dir, firstFile.path),
    )

    const resume = runCommit(resumed.dir, "resume")

    expect(resume.code).toBe(0)
    expect(startsWithLine(resume.stdout, "APPLIED")).toBe(true)
    confirmAll(resumed, [])
    expect(snapshot(resumed)).toEqual(directSnapshot)
  })

  test("resume after complete is a no-op and does not duplicate history", () => {
    const project = makeProject()
    fullApply(project)
    confirmAll(project)
    const history = readFileSync(path.join(project.flows, "test-history.md"), "utf8")
    const rowsBefore = countTableRows(history)

    const resume = runCommit(project.dir, "resume")

    expect(resume.code).toBe(0)
    expect(resume.stdout.trim()).toBe("NO-JOURNAL")
    const rowsAfter = countTableRows(
      readFileSync(path.join(project.flows, "test-history.md"), "utf8"),
    )
    expect(rowsAfter).toBe(rowsBefore)
  })

  test("hand-edited base file refuses resume with a hash-mismatch sentinel", () => {
    const project = makeProject()
    const plan = runCommit(project.dir, "plan", payloadPath(project, basePayload()))
    expect(plan.code).toBe(0)
    writeFileSync(project.testFile, readFileSync(project.testFile, "utf8") + "\nmanual edit\n")

    const resume = runCommit(project.dir, "resume")

    expect(resume.code).toBe(1)
    expect(startsWithLine(resume.stdout, "BASE-HASH-MISMATCH")).toBe(true)
  })

  test("foreign scenario journal refuses a new plan", () => {
    const project = makeProject()
    expect(runCommit(project.dir, "plan", payloadPath(project, basePayload())).code).toBe(0)
    const foreign = basePayload({ scenario_slug: "settings-flow" })

    const result = runCommit(project.dir, "plan", payloadPath(project, foreign))

    expect(result.code).toBe(1)
    expect(result.stdout.trim()).toBe("FOREIGN-JOURNAL checkout-quality")
  })

  test("missing staged file reports staged integrity failure", () => {
    const project = makeProject()
    expect(runCommit(project.dir, "plan", payloadPath(project, basePayload())).code).toBe(0)
    const journal = readJson(journalPath(project))
    unlinkSync(path.join(project.dir, journal.files[0].staged_path))

    const resume = runCommit(project.dir, "resume")

    expect(resume.code).toBe(1)
    expect(startsWithLine(resume.stdout, "STAGED-INTEGRITY-FAILURE")).toBe(true)
  })

  test(">7 day journal defaults to rollback", () => {
    const project = makeProject()
    expect(runCommit(project.dir, "plan", payloadPath(project, basePayload())).code).toBe(0)
    const journal = readJson(journalPath(project))
    journal.start_timestamp = "2026-06-01T00:00:00Z"
    journal.heartbeat_at = "2026-06-01T00:00:00Z"
    writeJson(journalPath(project), journal)

    const resume = runCommit(project.dir, "resume")

    expect(resume.code).toBe(1)
    expect(resume.stdout.trim()).toBe("STALE-ROLLBACK-DEFAULT")
  })

  test("resume on a 26h-old journal warns until acknowledged", () => {
    const project = makeProject()
    expect(runCommit(project.dir, "plan", payloadPath(project, basePayload({ issue_candidates: [] }))).code).toBe(0)
    const journal = readJson(journalPath(project))
    journal.start_timestamp = isoHoursAgo(26)
    journal.heartbeat_at = isoHoursAgo(26)
    writeJson(journalPath(project), journal)

    const refused = runCommit(project.dir, "resume")
    expect(refused.code).toBe(1)
    expect(refused.stdout.trim()).toBe("STALE-WARN")

    const acknowledged = runCommit(project.dir, "resume", "--acknowledge-stale")
    expect(acknowledged.code).toBe(0)
    expect(startsWithLine(acknowledged.stdout, "APPLIED")).toBe(true)
  })

  test("CRASH_AFTER_FILE rollback restores every pre-image and deletes absent artifacts", () => {
    const project = makeProject()
    const before = snapshot(project)
    expect(runCommit(project.dir, "plan", payloadPath(project, basePayload())).code).toBe(0)

    const crashed = runCommitEnv(project.dir, { CRASH_AFTER_FILE: "3" }, "apply")
    expect(crashed.code).toBe(1)
    expect(crashed.stdout.trim()).toBe("CRASHED-AFTER-FILE 3")

    const rollback = runCommit(project.dir, "rollback")
    expect(rollback.code).toBe(0)
    expect(rollback.stdout.trim()).toBe("ROLLED-BACK")
    expect(snapshot(project)).toEqual(before)
  })

  test("first-run absent artifacts are created and rollback deletes them", () => {
    const project = makeProject()
    expect(existsSync(path.join(project.flows, "score-history.json"))).toBe(false)
    expect(existsSync(path.join(project.flows, "bugs.md"))).toBe(false)
    expect(existsSync(path.join(project.flows, "test-history.md"))).toBe(false)

    fullApply(project)

    expect(existsSync(path.join(project.flows, "score-history.json"))).toBe(true)
    expect(existsSync(path.join(project.flows, "bugs.md"))).toBe(true)
    expect(existsSync(path.join(project.flows, "test-history.md"))).toBe(true)

    expect(runCommit(project.dir, "rollback").stdout.trim()).toBe("ROLLED-BACK")
    expect(existsSync(path.join(project.flows, "score-history.json"))).toBe(false)
    expect(existsSync(path.join(project.flows, "bugs.md"))).toBe(false)
    expect(existsSync(path.join(project.flows, "test-history.md"))).toBe(false)
  })

  test("commit preserves a schema-valid last-run JSON accepted by migrate-run-json", () => {
    const project = makeProject()
    writeJson(path.join(project.flows, ".user-test-last-run.json"), {
      run_timestamp: "2026-06-30T12:00:00Z",
      completed: true,
      scenario_slug: "checkout-quality",
      areas: [
        {
          slug: "checkout/cart",
          tactical_note: null,
          confirmed_selectors: {},
          weakness_class: null,
          adversarial_browser: false,
          adversarial_trigger: null,
        },
      ],
      probes_run: [],
      cross_area_probes_run: [],
      journeys_run: [],
      explore_next_run: [],
      novelty_log: [],
      stable_queries_rotated: [],
      novelty_fingerprints: {
        "checkout/cart": ["checkout/cart:edge-query:old"],
      },
      disconnects: { count: 0, contexts: [] },
      custom_preserved: "keep",
    })

    fullApply(project, basePayload({ issue_candidates: [] }))
    confirmAll(project, [])

    const migrated = runMigrate(
      project.dir,
      "migrate-run-json",
      path.join(project.flows, ".user-test-last-run.json"),
    )
    expect(migrated.code).toBe(0)
    expect(migrated.stdout.trim()).toBe("CURRENT")
    const lastRun = readJson(path.join(project.flows, ".user-test-last-run.json"))
    expect(lastRun.completed).toBe(true)
    expect(lastRun.custom_preserved).toBe("keep")
    expect(lastRun.novelty_fingerprints["checkout/cart"]).toContain(
      "checkout/cart:edge-query:old",
    )
    expect(lastRun.novelty_fingerprints["checkout/cart"]).toContain(
      "checkout/cart:edge-query:invalid-zip",
    )
  })

  test("probe updates are scoped to each probe's area section", () => {
    const project = makeProject()
    writeFileSync(
      project.testFile,
      readFileSync(project.testFile, "utf8").replace(
        "## Cross-Area Probes",
        `### checkout/profile

**Interactions:** Edit profile details.

**What's tested:** Profile changes remain visible.

**pass_threshold:** 4

**verify:**
- Profile name remains visible.

**Probes:**

| Query | Verify | Status | Priority | Confidence | Generated From | Run History |
|-------|--------|--------|----------|------------|----------------|-------------|

## Cross-Area Probes`,
      ),
    )

    fullApply(
      project,
      basePayload({
        probes_run: [
          {
            area: "checkout/profile",
            query: "edit display name",
            verify: "Saved name remains visible",
            status: "passing",
            result_detail: "Profile name persisted",
          },
        ],
        issue_candidates: [],
      }),
    )
    confirmAll(project, [])

    const updated = readFileSync(project.testFile, "utf8")
    expect(section(updated, "### checkout/cart")).not.toContain("edit display name")
    expect(section(updated, "### checkout/profile")).toContain(
      "| edit display name | Saved name remains visible | passing |",
    )
  })

  test("nested-only per-area probe payload updates the owning area table", () => {
    const project = makeProject()
    const payload = basePayload({
      areas: [
        {
          ...basePayload().areas[0],
          probes_run: [
            {
              query: "nested invalid zip",
              verify: "Inline error shown",
              status: "failing",
              result_detail: "Validation did not appear",
            },
          ],
        },
      ],
      probes_run: [],
      probes_generated: [],
      issue_candidates: [],
    })

    fullApply(project, payload)
    confirmAll(project, [])

    const updated = readFileSync(project.testFile, "utf8")
    expect(section(updated, "### checkout/cart")).toContain(
      "| nested invalid zip | Inline error shown | failing |",
    )
  })

  test("mixed top-level and nested probes dedup by area and query", () => {
    const project = makeProject()
    const payload = basePayload({
      areas: [
        {
          ...basePayload().areas[0],
          probes_run: [
            {
              query: "dedup invalid zip",
              verify: "Nested duplicate should not win",
              status: "failing",
            },
            {
              query: "nested profile handoff",
              verify: "Cart state remains visible",
              status: "passing",
            },
          ],
        },
      ],
      probes_run: [
        {
          area: "checkout/cart",
          query: "dedup invalid zip",
          verify: "Top-level probe remains canonical",
          status: "passing",
        },
      ],
      probes_generated: [],
      issue_candidates: [],
    })

    fullApply(project, payload)
    confirmAll(project, [])

    const cartSection = section(readFileSync(project.testFile, "utf8"), "### checkout/cart")
    expect(cartSection.match(/dedup invalid zip/g) ?? []).toHaveLength(1)
    expect(cartSection).toContain(
      "| dedup invalid zip | Top-level probe remains canonical | passing |",
    )
    expect(cartSection).toContain(
      "| nested profile handoff | Cart state remains visible | passing |",
    )
  })

  test("empty probe payload warns when tested areas have failing probes", () => {
    const project = makeProject()
    writeFileSync(
      project.testFile,
      readFileSync(project.testFile, "utf8").replace(
        "|-------|--------|--------|----------|------------|----------------|-------------|",
        `|-------|--------|--------|----------|------------|----------------|-------------|
| ship to 00000 | Inline error shown | failing | P1 | high | verification failure | F |`,
      ),
    )

    const result = runCommit(
      project.dir,
      "plan",
      payloadPath(
        project,
        basePayload({
          probes_run: [],
          probes_generated: [],
          issue_candidates: [],
        }),
      ),
    )

    expect(result.code).toBe(0)
    const lines = stdoutLines(result.stdout)
    expect(lines[0]).toBe("PLANNED")
    expect(JSON.parse(lines[1]).warnings[0].code).toBe("probes_expected_but_absent")
  })

  test("missing maturity fields warn when a passing run reaches promotion streak", () => {
    const project = makeProject()
    writeFileSync(
      project.testFile,
      readFileSync(project.testFile, "utf8")
        .replace("| checkout/cart | Proven | 4 |", "| checkout/cart | Uncharted | 4 |")
        .replace("| 12 | 2 | stable cart flow |", "| 12 | 1 | stable cart flow |"),
    )
    const payload = withoutMaturityFields(basePayload({ issue_candidates: [] }))

    const result = runCommit(project.dir, "plan", payloadPath(project, payload))

    expect(result.code).toBe(0)
    const warnings = planWarnings(result.stdout)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe("maturity_expected_but_absent")
    expect(warnings[0].areas).toContainEqual({
      area: "checkout/cart",
      condition: "promotion_streak",
      current_status: "Uncharted",
      consecutive_passes_before: 1,
      consecutive_passes_after: 2,
    })
  })

  test("missing maturity fields warn when scores imply Known-bug", () => {
    const project = makeProject()
    writeFileSync(
      project.testFile,
      readFileSync(project.testFile, "utf8").replace(
        "| checkout/cart | Proven | 4 |",
        "| checkout/cart | Uncharted | 4 |",
      ),
    )
    const payload = withoutMaturityFields(
      basePayload({
        areas: [{ ...basePayload().areas[0], ux_score: 2 }],
        issue_candidates: [],
      }),
    )

    const result = runCommit(project.dir, "plan", payloadPath(project, payload))

    expect(result.code).toBe(0)
    const warnings = planWarnings(result.stdout)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe("maturity_expected_but_absent")
    expect(warnings[0].areas).toContainEqual({
      area: "checkout/cart",
      condition: "known_bug",
      current_status: "Uncharted",
      ux_score: 2,
      quality_score: null,
    })
  })

  test("maturity transitions suppress missing-maturity warning", () => {
    const project = makeProject()
    writeFileSync(
      project.testFile,
      readFileSync(project.testFile, "utf8")
        .replace("| checkout/cart | Proven | 4 |", "| checkout/cart | Uncharted | 4 |")
        .replace("| 12 | 2 | stable cart flow |", "| 12 | 1 | stable cart flow |"),
    )
    const payload = withoutMaturityFields(basePayload({ issue_candidates: [] }))
    payload.maturity_transitions = [
      {
        area: "checkout/cart",
        from: "Uncharted",
        to: "Proven",
        consecutive_passes: 2,
        was_run: true,
      },
    ]

    const result = runCommit(project.dir, "plan", payloadPath(project, payload))

    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe("PLANNED")
  })

  test("missing maturity fields do not warn when no transition is implied", () => {
    const project = makeProject()
    writeFileSync(
      project.testFile,
      readFileSync(project.testFile, "utf8")
        .replace("| checkout/cart | Proven | 4 |", "| checkout/cart | Uncharted | 4 |")
        .replace("| 12 | 2 | stable cart flow |", "| 12 | 0 | stable cart flow |"),
    )
    const payload = withoutMaturityFields(
      basePayload({
        areas: [{ ...basePayload().areas[0], ux_score: 3 }],
        issue_candidates: [],
      }),
    )

    const result = runCommit(project.dir, "plan", payloadPath(project, payload))

    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe("PLANNED")
  })

  test("cross-area probe reaches third failure and escalates to a pending bug", () => {
    const project = makeProject()
    writeFileSync(
      project.testFile,
      readFileSync(project.testFile, "utf8").replace(
        "|--------------|--------|------------------|--------|--------|----------|------------|----------------|-------------|",
        `|--------------|--------|------------------|--------|--------|----------|------------|----------------|-------------|
| checkout/cart | change quantity | checkout/profile | profile shows stale cart count | failing | P1 | high | run-1 stale state | F,F |`,
      ),
    )

    const result = fullApply(
      project,
      basePayload({
        cross_area_probes_run: [
          {
            trigger_area: "checkout/cart",
            action: "change quantity",
            observation_area: "checkout/profile",
            verify: "profile shows stale cart count",
            status: "failing",
            result_detail: "Profile badge kept stale count",
          },
        ],
        issue_candidates: [],
      }),
    )

    expect(result.pending_issues).toHaveLength(1)
    expect(result.pending_issues[0].area).toBe("checkout/cart")
    expect(result.pending_issues[0].bug_id).toBe("B001")
    const updated = readFileSync(project.testFile, "utf8")
    expect(updated).toContain(
      "| checkout/cart | change quantity | checkout/profile | profile shows stale cart count | failing | P1 | high | run-1 stale state | F,F,F | B001 |",
    )
    expect(readFileSync(path.join(project.flows, "bugs.md"), "utf8")).toContain(
      "profile shows stale cart count",
    )
  })

  test("cross-area probe escalation writes escalated_to and does not duplicate on fourth failure", () => {
    const project = makeProject()
    writeFileSync(
      project.testFile,
      readFileSync(project.testFile, "utf8").replace(
        "|--------------|--------|------------------|--------|--------|----------|------------|----------------|-------------|",
        `|--------------|--------|------------------|--------|--------|----------|------------|----------------|-------------|
| checkout/cart | change quantity | checkout/profile | profile shows stale cart count | failing | P1 | high | run-1 stale state | F,F |`,
      ),
    )

    let result = fullApply(
      project,
      basePayload({
        cross_area_probes_run: [
          {
            trigger_area: "checkout/cart",
            action: "change quantity",
            observation_area: "checkout/profile",
            verify: "profile shows stale cart count",
            status: "failing",
            result_detail: "Profile badge kept stale count",
          },
        ],
        issue_candidates: [],
      }),
    )
    expect(result.pending_issues).toHaveLength(1)
    expect(result.pending_issues[0].bug_id).toBe("B001")
    confirmAll(project, [{ id: "cross-area-1", number: 201 }])

    result = fullApply(
      project,
      basePayload({
        run_timestamp: "2026-07-02T12:00:00Z",
        cross_area_probes_run: [
          {
            trigger_area: "checkout/cart",
            action: "change quantity",
            observation_area: "checkout/profile",
            verify: "profile shows stale cart count",
            status: "failing",
            result_detail: "Profile badge kept stale count again",
          },
        ],
        issue_candidates: [],
      }),
    )

    expect(result.pending_issues).toEqual([])
    const updated = readFileSync(project.testFile, "utf8")
    expect(updated).toContain(
      "| checkout/cart | change quantity | checkout/profile | profile shows stale cart count | failing | P1 | high | run-1 stale state | F,F,F,F | B001 |",
    )
    const bugs = readFileSync(path.join(project.flows, "bugs.md"), "utf8")
    expect(bugs.match(/profile shows stale cart count/g) ?? []).toHaveLength(1)
  })

  test("cross-area escalation is suppressed by an active known bug in the target area", () => {
    const project = makeProject()
    writeFileSync(
      path.join(project.flows, "bugs.md"),
      `# User Test Bugs

| ID | Area | Status | Issue | Title |
|----|------|--------|-------|-------|
| B009 | checkout/cart | filed | #9 | Cart already has an active issue |
`,
    )
    writeFileSync(
      project.testFile,
      readFileSync(project.testFile, "utf8").replace(
        "|--------------|--------|------------------|--------|--------|----------|------------|----------------|-------------|",
        `|--------------|--------|------------------|--------|--------|----------|------------|----------------|-------------|
| checkout/cart | change quantity | checkout/profile | profile shows stale cart count | failing | P1 | high | run-1 stale state | F,F |`,
      ),
    )

    const result = fullApply(
      project,
      basePayload({
        cross_area_probes_run: [
          {
            trigger_area: "checkout/cart",
            action: "change quantity",
            observation_area: "checkout/profile",
            verify: "profile shows stale cart count",
            status: "failing",
            result_detail: "Profile badge kept stale count",
          },
        ],
        issue_candidates: [],
      }),
    )

    expect(result.pending_issues).toEqual([])
    const updated = readFileSync(project.testFile, "utf8")
    expect(updated).toContain(
      "| checkout/cart | change quantity | checkout/profile | profile shows stale cart count | failing | P1 | high | run-1 stale state | F,F,F |  |",
    )
    const bugs = readFileSync(path.join(project.flows, "bugs.md"), "utf8")
    expect(bugs).toContain("Cart already has an active issue")
    expect(bugs).not.toContain("profile shows stale cart count")
  })

  test("journey status and run history are updated from journey results", () => {
    const project = makeProject()
    writeFileSync(
      project.testFile,
      readFileSync(project.testFile, "utf8").replace(
        "## Area Trends",
        `### J001: Checkout to profile

**Steps:**

| Step | Area | Action | Checkpoint |
|------|------|--------|------------|
| 1 | checkout/cart | Add item | Badge increments |
| 2 | checkout/profile | Open profile | Cart badge remains visible |

**Status:** passing
**Last Run:** 2026-06-30
**Run History:** P P P P
**Generated From:** manual

## Area Trends`,
      ),
    )

    fullApply(
      project,
      basePayload({
        journeys_run: [
          {
            id: "J001",
            status: "passing",
            checkpoints: [
              { step: 1, area: "checkout/cart", passed: true, detail: "ok" },
              { step: 2, area: "checkout/profile", passed: true, detail: "ok" },
            ],
          },
        ],
        issue_candidates: [],
      }),
    )
    confirmAll(project, [])

    const updated = readFileSync(project.testFile, "utf8")
    expect(section(updated, "### J001: Checkout to profile")).toContain(
      "**Status:** stable",
    )
    expect(section(updated, "### J001: Checkout to profile")).toContain(
      "**Last Run:** 2026-07-01",
    )
    expect(section(updated, "### J001: Checkout to profile")).toContain(
      "**Run History:** P P P P P",
    )
  })

  test("journey escalation writes escalated_to and does not duplicate on fourth same-step failure", () => {
    const project = makeProject()
    writeFileSync(
      project.testFile,
      readFileSync(project.testFile, "utf8").replace(
        "## Area Trends",
        `### J001: Checkout to profile

**Steps:**

| Step | Area | Action | Checkpoint |
|------|------|--------|------------|
| 1 | checkout/cart | Add item | Badge increments |
| 2 | checkout/profile | Open profile | Profile loads |

**Status:** failing-at-2
**Last Run:** 2026-06-30
**Run History:** F:2 F:2
**Generated From:** manual

## Area Trends`,
      ),
    )

    let result = fullApply(
      project,
      basePayload({
        journeys_run: [
          {
            id: "J001",
            status: "failing-at-2",
            failed_area: "checkout/profile",
            checkpoints: [
              { step: 1, area: "checkout/cart", passed: true, detail: "ok" },
              { step: 2, area: "checkout/profile", passed: false, detail: "profile missing" },
            ],
            result_detail: "Profile route did not load",
          },
        ],
        issue_candidates: [],
      }),
    )
    expect(result.pending_issues).toHaveLength(1)
    expect(result.pending_issues[0].bug_id).toBe("B001")
    confirmAll(project, [{ id: "journey-J001", number: 301 }])

    result = fullApply(
      project,
      basePayload({
        run_timestamp: "2026-07-02T12:00:00Z",
        journeys_run: [
          {
            id: "J001",
            status: "failing-at-2",
            failed_area: "checkout/profile",
            checkpoints: [
              { step: 1, area: "checkout/cart", passed: true, detail: "ok" },
              { step: 2, area: "checkout/profile", passed: false, detail: "profile missing" },
            ],
            result_detail: "Profile route still did not load",
          },
        ],
        issue_candidates: [],
      }),
    )

    expect(result.pending_issues).toEqual([])
    const journey = section(readFileSync(project.testFile, "utf8"), "### J001: Checkout to profile")
    expect(journey).toContain("**Run History:** F:2 F:2 F:2 F:2")
    expect(journey).toContain("**escalated_to:** B001")
    const bugs = readFileSync(path.join(project.flows, "bugs.md"), "utf8")
    expect(bugs.match(/Journey J001 failed at step 2/g) ?? []).toHaveLength(1)
  })

  test("delta compares current and previous averages over overlapping areas only", () => {
    const project = makeProject()
    writeJson(path.join(project.flows, "score-history.json"), {
      areas: {
        "checkout/cart": {
          scores: [{ date: "2026-06-30", ux: 4, quality: null, time: 8 }],
          trend: "stable",
        },
      },
    })
    const cart = { ...basePayload().areas[0], ux_score: 5 }
    const profile = {
      ...cart,
      slug: "checkout/profile",
      ux_score: 1,
      next_status: "Known-bug",
      assessment: "Profile is broken",
    }

    const result = fullApply(
      project,
      basePayload({
        areas: [cart, profile],
        maturity_transitions: [],
        issue_candidates: [],
      }),
    )
    confirmAll(project, [])

    expect(result.rotations.delta_warnings).toEqual([])
    expect(readFileSync(path.join(project.flows, "test-history.md"), "utf8")).toContain(
      "| 2026-07-01 | checkout/cart, checkout/profile | 3.0 | +1.0 |",
    )
  })

  test("query results mechanically rotate query status to stable", () => {
    const project = makeProject()
    writeFileSync(
      project.testFile,
      readFileSync(project.testFile, "utf8").replace(
        "|-------|---------------|-------|--------|-------|",
        `|-------|---------------|-------|--------|-------|
| find jackets | Relevant jackets | Results are jackets | active | |`,
      ),
    )

    fullApply(
      project,
      basePayload({
        query_results: [
          {
            area: "checkout/cart",
            query: "find jackets",
            score: 5,
            consecutive_successes: 3,
          },
        ],
        issue_candidates: [],
      }),
    )
    confirmAll(project, [])

    expect(readFileSync(project.testFile, "utf8")).toContain(
      "| find jackets | Relevant jackets | Results are jackets | [stable] |  |",
    )
  })

  test("confirmed selectors append to verify block without replacing existing content", () => {
    const project = makeProject()

    fullApply(
      project,
      basePayload({
        run_number: 7,
        areas: [
          {
            ...basePayload().areas[0],
            confirmed_selectors: {
              activeFilters: "[data-filter-chip]",
              resultCount: ".product-card",
            },
          },
        ],
        issue_candidates: [],
      }),
    )
    confirmAll(project, [])

    const verifyBlock = section(readFileSync(project.testFile, "utf8"), "### checkout/cart")
    expect(verifyBlock).toContain("- Cart badge and subtotal match the quantity.")
    expect(verifyBlock).toContain("activeFilters (`[data-filter-chip]`)")
    expect(verifyBlock).toContain("resultCount (`.product-card`)")
    expect(verifyBlock).toContain("_Selectors confirmed run 7._")
  })

  test("apply refuses a live concurrent journal before mutating files", () => {
    const project = makeProject()
    const before = snapshot(project)
    expect(runCommit(project.dir, "plan", payloadPath(project, basePayload())).code).toBe(0)
    const journal = readJson(journalPath(project))
    journal.active = true
    journal.active_pid = process.pid
    journal.heartbeat_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
    writeJson(journalPath(project), journal)

    const apply = runCommit(project.dir, "apply")

    expect(apply.code).toBe(1)
    expect(apply.stdout.trim()).toBe(`CONCURRENT ${process.pid}`)
    expect(snapshot(project)).toEqual(before)
  })

  test("bug lifecycle marks open bug fixed from payload evidence", () => {
    const project = makeProject()
    writeFileSync(
      path.join(project.flows, "bugs.md"),
      `# User Test Bugs

| ID | Area | Status | Issue | Title | Fixed | Regressed |
|----|------|--------|-------|-------|-------|-----------|
| B001 | checkout/cart | open | #47 | Invalid zip accepted | — | — |
`,
    )

    fullApply(
      project,
      basePayload({
        bug_lifecycle_updates: [
          {
            bug_id: "B001",
            status: "fixed",
            fix_check_passed: true,
            issue_closed: true,
          },
        ],
        issue_candidates: [],
      }),
    )
    confirmAll(project, [])

    const bugs = readFileSync(path.join(project.flows, "bugs.md"), "utf8")
    expect(bugs).toContain(
      "| B001 | checkout/cart | fixed | #47 | Invalid zip accepted | 2026-07-01 | — |",
    )
  })

  test("bug lifecycle marks fixed bug regressed and creates a regression candidate", () => {
    const project = makeProject()
    writeFileSync(
      path.join(project.flows, "bugs.md"),
      `# User Test Bugs

| ID | Area | Status | Issue | Title | Fixed | Regressed |
|----|------|--------|-------|-------|-------|-----------|
| B002 | checkout/cart | fixed | #48 | Cart count stale | 2026-06-20 | — |
`,
    )

    const result = fullApply(
      project,
      basePayload({
        bug_lifecycle_updates: [
          {
            bug_id: "B002",
            status: "regressed",
            area: "checkout/cart",
            title: "Regression of #48: Cart count stale",
            body: "Cart count is stale again.",
          },
        ],
        issue_candidates: [],
      }),
    )

    expect(result.pending_issues).toHaveLength(1)
    expect(result.pending_issues[0].title).toBe("Regression of #48: Cart count stale")
    const bugs = readFileSync(path.join(project.flows, "bugs.md"), "utf8")
    expect(bugs).toContain(
      "| B002 | checkout/cart | regressed | #48 | Cart count stale | 2026-06-20 | 2026-07-01 |",
    )
    expect(bugs).toContain(
      "| B003 | checkout/cart | pending | pending | Regression of #48: Cart count stale | — | 2026-07-01 |",
    )
  })

  test("weakness_class payload state can leave, delete, or update an existing line", () => {
    const withExistingWeakness = (project: ReturnType<typeof makeProject>) => {
      writeFileSync(
        project.testFile,
        readFileSync(project.testFile, "utf8").replace(
          "**weakness_class:**",
          "**weakness_class:** stale-react-state",
        ),
      )
    }

    const absent = makeProject()
    withExistingWeakness(absent)
    fullApply(absent, basePayload({ issue_candidates: [] }))
    confirmAll(absent, [])
    expect(readFileSync(absent.testFile, "utf8")).toContain(
      "**weakness_class:** stale-react-state",
    )

    const deleted = makeProject()
    withExistingWeakness(deleted)
    fullApply(
      deleted,
      basePayload({
        areas: [{ ...basePayload().areas[0], weakness_class: "" }],
        issue_candidates: [],
      }),
    )
    confirmAll(deleted, [])
    expect(readFileSync(deleted.testFile, "utf8")).not.toContain(
      "**weakness_class:**",
    )

    const updated = makeProject()
    withExistingWeakness(updated)
    fullApply(
      updated,
      basePayload({
        areas: [{ ...basePayload().areas[0], weakness_class: "async-render-race" }],
        issue_candidates: [],
      }),
    )
    confirmAll(updated, [])
    expect(readFileSync(updated.testFile, "utf8")).toContain(
      "**weakness_class:** async-render-race",
    )
  })

  test("per-area pass_threshold overrides pass-rate computation", () => {
    const project = makeProject()
    writeFileSync(
      project.testFile,
      readFileSync(project.testFile, "utf8").replace(
        "**pass_threshold:** 4",
        "**pass_threshold:** 5",
      ),
    )
    const cart = {
      ...basePayload().areas[0],
      ux_score: 4,
      previous_status: "Proven",
      next_status: "Proven",
      consecutive_passes_before: 2,
      consecutive_passes_after: 2,
    }
    const profile = {
      ...cart,
      slug: "checkout/profile",
      assessment: "Profile checkout handoff is smooth",
    }

    fullApply(
      project,
      basePayload({
        areas: [cart, profile],
        maturity_transitions: [],
        issue_candidates: [],
      }),
    )
    confirmAll(project, [])

    const history = readFileSync(path.join(project.flows, "test-history.md"), "utf8")
    expect(history).toContain(
      "| 2026-07-01 | checkout/cart, checkout/profile | 4.0 | — | 50% |",
    )
  })

  test("unconfirmed good patterns age out after the registry run cap", () => {
    const project = makeProject()
    const cap = REGISTRY.entries.good_patterns_unconfirmed_runs.value
    const historyRows = Array.from({ length: cap }, (_, index) =>
      `| 2026-06-${String(26 + index).padStart(2, "0")} | checkout/cart | 4.0 | dash | 100% | checkout/cart | checkout/cart | yes | run ${index} | old run |`,
    )
    writeFileSync(
      path.join(project.flows, "test-history.md"),
      `# User Test History

| Date | Areas Tested | Quality Avg | Delta | Pass Rate | Best Area | Worst Area | Demo Ready | Context | Key Finding |
|------|--------------|-------------|-------|-----------|-----------|------------|------------|---------|-------------|
${historyRows.join("\n")}
`,
    )
    writeFileSync(
      project.testFile,
      readFileSync(project.testFile, "utf8").replace(
        "|------|---------|------------|----------------|",
        `|------|---------|------------|----------------|
| checkout/cart | Cart totals update immediately | 2026-06-01 | 2026-06-25 |`,
      ),
    )

    fullApply(project, basePayload({ good_patterns: [], issue_candidates: [] }))
    confirmAll(project, [])

    expect(readFileSync(project.testFile, "utf8")).not.toContain(
      "Cart totals update immediately",
    )
  })

  test("test history surfaces recurring best and worst area patterns from registry thresholds", () => {
    const project = makeProject()
    const historyRows = [
      ...Array.from({ length: 6 }, (_, index) =>
        `| 2026-06-${String(10 + index).padStart(2, "0")} | checkout/cart, checkout/profile | 3.0 | dash | 50% | checkout/cart | checkout/profile | partial | run ${index} | previous |`,
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        `| 2026-06-${String(20 + index).padStart(2, "0")} | checkout/cart, checkout/profile | 4.0 | dash | 100% | checkout/profile | checkout/cart | yes | alt ${index} | previous |`,
      ),
    ]
    writeFileSync(
      path.join(project.flows, "test-history.md"),
      `# User Test History

| Date | Areas Tested | Quality Avg | Delta | Pass Rate | Best Area | Worst Area | Demo Ready | Context | Key Finding |
|------|--------------|-------------|-------|-----------|-----------|------------|------------|---------|-------------|
${historyRows.join("\n")}
`,
    )
    const cart = { ...basePayload().areas[0], ux_score: 5 }
    const profile = {
      ...cart,
      slug: "checkout/profile",
      ux_score: 1,
      next_status: "Known-bug",
      assessment: "Profile route is broken",
    }

    fullApply(
      project,
      basePayload({
        areas: [cart, profile],
        maturity_transitions: [],
        issue_candidates: [],
      }),
    )
    confirmAll(project, [])

    const history = readFileSync(path.join(project.flows, "test-history.md"), "utf8")
    expect(history).toContain("Pattern: checkout/cart best area in 7/10 recent runs")
    expect(history).toContain("Pattern: checkout/profile worst area in 7/10 recent runs")
  })

  test("caps are enforced from the registry for probe, score, and test history", () => {
    const project = makeProject()
    const probeCap = REGISTRY.entries.probe_run_history_cap.value
    const scoreCap = REGISTRY.entries.score_history_per_area_cap.value
    const historyCap = REGISTRY.entries.test_history_cap.value
    const probeHistory = Array.from({ length: probeCap }, (_, index) =>
      index % 2 === 0 ? "P" : "F",
    ).join(",")
    const withProbe = readFileSync(project.testFile, "utf8").replace(
      "|-------|--------|--------|----------|------------|----------------|-------------|",
      `|-------|--------|--------|----------|------------|----------------|-------------|
| ship to 00000 | Inline error shown | failing | P1 | high | verification failure: invalid zip accepted | ${probeHistory} |`,
    )
    writeFileSync(project.testFile, withProbe)
    writeJson(path.join(project.flows, "score-history.json"), {
      areas: {
        "checkout/cart": {
          scores: Array.from({ length: scoreCap }, (_, index) => ({
            date: `2026-06-${String(index + 1).padStart(2, "0")}`,
            ux: 3,
            quality: null,
            time: 10,
          })),
          trend: "stable",
        },
      },
    })
    const historyRows = Array.from({ length: historyCap }, (_, index) =>
      `| 2026-05-${String(index + 1).padStart(2, "0")} | old-${index} | 3.0 | — | 0% | old | old | partial | old | old |`,
    )
    writeFileSync(
      path.join(project.flows, "test-history.md"),
      `# User Test History

| Date | Areas Tested | Quality Avg | Delta | Pass Rate | Best Area | Worst Area | Demo Ready | Context | Key Finding |
|------|--------------|-------------|-------|-----------|-----------|------------|------------|---------|-------------|
${historyRows.join("\n")}
`,
    )

    fullApply(project, basePayload({ issue_candidates: [] }))

    const scoreHistory = readJson(path.join(project.flows, "score-history.json"))
    expect(scoreHistory.areas["checkout/cart"].scores).toHaveLength(scoreCap)
    expect(scoreHistory.areas["checkout/cart"].scores[0].date).toBe("2026-06-02")
    const history = readFileSync(path.join(project.flows, "test-history.md"), "utf8")
    expect(countTableRows(history)).toBe(historyCap)
    expect(history).not.toContain("| 2026-05-01 | old-0 |")
    expect(history).toContain("| 2026-07-01 | checkout/cart |")
    const updatedTestFile = readFileSync(project.testFile, "utf8")
    expect(updatedTestFile).toContain(
      `| ship to 00000 | Inline error shown | passing | P1 | high | verification failure: invalid zip accepted | P,${probeHistory.split(",").slice(0, probeCap - 1).join(",")} |`,
    )
  })
})

describe("ce-user-test commit-engine.py issue confirmation recovery", () => {
  test("resume after two filed issues returns exactly the remaining pending candidates", () => {
    const project = makeProject()
    const candidates = [1, 2, 3, 4].map((number) => ({
      id: `I${number}`,
      area: "checkout/cart",
      title: `Checkout issue ${number}`,
      body: `Issue ${number}`,
    }))
    fullApply(project, basePayload({ issue_candidates: candidates }))
    const journal = readJson(journalPath(project))
    journal.issue_candidates[0].status = "filed #101"
    journal.issue_candidates[1].status = "filed #102"
    writeJson(journalPath(project), journal)

    const resume = runCommit(project.dir, "resume")

    expect(resume.code).toBe(0)
    expect(startsWithLine(resume.stdout, "ISSUES-PENDING")).toBe(true)
    const pending = resultJson(resume.stdout).pending_issues
    expect(pending.map((issue: any) => issue.id)).toEqual(["I3", "I4"])
  })

  test("confirm-issues patches bugs.md and removes the completed journal", () => {
    const project = makeProject()
    fullApply(project)

    const result = confirmAll(project, [{ id: "I1", number: 222 }])

    expect(result.files_written).toContain("tests/user-flows/bugs.md")
    expect(readFileSync(path.join(project.flows, "bugs.md"), "utf8")).toContain("#222")
    expect(existsSync(journalPath(project))).toBe(false)
  })

  test("confirm-issues backfills filed anomaly issue_ref in last-run JSON", () => {
    const project = makeProject()
    const anomaly = {
      area: "checkout/cart",
      kind: "anomaly",
      what: "toast lingered after save",
      evidence: [{ type: "timing", ref: 8.2, note: "toast lingered" }],
      index_range: [0, 1],
    }
    fullApply(
      project,
      basePayload({
        anomalies: [
          {
            ...anomaly,
            disposition: "filed",
            issue_ref: null,
            issue_candidate_id: "I1",
          },
        ],
        __ledger: { entries: [anomaly] },
      }),
    )

    confirmAll(project, [{ id: "I1", number: 222 }])

    expect(readJson(lastRunPath(project)).anomalies[0].issue_ref).toBe("#222")
  })

  test("confirm-issues refuses staged journals without patching or discarding them", () => {
    const project = makeProject()
    expect(runCommit(project.dir, "plan", payloadPath(project, basePayload())).code).toBe(0)
    const before = snapshot(project)

    const result = runCommit(
      project.dir,
      "confirm-issues",
      path.join(project.dir, "missing-issues.json"),
    )

    expect(result.code).toBe(1)
    expect(result.stdout.trim()).toBe("JOURNAL-NOT-APPLIED")
    expect(existsSync(journalPath(project))).toBe(true)
    expect(snapshot(project)).toEqual(before)
  })

  test("confirm-issues warns machine-readably when input matches no pending candidate", () => {
    const project = makeProject()
    fullApply(project)
    const file = path.join(project.dir, "issues-wrong-shape.json")
    writeJson(file, { issues: [{ status: "filed", issue_ref: "#177" }] })

    const result = runCommit(project.dir, "confirm-issues", file)

    expect(result.code).toBe(0)
    const lines = stdoutLines(result.stdout)
    expect(lines[0]).toBe("CONFIRM-NO-MATCH")
    const warning = JSON.parse(lines[1])
    expect(warning.matched).toBe(0)
    expect(warning.expected).toBe(1)
    expect(warning.expected_shape).toContain("issues")
    expect(lines[2]).toBe("ISSUES-PENDING")
    expect(JSON.parse(lines.slice(3).join("\n")).pending_issues).toHaveLength(1)
    expect(existsSync(journalPath(project))).toBe(true)
  })

  test("confirm-issues maps bug_id-only updates without sharing a null id key", () => {
    const project = makeProject()
    fullApply(
      project,
      basePayload({
        issue_candidates: [
          {
            bug_id: "B101",
            area: "checkout/cart",
            title: "First bug-id-only issue",
            body: "first",
          },
          {
            bug_id: "B102",
            area: "checkout/cart",
            title: "Second bug-id-only issue",
            body: "second",
          },
        ],
      }),
    )

    confirmAll(project, [
      { bug_id: "B101", number: 301 },
      { bug_id: "B102", number: 302 },
    ])

    const bugs = readFileSync(path.join(project.flows, "bugs.md"), "utf8")
    expect(bugs).toContain("| B101 | checkout/cart | filed | #301 | First bug-id-only issue |")
    expect(bugs).toContain("| B102 | checkout/cart | filed | #302 | Second bug-id-only issue |")
  })
})
