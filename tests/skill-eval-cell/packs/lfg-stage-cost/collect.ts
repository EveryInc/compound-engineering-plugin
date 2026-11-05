import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export type Usage = { input: number; cacheWrite5m: number; cacheWrite1h: number; cacheRead: number; output: number }
export type Turn = { model: string; fast?: boolean; usage: Usage; calls: Call[] }
export type Call = { text: string } | { spawn: string }
export type Thread = { turns: Turn[]; children: Record<string, Thread> }

export type StageRow = {
  stage: string
  usage: Usage
  dollars: number | null
  agents: number
  context_growth: number
  context_peak: number
  models: string[]
}

const zero = (): Usage => ({ input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 })
const add = (a: Usage, b: Usage) => {
  for (const k of Object.keys(a) as (keyof Usage)[]) a[k] += b[k]
}
const contextOf = (u: Usage) => u.input + u.cacheWrite5m + u.cacheWrite1h + u.cacheRead

// USD per million tokens, from the claude-api skill's model table (cached 2026-10-06).
// Haiku's cache-read rate is not listed there; 0.1x input is the documented general rule.
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
}

export function dollars(model: string, u: Usage, fast = false): number | null {
  const key = Object.keys(PRICES).find((k) => model.startsWith(k))
  if (!key) return null
  const p = PRICES[key]
  const scale = fast && key === "claude-opus-5-5" ? 2 : 1
  const input = p.input * scale
  return (
    (u.input * input + u.cacheWrite5m * input * 1.25 + u.cacheWrite1h * input * 2 + u.cacheRead * p.cacheRead * scale + u.output * p.output * scale) /
    1e6
  )
}

const STEP_OF: Record<string, string> = {
  "ce-plan": "plan",
  "ce-debug": "plan",
  "ce-work": "work",
  "ce-simplify-code": "simplify",
  "ce-code-review": "code-review",
  "ce-compound": "compound",
  "ce-test-browser": "browser",
  "ce-commit-push-pr": "ship",
  "ce-babysit-pr": "babysit",
}
const NESTS: Record<string, string[]> = { "ce-work": ["ce-simplify-code"], "ce-debug": ["ce-work"] }

// A cell copies the skill under test to `<host>/skill/` and companions to `<host>/skills/<name>/`.
const SKILL_FILE = /(?:\/skills\/(lfg|ce-[a-z0-9-]+)|\/(skill))\/(?:SKILL\.md|references\/)|"skill"\s*:\s*"(?:[a-z-]+:)?(lfg|ce-[a-z0-9-]+)"/g

export function skillReads(text: string, mainSkill = "lfg"): string[] {
  return [...text.matchAll(SKILL_FILE)].map((m) => m[1] ?? m[3] ?? mainSkill)
}

function threadTotals(t: Thread, into: { usage: Usage; dollars: number | null; agents: number; models: Set<string> }) {
  for (const turn of t.turns) {
    add(into.usage, turn.usage)
    const d = dollars(turn.model, turn.usage, turn.fast)
    into.dollars = into.dollars === null || d === null ? null : into.dollars + d
    into.models.add(turn.model)
  }
  for (const child of Object.values(t.children)) {
    into.agents += 1
    threadTotals(child, into)
  }
}

/**
 * Charge each parent turn to the stage active before its tool calls run, and each
 * spawned child (with its descendants) to the stage active at the spawn.
 */
