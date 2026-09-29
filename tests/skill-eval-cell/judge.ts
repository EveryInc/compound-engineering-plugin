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
import { CONVERSE_HOSTS, toollessClaudeArgv } from "./converse"
import { cellEnv, type Host } from "./hosts"
import { fingerprint, sha256, verifyEvidence } from "./provenance"
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

export type RunConfig = { scenarios: JudgedScenario[]; arms: Arm[]; hosts?: Host[]; trials?: number }

/** Only hosts with a scriptable resume can hold a conversation. */
export function checkHosts(hosts: string[], source: string): void {
  const bad = hosts.filter((h) => !CONVERSE_HOSTS.includes(h as Host))
  if (bad.length > 0) throw new Error(`${source}: conversations run only on ${CONVERSE_HOSTS.join(", ")}, not ${bad.join(", ")}`)
}

export function positiveInt(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer, not ${raw}`)
  return n
}

/** Checks what a run needs from a scenario, whether it came from the library or a file. */
export function checkScenario(s: JudgedScenario): void {
  checkScenarioId(s.id)
  if (!Array.isArray(s.hosts) || s.hosts.length === 0) throw new Error(`${s.id}: hosts must list at least one host`)
  checkHosts(s.hosts, s.id)
  for (const key of ["trials", "max_turns", "timeout_secs"] as const) {
    if (!Number.isInteger(s[key]) || s[key] <= 0) throw new Error(`${s.id}: ${key} must be a positive integer, not ${s[key]}`)
  }
  if (!s.task.includes("{opening}")) throw new Error(`${s.id}: task must contain {opening}`)
}

/** Loads one scenario or a list from a JSON file an agent wrote for the change at hand. */
export function loadScenarioFile(file: string): JudgedScenario[] {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"))
  const list = Array.isArray(parsed) ? parsed : [parsed]
  return list.map((raw) => {
    for (const key of ["id", "skill", "fixture", "persona", "opening", "task", "rubric", "base_ref"]) {
      if (typeof raw[key] !== "string" || !raw[key]) throw new Error(`${file}: scenario is missing "${key}"`)
    }
    const scenario = { ...SCENARIO_DEFAULTS, ...raw } as JudgedScenario
    checkScenario(scenario)
    return scenario
  })
}

/** Ids become directory names, so each segment must be a plain name that cannot climb out of the output. */
export function checkScenarioId(id: string): void {
  const segments = id.split("/")
  if (!segments.every((seg) => /^[A-Za-z0-9._-]+$/.test(seg) && seg !== "." && seg !== "..")) {
    throw new Error(`scenario id must be slash-separated plain names (letters, digits, . _ -), not ${JSON.stringify(id)}`)
  }
}

export function planCells(
  scenarios: JudgedScenario[],
  outRoot: string,
  opts: { arms: Arm[]; hosts?: Host[]; trials?: number },
): Cell[] {
  const cells: Cell[] = []
  for (const scenario of scenarios) {
    checkScenarioId(scenario.id)
    const hosts = opts.hosts ?? scenario.hosts
    const trials = opts.trials ?? scenario.trials
    for (const arm of opts.arms) {
      for (const host of hosts) {
        for (let trial = 1; trial <= trials; trial++) {
          // Id segments are checked plain names, so nesting them keeps every scenario in its own directory.
          const dir = path.join(outRoot, "cells", ...scenario.id.split("/"), arm, `${host}-${trial}`)
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
    if (!parsed || typeof parsed.metrics !== "object" || parsed.metrics === null || Array.isArray(parsed.metrics)) return null
    // A grade must carry at least one number or yes/no answer; an empty or untyped map grades nothing.
    const usable = Object.values(parsed.metrics).some((v) => (typeof v === "number" && Number.isFinite(v)) || typeof v === "boolean")
    return usable ? (parsed as Grade) : null
  } catch {
    return null
  }
}

export type ReportRow = {
  scenario: string; host: Host; arm: Arm; graded: number
  totals: Record<string, number>
  /** How many grades reported each metric; fewer than `graded` means some grades left it out. */
  reported: Record<string, number>
}

/**
 * Numeric metrics are summed; boolean metrics count their true and false answers, and a
 * null boolean means "not applicable". A metric a grade omits or gives the wrong type is
 * counted as missing rather than as zero.
 */
export function aggregate(graded: { cell: Cell; grade: Grade }[]): ReportRow[] {
  const rows = new Map<string, ReportRow>()
  for (const { cell, grade } of graded) {
    const key = `${cell.scenario.id}|${cell.host}|${cell.arm}`
    const row = rows.get(key) ?? { scenario: cell.scenario.id, host: cell.host, arm: cell.arm, graded: 0, totals: {}, reported: {} }
    row.graded++
    for (const [name, value] of Object.entries(grade.metrics)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        row.totals[name] = (row.totals[name] ?? 0) + value
        row.reported[name] = (row.reported[name] ?? 0) + 1
      } else if (typeof value === "boolean" || value === null) {
        if (value !== null) row.totals[`${name}_${value}`] = (row.totals[`${name}_${value}`] ?? 0) + 1
        row.reported[name] = (row.reported[name] ?? 0) + 1
      }
    }
    rows.set(key, row)
  }
  return [...rows.values()].sort((a, b) =>
    a.scenario.localeCompare(b.scenario) || a.host.localeCompare(b.host) || (a.arm === "pre" ? -1 : 1),
  )
}

/** A boolean bucket (`name_true`) inherits its metric's reported count. */
function cellValue(row: ReportRow, metric: string): string {
  const base = metric.replace(/_(true|false)$/, "")
  const reported = row.reported[metric] ?? row.reported[base] ?? 0
  const value = row.totals[metric] ?? 0
  return reported < row.graded ? `${value} (${row.graded - reported} missing)` : String(value)
}

export function renderReport(rows: ReportRow[]): string {
  const lines: string[] = ["# Judged eval report", ""]
  for (const scenario of [...new Set(rows.map((r) => r.scenario))]) {
    const group = rows.filter((r) => r.scenario === scenario)
    const metrics = [...new Set(group.flatMap((r) => Object.keys(r.totals)))].sort()
    const columns = group.map((r) => `${r.host} ${r.arm === "pre" ? "base" : "tree"} (n=${r.graded})`)
    lines.push(`## ${scenario}`, "", `| metric | ${columns.join(" | ")} |`, `|---|${columns.map(() => "---").join("|")}|`)
    for (const metric of metrics) lines.push(`| ${metric} | ${group.map((r) => cellValue(r, metric)).join(" | ")} |`)
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
    // SIGTERM first: run.ts kills the host process groups it started on SIGTERM, and a
    // SIGKILL would skip that and leave billing host CLIs running.
    let force: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      force = setTimeout(() => child.kill("SIGKILL"), 15_000)
    }, opts.timeoutMs)
    child.on("close", (status) => { clearTimeout(timer); if (force) clearTimeout(force); resolve({ status, stdout, stderr }) })
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

