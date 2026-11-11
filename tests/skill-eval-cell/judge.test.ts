import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { aggregate, cellComplete, cellIdentity, cellMatchesPlan, checkHosts, checkScenario, checkScenarioId, gradingBundle, positiveInt, writtenDocuments, loadScenarioFile, parseGrade, planCells, redact, renderReport, resolveAsset, type Cell } from "./judge"
import { JUDGED_SCENARIOS, type JudgedScenario } from "./judged/scenarios"

const scenario: JudgedScenario = {
  id: "ce-brainstorm/x", skill: "ce-brainstorm", companions: [], fixture: "f", persona: "p.md", opening: "o",
  task: "Idea: {opening}", rubric: "r.md", base_ref: "abc", hosts: ["claude", "codex"], trials: 2, max_turns: 5, timeout_secs: 60,
}

describe("planCells", () => {
  test("expands arms, hosts and trials into separate cell directories", () => {
    const cells = planCells([scenario], "/out", { arms: ["pre", "post"] })
    expect(cells).toHaveLength(8)
    expect(new Set(cells.map((c) => c.dir)).size).toBe(8)
    expect(cells[0].dir).toBe(path.join("/out/cells/ce-brainstorm/x/pre/claude-1"))
  })

  test("ids that differ keep separate directories", () => {
    const dirs = planCells([{ ...scenario, id: "a/b__c" }, { ...scenario, id: "a__b/c" }], "/out", { arms: ["pre"] }).map((c) => c.dir)
    expect(new Set(dirs).size).toBe(dirs.length)
  })

  test("host and trial overrides replace the scenario's own", () => {
    expect(planCells([scenario], "/out", { arms: ["post"], hosts: ["codex"], trials: 1 })).toHaveLength(1)
  })
})

describe("blind grading inputs", () => {
  test("the cell path, which names the arm, is removed from what graders see", () => {
    const text = redact("FILES_READ: /out/cells/x/pre/claude-1/hosts/claude/skill/SKILL.md", "/out/cells/x/pre/claude-1")
    expect(text).toBe("FILES_READ: <cell>/hosts/claude/skill/SKILL.md")
    expect(text).not.toContain("pre")
  })

  test("a missing result document is stated, not left blank", () => {
    expect(gradingBundle("persona", "talk", null)).toContain("no document written")
  })
})

describe("parseGrade", () => {
  test("accepts bare JSON and JSON wrapped in a fence or prose", () => {
    const body = '{"metrics": {"overbuilt": 1, "asked_adjacent": true}}'
    expect(parseGrade(body)?.metrics.overbuilt).toBe(1)
    expect(parseGrade(`Here you go:\n\`\`\`json\n${body}\n\`\`\``)?.metrics.asked_adjacent).toBe(true)
  })

  test("rejects output without a usable metric", () => {
    expect(parseGrade("no json here")).toBeNull()
    expect(parseGrade('{"items": []}')).toBeNull()
    expect(parseGrade('{"metrics": {}}')).toBeNull()
    expect(parseGrade('{"metrics": []}')).toBeNull()
    expect(parseGrade('{"metrics": {"overbuilt": "two", "asked_adjacent": null}}')).toBeNull()
  })
})

describe("aggregate", () => {
  const cell = (arm: "pre" | "post", host: "claude" | "codex"): Cell => ({ scenario, arm, host, trial: 1, dir: "/d" })

  test("sums numeric metrics and counts boolean answers per scenario, host and arm", () => {
    const rows = aggregate([
      { cell: cell("pre", "claude"), grade: { metrics: { overbuilt: 2, asked_adjacent: true } } },
      { cell: cell("pre", "claude"), grade: { metrics: { overbuilt: 1, asked_adjacent: false } } },
      { cell: cell("post", "claude"), grade: { metrics: { overbuilt: 0, asked_adjacent: null } } },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ arm: "pre", graded: 2, totals: { overbuilt: 3, asked_adjacent_true: 1, asked_adjacent_false: 1 } })
    expect(rows[1]).toMatchObject({ arm: "post", graded: 1, totals: { overbuilt: 0 } })
    const report = renderReport(rows)
    expect(report).toContain("| overbuilt | 3 | 0 |")
    expect(report).toContain("claude base (n=2)")
  })

  test("a metric a grade leaves out, or gives the wrong type, is shown as missing, not as zero", () => {
    const rows = aggregate([
      { cell: cell("pre", "claude"), grade: { metrics: { overbuilt: 2 } } },
      { cell: cell("pre", "claude"), grade: { metrics: { overbuilt: "two" as unknown as number } } },
      { cell: cell("post", "claude"), grade: { metrics: { narrowed: 1 } } },
    ])
    const report = renderReport(rows)
    expect(report).toContain("| overbuilt | 2 (1 missing) | 0 (1 missing) |")
    expect(report).toContain("| narrowed | 0 (2 missing) | 1 |")
  })
})