export function attribute(root: Thread, mainSkill = "lfg"): StageRow[] {
  const rows = new Map<string, StageRow & { modelSet: Set<string> }>()
  let step = "unattributed"
  let sub: string | null = null
  let lastContext = 0
  const label = () => (sub ? `${step} > ${sub}` : step)
  const row = (name: string) => {
    let r = rows.get(name)
    if (!r) {
      r = { stage: name, usage: zero(), dollars: 0, agents: 0, context_growth: 0, context_peak: 0, models: [], modelSet: new Set() }
      rows.set(name, r)
    }
    return r
  }
  const lastContextAtEntry = new Map<string, number>()
  let stepSkill: string | undefined
  // Once lfg reads its own files again, the step skill has returned and the next step skill is top level.
  let stepOpen = false
  const apply = (skill: string) => {
    if (skill === mainSkill) {
      sub = null
      stepOpen = false
      if (step === "unattributed") step = "intake"
      return
    }
    if (skill === stepSkill) {
      sub = null
      return
    }
    if (sub === skill) return
    const nested = stepOpen && stepSkill !== undefined && NESTS[stepSkill]?.includes(skill)
    if (STEP_OF[skill] && !nested) {
      step = STEP_OF[skill]
      stepSkill = skill
      stepOpen = true
      sub = null
      return
    }
    if (step === "unattributed") step = "intake"
    sub = skill
  }
  const usedTurns: { stage: string; context: number }[] = []
  for (const turn of root.turns) {
    const name = label()
    const r = row(name)
    if (!lastContextAtEntry.has(name)) lastContextAtEntry.set(name, lastContext)
    add(r.usage, turn.usage)
    const d = dollars(turn.model, turn.usage, turn.fast)
    r.dollars = r.dollars === null || d === null ? null : r.dollars + d
    r.modelSet.add(turn.model)
    const ctx = contextOf(turn.usage)
    r.context_peak = Math.max(r.context_peak, ctx)
    usedTurns.push({ stage: name, context: ctx })
    lastContext = ctx
    for (const call of turn.calls) {
      if ("spawn" in call) {
        const child = root.children[call.spawn]
        if (!child) continue
        const target = row(label())
        const totals = { usage: zero(), dollars: 0 as number | null, agents: 1, models: new Set<string>() }
        threadTotals(child, totals)
        add(target.usage, totals.usage)
        target.dollars = target.dollars === null || totals.dollars === null ? null : target.dollars + totals.dollars
        target.agents += totals.agents
        for (const m of totals.models) target.modelSet.add(m)
        continue
      }
      for (const read of skillReads(call.text, mainSkill)) apply(read)
    }
  }
  for (const [name, r] of rows) {
    const last = usedTurns.filter((t) => t.stage === name).pop()
    r.context_growth = last ? last.context - (lastContextAtEntry.get(name) ?? 0) : 0
  }
  return [...rows.values()].map(({ modelSet, ...r }) => ({ ...r, models: [...modelSet].sort() }))
}

export function readJsonl(file: string): any[] {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
}

/** Claude repeats an assistant message once per content block; usage is per message id. */
export function claudeThread(entries: any[], childFor: (agentId: string) => Thread | undefined): Thread {
  const turns: Turn[] = []
  const byId = new Map<string, Turn>()
  const seenCalls = new Set<string>()
  const spawnCalls = new Map<string, { spawn: string }>()
  const children: Record<string, Thread> = {}
  for (const e of entries) {
    const msg = e.message
    if (e.type === "assistant" && msg?.id && msg.usage) {
      let turn = byId.get(msg.id)
      if (!turn) {
        const u = msg.usage
        const write = u.cache_creation_input_tokens ?? 0
        const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0
        turn = {
          model: msg.model ?? "unknown",
          fast: u.speed === "fast",
          usage: { input: u.input_tokens ?? 0, cacheWrite5m: write - w1h, cacheWrite1h: w1h, cacheRead: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0 },
          calls: [],
        }
        byId.set(msg.id, turn)
        turns.push(turn)
      }
      for (const c of Array.isArray(msg.content) ? msg.content : []) {
        if (c.type !== "tool_use" || seenCalls.has(c.id)) continue
        seenCalls.add(c.id)
        if (c.name === "Agent" || c.name === "Task") {
          const call = { spawn: c.id as string }
          spawnCalls.set(c.id, call)
          turn.calls.push(call)
        } else turn.calls.push({ text: JSON.stringify(c.input ?? {}) })
      }
    }
    const agentId = e.toolUseResult?.agentId
    if (e.type === "user" && agentId && Array.isArray(msg?.content)) {
      for (const c of msg.content) {
        if (c.type === "tool_result" && spawnCalls.has(c.tool_use_id) && !children[c.tool_use_id]) {
          const child = childFor(agentId)
          if (child) children[c.tool_use_id] = child
        }
      }
    }
  }
  return { turns, children }
}

export function claudeRun(workspace: string): Thread | null {
  const dirs = [...new Set([workspace, fs.existsSync(workspace) ? fs.realpathSync(workspace) : workspace])].map((w) =>
    path.join(os.homedir(), ".claude", "projects", w.replace(/[^A-Za-z0-9]/g, "-")),
  )
  const dir = dirs.find((d) => fs.existsSync(d))
  if (!dir) return null
  const sessions = fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"))
  if (sessions.length === 0) return null
  const threads = sessions.map((name) => {
    const subDir = path.join(dir, name.replace(/\.jsonl$/, ""), "subagents")
    const childFor = (agentId: string): Thread | undefined => {
      const file = path.join(subDir, `agent-${agentId}.jsonl`)
      return fs.existsSync(file) ? claudeThread(readJsonl(file), childFor) : undefined
    }
    return claudeThread(readJsonl(path.join(dir, name)), childFor)
  })
  return { turns: threads.flatMap((t) => t.turns), children: Object.assign({}, ...threads.map((t) => t.children)) }
}