/**
 * A cell counts only once its evidence is sealed and its conversation completed:
 * run.ts writes summary.json before the host starts, so that file alone proves nothing.
 */
export function cellComplete(dir: string, host: Host): boolean {
  try {
    if (!fs.existsSync(path.join(dir, "evidence-manifest.json"))) return false
    const summary = JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8"))
    return summary.cells?.[host]?.process_outcome === "completed"
  } catch {
    return false
  }
}

/**
 * The documents the conversation wrote: files in the host's final workspace that are new
 * or changed from the sealed starting workspace. Both copies are sealed evidence, unlike
 * .git, and the comparison also catches documents written to gitignored paths.
 */
export function writtenDocuments(initialWorkspace: string, finalWorkspace: string): string[] {
  const docs: string[] = []
  for (const rel of fs.readdirSync(finalWorkspace, { recursive: true }).map(String)) {
    if (rel.split(path.sep).includes(".git") || !/\.(md|html)$/.test(rel)) continue
    const after = path.join(finalWorkspace, rel)
    if (!fs.statSync(after).isFile()) continue
    const before = path.join(initialWorkspace, rel)
    if (fs.existsSync(before) && fs.readFileSync(before).equals(fs.readFileSync(after))) continue
    docs.push(rel.split(path.sep).join("/"))
  }
  return docs.sort()
}

/**
 * A finished cell is reused only if it was collected from the inputs this run plans:
 * the post arm's directory always says WORKTREE, so an edited skill, task, persona or
 * fixture would otherwise have an old transcript graded as if it tested the new one.
 */
export function cellMatchesPlan(cell: Cell): boolean {
  try {
    const input = JSON.parse(fs.readFileSync(path.join(cell.dir, "input-manifest.json"), "utf8"))
    const s = cell.scenario
    const ref = cell.arm === "pre" ? s.base_ref : WORKTREE_REF
    const fixture = path.isAbsolute(s.fixture) ? s.fixture : path.join(REPO_ROOT, s.fixture)
    return input.requested_ref === ref &&
      input.task_sha256 === sha256(s.task.replace("{opening}", s.opening)) &&
      input.persona_sha256 === sha256(fs.readFileSync(personaPath(s))) &&
      input.initial_workspace?.sha256 === fingerprint(fixture).sha256 &&
      (ref !== WORKTREE_REF || input.skill?.sha256 === fingerprint(path.join(REPO_ROOT, "skills", s.skill)).sha256)
  } catch {
    return false
  }
}