describe("scenario files an agent writes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "judge-test-"))
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  test("fill defaults and require the fields a run needs", () => {
    const file = path.join(dir, "s.json")
    const { hosts, trials, companions, max_turns, timeout_secs, ...required } = scenario
    fs.writeFileSync(file, JSON.stringify(required))
    expect(loadScenarioFile(file)[0]).toMatchObject({ hosts: ["claude", "codex"], trials: 1, max_turns: 25 })
    fs.writeFileSync(file, JSON.stringify({ ...required, task: "no placeholder" }))
    expect(() => loadScenarioFile(file)).toThrow(/\{opening\}/)
    fs.writeFileSync(file, JSON.stringify({ ...required, rubric: undefined }))
    expect(() => loadScenarioFile(file)).toThrow(/rubric/)
    fs.writeFileSync(file, JSON.stringify({ ...required, trials: 0 }))
    expect(() => loadScenarioFile(file)).toThrow(/trials/)
    fs.writeFileSync(file, JSON.stringify({ ...required, hosts: [] }))
    expect(() => loadScenarioFile(file)).toThrow(/hosts/)
  })

  test("a path wins over the library name", () => {
    const own = path.join(dir, "persona.md")
    fs.writeFileSync(own, "x")
    expect(resolveAsset(own, "/lib")).toBe(own)
    expect(resolveAsset("csv.md", "/lib")).toBe("/lib/csv.md")
  })
})

test("every library scenario points at a persona, rubric and fixture that exist", () => {
  const root = path.join(import.meta.dir, "..", "..")
  for (const s of JUDGED_SCENARIOS) {
    expect(fs.existsSync(path.join(import.meta.dir, "judged", "personas", s.persona))).toBe(true)
    expect(fs.existsSync(path.join(import.meta.dir, "judged", "rubrics", s.rubric))).toBe(true)
    expect(fs.existsSync(path.join(root, s.fixture))).toBe(true)
    expect(s.task).toContain("{opening}")
  }
})

test("a cell counts as complete only once its evidence is sealed and its conversation completed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "judge-cell-"))
  try {
    const summary = (outcome: string) => fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify({ cells: { claude: { process_outcome: outcome } } }))
    summary("completed")
    expect(cellComplete(dir, "claude")).toBe(false)
    fs.writeFileSync(path.join(dir, "evidence-manifest.json"), "{}")
    expect(cellComplete(dir, "claude")).toBe(true)
    summary("nonzero-or-spawn-error")
    expect(cellComplete(dir, "claude")).toBe(false)
    expect(cellComplete(dir, "codex")).toBe(false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe("run selection", () => {
  test("conversation hosts are limited to the ones with a scriptable resume", () => {
    expect(() => checkHosts(["claude", "codex"], "--hosts")).not.toThrow()
    expect(() => checkHosts(["grok"], "--hosts")).toThrow(/grok/)
  })

  test("trial and concurrency counts must be positive integers", () => {
    expect(positiveInt("3", "--trials")).toBe(3)
    expect(positiveInt(undefined, "--trials")).toBeUndefined()
    for (const bad of ["0", "-1", "2.5", "x"]) expect(() => positiveInt(bad, "--trials")).toThrow(/positive integer/)
  })
})

test("the graded result is what the conversation wrote, wherever it wrote it", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "judge-docs-"))
  try {
    const initial = path.join(root, "initial")
    const final = path.join(root, "final")
    for (const dir of [initial, final]) {
      fs.mkdirSync(path.join(dir, "docs"), { recursive: true })
      fs.writeFileSync(path.join(dir, "docs", "old.md"), "fixture doc")
      fs.writeFileSync(path.join(dir, "README.md"), "readme")
    }
    fs.writeFileSync(path.join(final, "README.md"), "readme, edited")
    fs.mkdirSync(path.join(final, "specs", "plans"), { recursive: true })
    fs.writeFileSync(path.join(final, "specs", "plans", "new.md"), "written")
    fs.writeFileSync(path.join(final, "notes.txt"), "not a document")
    fs.mkdirSync(path.join(final, ".git"))
    fs.writeFileSync(path.join(final, ".git", "description.md"), "git internals")
    expect(writtenDocuments(initial, final)).toEqual(["README.md", "specs/plans/new.md"])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("scenario ids cannot climb out of the output directory", () => {
  expect(() => checkScenarioId("ce-brainstorm/animation")).not.toThrow()
  for (const bad of ["../victim", "a/../b", "..\\..\\victim", "a b", "", "a//b"]) expect(() => checkScenarioId(bad)).toThrow(/plain names/)
})

test("every library scenario passes the checks a run applies", () => {
  for (const s of JUDGED_SCENARIOS) expect(() => checkScenario(s)).not.toThrow()
})

test("a finished cell is reused only when it was collected from exactly the planned inputs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "judge-plan-"))
  try {
    const persona = path.join(root, "persona.md")
    fs.writeFileSync(persona, "the persona")
    const fixture = path.join(root, "fixture")
    fs.mkdirSync(fixture)
    fs.writeFileSync(path.join(fixture, "a.txt"), "a")
    const s: JudgedScenario = { ...scenario, persona, fixture, base_ref: "abc" }
    const cell: Cell = { scenario: s, arm: "pre", host: "claude", trial: 1, dir: path.join(root, "cell") }
    expect(cellMatchesPlan(cell)).toBe(false)
    fs.writeFileSync(`${cell.dir}.identity`, cellIdentity(cell))
    expect(cellMatchesPlan(cell)).toBe(true)
    for (const changed of [{ skill: "ce-plan" }, { companions: ["ce-noslop"] }, { max_turns: 9 }, { timeout_secs: 99 }, { opening: "x" }]) {
      expect(cellMatchesPlan({ ...cell, scenario: { ...s, ...changed } })).toBe(false)
    }
    fs.writeFileSync(persona, "an edited persona")
    expect(cellMatchesPlan(cell)).toBe(false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("repeated scenario ids or hosts are rejected instead of sharing a cell", () => {
  expect(() => planCells([scenario, scenario], "/out", { arms: ["pre"] })).toThrow(/share a directory/)
  expect(() => planCells([scenario], "/out", { arms: ["pre"], hosts: ["claude", "claude"] })).toThrow(/share a directory/)
})
