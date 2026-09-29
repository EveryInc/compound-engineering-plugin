/**
 * Judged evals: run conversation cells for a scenario's base ref and the working
 * tree, grade every transcript blind against the scenario's rubric, and report
 * totals per host and arm.
 *
 *   bun run test:skill-eval-judge -- --id ce-brainstorm/ --out /tmp/judge-run
 *   bun run test:skill-eval-judge -- --id ce-brainstorm/animation --trials 1 --hosts claude --out /tmp/j
 *   bun run test:skill-eval-judge -- --scenario my-change.json --out /tmp/j
 *   bun run test:skill-eval-judge -- --grade-only --out /tmp/judge-run
 *
 * Bills the host CLIs on PATH. Not part of `bun test` or CI.
 */
import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { arg, flag } from "./cli"
import { REPO_ROOT, WORKTREE_REF } from "./extract"
import { toollessClaudeArgv } from "./converse"
import { HOSTS, cellEnv, type Host } from "./hosts"
import { JUDGED_SCENARIOS, type JudgedScenario } from "./judged/scenarios"

export type Arm = "pre" | "post"

export type Cell = { scenario: JudgedScenario; arm: Arm; host: Host; trial: number; dir: string }

export type Grade = {
  metrics: Record<string, number | boolean | null>
  items?: { kind: string; text: string }[]
  widened?: string
  pushback?: string
}

const JUDGED_DIR = path.join(import.meta.dir, "judged")
const personaPath = (s: JudgedScenario) => resolveAsset(s.persona, path.join(JUDGED_DIR, "personas"))
const rubricPath = (s: JudgedScenario) => resolveAsset(s.rubric, path.join(JUDGED_DIR, "rubrics"))

/** A path wins; a bare name falls back to the library directory. */
export function resolveAsset(ref: string, libraryDir: string): string {
  return path.isAbsolute(ref) || fs.existsSync(ref) ? path.resolve(ref) : path.join(libraryDir, ref)
}

const SCENARIO_DEFAULTS = { companions: [] as string[], hosts: ["claude", "codex"] as Host[], trials: 1, max_turns: 25, timeout_secs: 3600 }

/** Loads one scenario or a list from a JSON file an agent wrote for the change at hand. */
export function loadScenarioFile(file: string): JudgedScenario[] {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"))
  const list = Array.isArray(parsed) ? parsed : [parsed]
  return list.map((raw) => {
    for (const key of ["id", "skill", "fixture", "persona", "opening", "task", "rubric", "base_ref"]) {
      if (typeof raw[key] !== "string" || !raw[key]) throw new Error(`${file}: scenario is missing "${key}"`)
    }
    if (!raw.task.includes("{opening}")) throw new Error(`${file}: task must contain {opening}`)
    return { ...SCENARIO_DEFAULTS, ...raw } as JudgedScenario
  })
}

export function planCells(
  scenarios: JudgedScenario[],
  outRoot: string,
  opts: { arms: Arm[]; hosts?: Host[]; trials?: number },
): Cell[] {
  const cells: Cell[] = []
  for (const scenario of scenarios) {
    const hosts = opts.hosts ?? scenario.hosts
    const trials = opts.trials ?? scenario.trials
    for (const arm of opts.arms) {
      for (const host of hosts) {
        for (let trial = 1; trial <= trials; trial++) {
          const dir = path.join(outRoot, "cells", scenario.id.replaceAll("/", "__"), arm, `${host}-${trial}`)
          cells.push({ scenario, arm, host, trial, dir })
        }
      }
    }
  }
  return cells
}

/** Cell paths name the arm; graders must not see them. */
export function redact(text: string, cellDir: string): string {
  return text.split(cellDir).join("<cell>")
}

export function gradingBundle(persona: string, conversation: string, result: string | null): string {
  return [
    "===== PERSONA =====",
    persona.trim(),
    "",
    "===== CONVERSATION =====",
    conversation.trim(),
    "",
    "===== RESULT DOCUMENT =====",
    result?.trim() || "(no document written; the result is the assistant's final chat message)",
  ].join("\n")
}

