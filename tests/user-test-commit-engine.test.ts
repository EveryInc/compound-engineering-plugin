import { describe, expect, test } from "bun:test"
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

function runScript(
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
  copyFileSync(path.join(FIXTURES, "current-v10.md"), testFile)
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

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
}

function journalPath(project: { flows: string }): string {
  return path.join(project.flows, ".user-test-commit-journal.json")
}

function payloadPath(project: { dir: string }, payload: any): string {
  const file = path.join(project.dir, "payload.json")
  writeJson(file, payload)
  return file
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
    const updated = readFileSync(project.testFile, "utf8")
    expect(updated).toContain(
      "| checkout/cart | change quantity | checkout/profile | profile shows stale cart count | failing | P1 | high | run-1 stale state | F,F,F |",
    )
    expect(readFileSync(path.join(project.flows, "bugs.md"), "utf8")).toContain(
      "profile shows stale cart count",
    )
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