/** Codex logs one token_usage_record per response; `input_tokens` includes cached input. */
export function codexThread(entries: any[], childFor: (taskName: string) => Thread | undefined): Thread {
  const turns: Turn[] = []
  const seenResponses = new Set<string>()
  const seenCalls = new Set<string>()
  const spawnCalls = new Set<string>()
  const children: Record<string, Thread> = {}
  let model = "unknown"
  let pending: Call[] = []
  for (const e of entries) {
    const p = e.payload ?? {}
    if (e.type === "turn_context" && p.model) model = p.model
    if (e.type === "response_item" && (p.type === "function_call" || p.type === "custom_tool_call") && p.call_id && !seenCalls.has(p.call_id)) {
      seenCalls.add(p.call_id)
      if (p.name === "spawn_agent") {
        spawnCalls.add(p.call_id)
        pending.push({ spawn: p.call_id })
      } else pending.push({ text: String(p.arguments ?? p.input ?? "") })
    }
    if (e.type === "response_item" && p.type === "function_call_output" && spawnCalls.has(p.call_id) && !children[p.call_id]) {
      try {
        const name = JSON.parse(p.output).task_name
        const child = name ? childFor(name) : undefined
        if (child) children[p.call_id] = child
      } catch {}
    }
    if (e.type === "token_usage_record" && p.usage && !seenResponses.has(p.response_id)) {
      seenResponses.add(p.response_id)
      const u = p.usage
      const cached = u.cached_input_tokens ?? 0
      turns.push({
        model,
        usage: { input: (u.input_tokens ?? 0) - cached, cacheWrite5m: u.cache_write_input_tokens ?? 0, cacheWrite1h: 0, cacheRead: cached, output: u.output_tokens ?? 0 },
        calls: pending,
      })
      pending = []
    }
  }
  if (pending.length && turns.length) turns[turns.length - 1].calls.push(...pending)
  return { turns, children }
}

export function codexRun(workspace: string, since: number): Thread | null {
  const root = path.join(os.homedir(), ".codex", "sessions")
  if (!fs.existsSync(root)) return null
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.name.startsWith("rollout-") && fs.statSync(p).mtimeMs >= since) files.push(p)
    }
  }
  walk(root)
  const real = fs.existsSync(workspace) ? fs.realpathSync(workspace) : workspace
  const rollouts = files.map((file) => {
    const entries = readJsonl(file)
    return { entries, meta: entries.find((e) => e.type === "session_meta")?.payload ?? {} }
  })
  const sameDir = (cwd: string) => cwd && fs.existsSync(cwd) && fs.realpathSync(cwd) === real
  const top = rollouts.filter((r) => sameDir(r.meta.cwd) && !r.meta.parent_thread_id)
  if (top.length === 0) return null
  const build = (r: (typeof rollouts)[number]): Thread =>
    codexThread(r.entries, (taskName) => {
      const child = rollouts.find((c) => c.meta.parent_thread_id === r.meta.id && c.meta.source?.subagent?.thread_spawn?.agent_path === taskName)
      return child ? build(child) : undefined
    })
  const threads = top.map(build)
  return { turns: threads.flatMap((t) => t.turns), children: Object.assign({}, ...threads.map((t) => t.children)) }
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

type RunSpec = { task: string; arm: string; host: string; trial: number; out: string }