/** Graders are told to return bare JSON; tolerate a fence or stray prose around it. */
export function parseGrade(raw: string): Grade | null {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    if (!parsed || typeof parsed.metrics !== "object" || parsed.metrics === null) return null
    return parsed as Grade
  } catch {
    return null
  }
}

export type ReportRow = { scenario: string; host: Host; arm: Arm; graded: number; totals: Record<string, number> }

/** Numeric metrics are summed; boolean metrics count their true and false answers. */
export function aggregate(graded: { cell: Cell; grade: Grade }[]): ReportRow[] {
  const rows = new Map<string, ReportRow>()
  for (const { cell, grade } of graded) {
    const key = `${cell.scenario.id}|${cell.host}|${cell.arm}`
    const row = rows.get(key) ?? { scenario: cell.scenario.id, host: cell.host, arm: cell.arm, graded: 0, totals: {} }
    row.graded++
    for (const [name, value] of Object.entries(grade.metrics)) {
      if (typeof value === "number") row.totals[name] = (row.totals[name] ?? 0) + value
      else if (typeof value === "boolean") {
        const bucket = `${name}_${value}`
        row.totals[bucket] = (row.totals[bucket] ?? 0) + 1
      }
    }
    rows.set(key, row)
  }
  return [...rows.values()].sort((a, b) =>
    a.scenario.localeCompare(b.scenario) || a.host.localeCompare(b.host) || (a.arm === "pre" ? -1 : 1),
  )
}

export function renderReport(rows: ReportRow[]): string {
  const lines: string[] = ["# Judged eval report", ""]
  for (const scenario of [...new Set(rows.map((r) => r.scenario))]) {
    const group = rows.filter((r) => r.scenario === scenario)
    const metrics = [...new Set(group.flatMap((r) => Object.keys(r.totals)))].sort()
    const columns = group.map((r) => `${r.host} ${r.arm === "pre" ? "base" : "tree"} (n=${r.graded})`)
    lines.push(`## ${scenario}`, "", `| metric | ${columns.join(" | ")} |`, `|---|${columns.map(() => "---").join("|")}|`)
    for (const metric of metrics) lines.push(`| ${metric} | ${group.map((r) => r.totals[metric] ?? 0).join(" | ")} |`)
    lines.push("")
  }
  return lines.join("\n")
}

async function pool<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  const queue = [...items]
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item)
  }))
}

function exec(argv: string[], opts: { cwd: string; input?: string; timeoutMs: number }): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), { cwd: opts.cwd, env: cellEnv(), stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (c) => { stdout += c })
    child.stderr.on("data", (c) => { stderr += c })
    const timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs)
    child.on("close", (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }) })
    child.stdin.end(opts.input ?? "")
  })
}

function cellArgv(cell: Cell): string[] {
  const s = cell.scenario
  const argv = [
    "bun", path.join(import.meta.dir, "run.ts"),
    "--skill", s.skill,
    "--fixture", path.isAbsolute(s.fixture) ? s.fixture : path.join(REPO_ROOT, s.fixture), "--git-init",
    "--hosts", cell.host,
    "--persona", personaPath(s),
    "--max-turns", String(s.max_turns),
    "--timeout-secs", String(s.timeout_secs),
    "--task", s.task.replace("{opening}", s.opening),
    "--out", cell.dir,
    "--ref", cell.arm === "pre" ? s.base_ref : WORKTREE_REF,
  ]
  if (s.companions.length > 0) argv.push("--with-skill", s.companions.join(","))
  return argv
}