function readCell(cell: Cell): { conversation: string; result: string | null; persona: string } | null {
  if (!cellComplete(cell.dir, cell.host)) return null
  // Grade against the persona the simulated user actually saw, sealed with the cell.
  verifyEvidence(cell.dir)
  const hostDir = path.join(cell.dir, "hosts", cell.host)
  const workspace = path.join(hostDir, "workspace")
  const docs = writtenDocuments(path.join(cell.dir, "workspace"), workspace)
  const result = docs.length
    ? docs.map((f) => `--- ${f} ---\n${fs.readFileSync(path.join(workspace, f), "utf8")}`).join("\n\n")
    : null
  return {
    conversation: redact(fs.readFileSync(path.join(hostDir, "stdout.txt"), "utf8"), cell.dir),
    result: result ? redact(result, cell.dir) : null,
    persona: fs.readFileSync(path.join(cell.dir, "persona.md"), "utf8"),
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
    console.error("usage: bun run test:skill-eval-judge -- --out dir [--scenario file.json] [--id prefix] [--arm ab|pre|post] [--hosts claude,codex] [--trials n] [--concurrency 8] [--grader-model sonnet] [--grade-only (reuses the run's saved selection)]")
    process.exit(2)
  }
  const concurrency = positiveInt(arg("--concurrency", "8"), "--concurrency")!
  const configFile = path.join(out, "judge-config.json")
  let config: RunConfig
  if (flag("--grade-only")) {
    // Regrade exactly the cells this output was collected for, whatever flags are passed now.
    if (!fs.existsSync(configFile)) throw new Error(`--grade-only needs ${configFile} from an earlier run`)
    config = JSON.parse(fs.readFileSync(configFile, "utf8"))
  } else {
    const scenarioFile = arg("--scenario")
    const idPrefix = arg("--id") ?? ""
    const scenarios = (scenarioFile ? loadScenarioFile(scenarioFile) : JUDGED_SCENARIOS).filter((s) => s.id.startsWith(idPrefix))
    if (scenarios.length === 0) throw new Error(`no judged scenario matches ${idPrefix}`)
    for (const s of scenarios) checkScenario(s)
    const armArg = arg("--arm", "ab")
    if (!["ab", "pre", "post"].includes(armArg!)) throw new Error(`--arm must be ab, pre or post, not ${armArg}`)
    const hosts = arg("--hosts")?.split(",").map((h) => h.trim()) as Host[] | undefined
    if (hosts) checkHosts(hosts, "--hosts")
    config = { scenarios, arms: armArg === "ab" ? ["pre", "post"] : [armArg as Arm], hosts, trials: positiveInt(arg("--trials"), "--trials") }
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`)
  }
  const cells = planCells(config.scenarios, path.resolve(out), { arms: config.arms, hosts: config.hosts, trials: config.trials })
  if (cells.length === 0) throw new Error("the selection plans no cells")

  if (!flag("--grade-only")) {
    const pending = cells.filter((c) => !cellComplete(c.dir, c.host) || !cellMatchesPlan(c))
    for (const cell of pending) {
      // run.ts needs an empty output directory; keep an interrupted attempt for inspection.
      if (fs.existsSync(cell.dir)) fs.renameSync(cell.dir, `${cell.dir}.incomplete-${Date.now()}`)
    }
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
  const readable = shuffle(cells.map((cell) => {
    try {
      return { cell, content: readCell(cell) }
    } catch (error) {
      console.error(`not grading ${path.relative(out, cell.dir)}: ${(error as Error).message}`)
      return { cell, content: null }
    }
  }).filter((c) => c.content !== null))
  const graded: { cell: Cell; grade: Grade }[] = []
  const map: Record<string, string> = {}
  await pool(readable.map((c, i) => ({ ...c, id: `G${String(i + 1).padStart(3, "0")}` })), concurrency, async ({ cell, content, id }) => {
    map[id] = path.relative(out, cell.dir)
    const rubric = fs.readFileSync(rubricPath(cell.scenario), "utf8")
    const input = `${rubric}\n\n${gradingBundle(content!.persona, content!.conversation, content!.result)}`
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
  console.error(`graded ${graded.length} of ${readable.length} completed cells; ${cells.length - readable.length} did not complete and are not graded`)
  // A partial grid can show only one arm; the report stays for diagnosis, but the run fails.
  if (graded.length < cells.length) {
    console.error(`incomplete: ${cells.length - graded.length} of ${cells.length} planned cells have no grade`)
    process.exit(1)
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