function main() {
  const args = process.argv.slice(2)
  const get = (name: string) => {
    const i = args.indexOf(name)
    return i >= 0 ? args[i + 1] : undefined
  }
  const runsFile = get("--runs")
  if (!runsFile) throw new Error("usage: collect.ts --runs <runs.json> [--out <report.json>] [--json]")
  const runs: RunSpec[] = runsFile.endsWith(".jsonl") ? readJsonl(runsFile) : JSON.parse(fs.readFileSync(runsFile, "utf8"))
  const results = runs.map((run) => {
    const workspace = path.join(run.out, "hosts", run.host, "workspace")
    const manifest = path.join(run.out, "input-manifest.json")
    const started = fs.existsSync(manifest) ? Date.parse(JSON.parse(fs.readFileSync(manifest, "utf8")).started_at) : 0
    const thread = run.host === "codex" ? codexRun(workspace, started - 60_000) : claudeRun(workspace)
    const stages = thread ? attribute(thread) : []
    const total = stages.reduce((s, r) => (s === null || r.dollars === null ? null : s + r.dollars), 0 as number | null)
    const tokens = stages.reduce((s, r) => s + contextOf(r.usage) + r.usage.output, 0)
    const checkFile = path.join(run.out, "hosts", run.host, "check.json")
    const check = fs.existsSync(checkFile) ? JSON.parse(fs.readFileSync(checkFile, "utf8")) : null
    return { ...run, found_log: Boolean(thread), total_dollars: total, total_tokens: tokens, stages, check }
  })
  const out = get("--out")
  if (out) fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`)

  const groups = new Map<string, typeof results>()
  for (const r of results) {
    const key = `${r.task}\t${r.arm}\t${r.host}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const fmt = (n: number | null, digits = 2) => (n === null ? "n/a" : n.toFixed(digits))
  const lines = ["| task | arm | host | n | median $ | median Mtok | stage | median $ | median Mtok | median agents | median ctx growth (Ktok) |", "|---|---|---|---|---|---|---|---|---|---|---|"]
  for (const [key, rs] of groups) {
    const [task, arm, host] = key.split("\t")
    const found = rs.filter((r) => r.found_log)
    const totalD = found.every((r) => r.total_dollars !== null) ? median(found.map((r) => r.total_dollars as number)) : null
    const stageNames = [...new Set(found.flatMap((r) => r.stages.map((s) => s.stage)))]
    const first = `| ${task} | ${arm} | ${host} | ${found.length} | ${fmt(totalD)} | ${fmt(median(found.map((r) => r.total_tokens / 1e6)))} |`
    lines.push(`${first} (all) | | | | |`)
    for (const stage of stageNames) {
      const per = found.map((r) => r.stages.find((s) => s.stage === stage))
      const d = per.every((s) => !s || s.dollars !== null) ? median(per.map((s) => s?.dollars ?? 0)) : null
      lines.push(
        `| | | | | | | ${stage} | ${fmt(d)} | ${fmt(median(per.map((s) => (s ? (contextOf(s.usage) + s.usage.output) / 1e6 : 0))))} | ${fmt(median(per.map((s) => s?.agents ?? 0)), 0)} | ${fmt(median(per.map((s) => (s?.context_growth ?? 0) / 1e3)), 0)} |`,
      )
    }
  }
  const metrics: Record<string, number | null> = {}
  lines.push("", "| task | arm | host | median doc-review + simplify share ($) | median share (tokens) | ordering correct |", "|---|---|---|---|---|---|")
  for (const [key, rs] of groups) {
    const [task, arm, host] = key.split("\t")
    const found = rs.filter((r) => r.found_log)
    const dollarShare = found.every((r) => r.total_dollars) ? median(found.map((r) => reviewShare(r.stages, "dollars") / (r.total_dollars as number))) : null
    const tokenShare = found.length ? median(found.map((r) => reviewShare(r.stages, "tokens") / r.total_tokens)) : null
    const checks = rs.map((r) => r.check?.ordering_correct).filter((v) => v !== undefined)
    const ordering = checks.length ? `${checks.filter((v) => v === true).length}/${checks.length}` : ""
    const prefix = `${task}.${arm}.${host}`
    Object.assign(metrics, {
      [`${prefix}.total_dollars`]: found.every((r) => r.total_dollars !== null) && found.length ? median(found.map((r) => r.total_dollars as number)) : null,
      [`${prefix}.total_mtok`]: found.length ? median(found.map((r) => r.total_tokens / 1e6)) : null,
      [`${prefix}.review_share_dollars`]: dollarShare,
      [`${prefix}.review_share_tokens`]: tokenShare,
      ...(checks.length ? { [`${prefix}.ordering_correct`]: checks.filter((v) => v === true).length / checks.length } : {}),
    })
    lines.push(`| ${task} | ${arm} | ${host} | ${dollarShare === null ? "n/a" : `${(dollarShare * 100).toFixed(1)}%`} | ${tokenShare === null ? "n/a" : `${(tokenShare * 100).toFixed(1)}%`} | ${ordering} |`)
  }
  console.log(args.includes("--json") ? JSON.stringify(metrics) : lines.join("\n"))
}

export function isReviewSimplify(stage: string): boolean {
  return stage === "simplify" || stage.endsWith("> ce-simplify-code") || stage.endsWith("> ce-doc-review")
}

function reviewShare(stages: StageRow[], unit: "dollars" | "tokens"): number {
  return stages
    .filter((s) => isReviewSimplify(s.stage))
    .reduce((sum, s) => sum + (unit === "dollars" ? (s.dollars ?? 0) : contextOf(s.usage) + s.usage.output), 0)
}

if (import.meta.main) main()