function readCell(cell: Cell): { conversation: string; result: string | null } | null {
  const hostDir = path.join(cell.dir, "hosts", cell.host)
  const stdoutFile = path.join(hostDir, "stdout.txt")
  if (!fs.existsSync(stdoutFile)) return null
  const docs = path.join(hostDir, "workspace", "docs")
  const doc = fs.existsSync(docs)
    ? fs.readdirSync(docs, { recursive: true }).map(String).find((f) => /\.(md|html)$/.test(f))
    : undefined
  return {
    conversation: redact(fs.readFileSync(stdoutFile, "utf8"), cell.dir),
    result: doc ? redact(fs.readFileSync(path.join(docs, doc), "utf8"), cell.dir) : null,
  }
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

async function main() {
  const out = arg("--out")
  if (!out) {
    console.error("usage: bun run test:skill-eval-judge -- --out dir [--scenario file.json] [--id prefix] [--arm ab|pre|post] [--hosts claude,codex] [--trials n] [--concurrency 8] [--grader-model sonnet] [--grade-only]")
    process.exit(2)
  }
  const scenarioFile = arg("--scenario")
  const idPrefix = arg("--id") ?? ""
  const scenarios = (scenarioFile ? loadScenarioFile(scenarioFile) : JUDGED_SCENARIOS).filter((s) => s.id.startsWith(idPrefix))
  if (scenarios.length === 0) throw new Error(`no judged scenario matches ${idPrefix}`)
  const armArg = arg("--arm", "ab")
  if (!["ab", "pre", "post"].includes(armArg!)) throw new Error(`--arm must be ab, pre or post, not ${armArg}`)
  const arms: Arm[] = armArg === "ab" ? ["pre", "post"] : [armArg as Arm]
  const hosts = arg("--hosts")?.split(",").map((h) => h.trim()) as Host[] | undefined
  const unknown = hosts?.filter((h) => !HOSTS.includes(h))
  if (unknown?.length) throw new Error(`unknown host: ${unknown.join(", ")}`)
  const trials = arg("--trials") ? Number(arg("--trials")) : undefined
  const concurrency = Number(arg("--concurrency", "8"))
  const cells = planCells(scenarios, path.resolve(out), { arms, hosts, trials })

  if (!flag("--grade-only")) {
    const pending = cells.filter((c) => !fs.existsSync(path.join(c.dir, "summary.json")))
    console.error(`running ${pending.length} of ${cells.length} cells, ${concurrency} at a time`)
    await pool(pending, concurrency, async (cell) => {
      fs.mkdirSync(path.dirname(cell.dir), { recursive: true })
      const r = await exec(cellArgv(cell), { cwd: REPO_ROOT, timeoutMs: (cell.scenario.timeout_secs + 600) * 1000 })
      fs.writeFileSync(`${cell.dir}.collector.log`, `${r.stdout}\n${r.stderr}`)
      console.error(`${r.status === 0 ? "ran" : "FAILED"} ${path.relative(out, cell.dir)}`)
    })
  }

  // Grade in a shuffled order under anonymous ids; the map stays outside what graders see.
  const gradingDir = path.join(out, "grading")
  fs.mkdirSync(gradingDir, { recursive: true })
  const model = arg("--grader-model", "sonnet")!
  const readable = shuffle(cells.map((cell) => ({ cell, content: readCell(cell) })).filter((c) => c.content !== null))
  const graded: { cell: Cell; grade: Grade }[] = []
  const map: Record<string, string> = {}
  await pool(readable.map((c, i) => ({ ...c, id: `G${String(i + 1).padStart(3, "0")}` })), concurrency, async ({ cell, content, id }) => {
    map[id] = path.relative(out, cell.dir)
    const persona = fs.readFileSync(personaPath(cell.scenario), "utf8")
    const rubric = fs.readFileSync(rubricPath(cell.scenario), "utf8")
    const input = `${rubric}\n\n${gradingBundle(persona, content!.conversation, content!.result)}`
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ce-judge-"))
    const r = await exec(toollessClaudeArgv(model), { cwd: scratch, input, timeoutMs: 600_000 })
    fs.rmSync(scratch, { recursive: true, force: true })
    const grade = r.status === 0 ? parseGrade(r.stdout) : null
    fs.writeFileSync(path.join(gradingDir, `${id}.json`), `${JSON.stringify({ grade, raw: r.stdout, stderr: r.stderr.slice(0, 2000) }, null, 2)}\n`)
    if (grade) graded.push({ cell, grade })
    else console.error(`grade failed for ${id}`)
  })
  fs.writeFileSync(path.join(out, "grading-map.json"), `${JSON.stringify(map, null, 2)}\n`)

  const rows = aggregate(graded)
  fs.writeFileSync(path.join(out, "report.json"), `${JSON.stringify(rows, null, 2)}\n`)
  const report = renderReport(rows)
  fs.writeFileSync(path.join(out, "report.md"), report)
  console.log(report)
  console.error(`graded ${graded.length} of ${readable.length} cells; ${cells.length - readable.length} produced no transcript`)
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
