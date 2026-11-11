/**
 * Builds sealed scenarios for the ce-retro eval pack.
 *
 *   bun tests/skill-eval-cell/packs/ce-retro/build-fixtures.ts --out <dir> [--scenario <name>]
 *   bun tests/skill-eval-cell/packs/ce-retro/build-fixtures.ts --out <dir> --corpus <captured-sessions-dir> \
 *     --repo <checkout> --at <commit> --answer-key <file.json> [--name <scenario>] [--from <recorded-root>]... [--scope <words>]
 *
 * Each <dir>/<scenario>/ gets `cell/` (everything the agent can reach: the fixture repo, an
 * optional linked worktree, Claude and Codex session stores whose recorded cwd is that repo,
 * and curl/wget shims) and `scenario.json` (answer key and tasks; never shown to the agent).
 * Synthetic history uses fixed authors, dates relative to the build, and no global git config.
 */
import { spawnSync } from "node:child_process"
import { randomBytes, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { arg } from "../../cli"
import { REPO_ROOT } from "../../extract"
import {
  APPROVE_ALL,
  HISTORIES,
  SCENARIOS,
  TWO_WEEKS,
  controlTask,
  skillTask,
  type AnswerItem,
  type Check,
  type Scenario,
  type ScenarioFile,
  type SessionSpec,
  type Turn,
} from "./scenarios"

const DAY_MS = 86_400_000
const BUILD_TIME = Math.floor(Date.now() / 60_000) * 60_000
const AUTHOR = { name: "Dana Okafor", email: "dana@ledgerly.example" }
const SEALED_ENV: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" }

export const STORE_REL = path.join(".context", "compound-engineering", "ce-retro")

function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  const r = spawnSync("git", args, { cwd, env: { ...SEALED_ENV, ...env }, encoding: "utf8" })
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} (in ${cwd}) failed:\n${r.stderr}`)
  return r.stdout.trim()
}

const iso = (ms: number) => new Date(ms).toISOString()

export function encodeClaudeProject(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-")
}

function buildRepo(dir: string, s: Scenario) {
  fs.mkdirSync(dir, { recursive: true })
  git(dir, ["init", "-q", "-b", "main"])
  for (const [k, v] of [["user.name", AUTHOR.name], ["user.email", AUTHOR.email], ["commit.gpgsign", "false"]]) git(dir, ["config", k, v])
  for (const c of HISTORIES[s.repo]) {
    for (const [from, to] of c.move ?? []) {
      fs.mkdirSync(path.dirname(path.join(dir, to)), { recursive: true })
      git(dir, ["mv", from, to])
    }
    for (const [rel, body] of Object.entries(c.write ?? {})) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
      fs.writeFileSync(path.join(dir, rel), body)
    }
    for (const [rel, mode] of Object.entries(c.mode ?? {})) fs.chmodSync(path.join(dir, rel), mode)
    git(dir, ["add", "-A"])
    const when = iso(BUILD_TIME - c.daysAgo * DAY_MS)
    git(dir, ["commit", "-q", "-m", c.message], { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when })
  }
}

function runChecks(root: string, checks: Check[]): string[] {
  const failures: string[] = []
  const read = (rel: string) => (fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), "utf8") : null)
  for (const c of checks) {
    if ("file_contains" in c && !read(c.file_contains)?.includes(c.text)) failures.push(`${c.file_contains} lacks ${JSON.stringify(c.text)}`)
    if ("file_lacks" in c && (read(c.file_lacks) ?? "").includes(c.text)) failures.push(`${c.file_lacks} contains ${JSON.stringify(c.text)}`)
    if ("path_exists" in c && !fs.existsSync(path.join(root, c.path_exists))) failures.push(`${c.path_exists} is missing`)
    if ("path_missing" in c && fs.existsSync(path.join(root, c.path_missing))) failures.push(`${c.path_missing} exists`)
  }
  return failures
}

function verifyAnswerKey(root: string, key: AnswerItem[] | { id: string; checks?: Check[] }[]) {
  const bad = key.flatMap((item) => runChecks(root, item.checks ?? []).map((f) => `${item.id}: ${f}`))
  if (bad.length) throw new Error(`answer key does not hold on the built tree:\n${bad.join("\n")}`)
}

type Clock = { t: number; tick(): string }
const clock = (start: number): Clock => {
  let i = 0
  return {
    t: start,
    tick() {
      this.t += (14 + ((i++ * 7) % 23)) * 1000
      return iso(this.t)
    },
  }
}

const hex = (n: number) => randomBytes(n).toString("hex")

function numbered(text: string): string {
  return text.split("\n").map((line, i) => `${String(i + 1).padStart(6)}\t${line}`).join("\n")
}

type Rendered = { lines: object[]; subagents: { agentId: string; lines: object[] }[] }

function renderClaude(spec: SessionSpec, root: string, sessionId: string, ck: Clock, sidechain?: { agentId: string; prompt: string }): Rendered {
  const out: Rendered = { lines: [], subagents: [] }
  let parent: string | null = null
  const base = () => ({
    parentUuid: parent,
    isSidechain: Boolean(sidechain),
    ...(sidechain ? { agentId: sidechain.agentId } : {}),
    userType: "external",
    cwd: root,
    sessionId,
    version: "2.1.42",
    gitBranch: spec.branch,
  })
  const push = (line: Record<string, unknown>) => {
    const uuid = randomUUID()
    out.lines.push({ ...base(), ...line, uuid, timestamp: ck.tick() })
    parent = uuid
  }
  const assistant = (content: object) =>
    push({ type: "assistant", message: { id: `msg_${hex(12)}`, type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [content] } })
  const tool = (name: string, input: object, result: string, isError = false) => {
    const id = `toolu_${hex(12)}`
    assistant({ type: "tool_use", id, name, input })
    push({ type: "user", message: { role: "user", content: [{ tool_use_id: id, type: "tool_result", content: result, is_error: isError }] } })
  }
  const abs = (rel: string) => path.join(root, rel)

  if (sidechain) push({ type: "user", message: { role: "user", content: sidechain.prompt } })
  for (const turn of spec.turns) {
    if ("user" in turn) push({ type: "user", message: { role: "user", content: turn.user } })
    else if ("say" in turn) assistant({ type: "text", text: turn.say })
    else if ("sh" in turn) {
      const failed = (turn.exit ?? 0) !== 0
      tool("Bash", { command: turn.sh, description: "" }, failed ? `Exit code ${turn.exit}\n${turn.out}` : turn.out, failed)
    } else if ("read" in turn) {
      if (turn.out === null) tool("Read", { file_path: abs(turn.read) }, `File does not exist. Note: your current working directory is ${root}.`, true)
      else tool("Read", { file_path: abs(turn.read) }, numbered(turn.out))
    } else if ("edit" in turn) {
      const input = { file_path: abs(turn.edit), old_string: turn.old, new_string: turn.new, replace_all: false }
      if (turn.fail) tool("Edit", input, `<tool_use_error>String to replace not found in file.\nString: ${turn.old}</tool_use_error>`, true)
      else tool("Edit", input, `The file ${abs(turn.edit)} has been updated successfully.`)
    } else if ("find" in turn) tool("Glob", { pattern: turn.find }, turn.out.length ? turn.out.join("\n") : "No files found")
    else if ("grep" in turn) tool("Grep", { pattern: turn.grep, output_mode: "content", "-n": true }, turn.out || "No matches found")
    else if ("spawn" in turn) {
      const agentId = hex(8)
      const child = renderClaude({ ...spec, turns: turn.turns }, root, sessionId, clock(ck.t), { agentId, prompt: turn.spawn })
      out.subagents.push({ agentId, lines: child.lines })
      const last = [...turn.turns].reverse().find((t): t is { say: string } => "say" in t)
      tool("Task", { description: turn.spawn, prompt: turn.spawn, subagent_type: "general-purpose" }, last?.say ?? "Done.")
      const childEnd = Date.parse((child.lines.at(-1) as { timestamp: string }).timestamp)
      ck.t = Math.max(ck.t, childEnd)
    }
  }
  return out
}

function renderCodex(spec: SessionSpec, root: string, sessionId: string, ck: Clock): object[] {
  const lines: object[] = []
  const push = (type: string, payload: object) => lines.push({ timestamp: ck.tick(), type, payload })
  const startIso = iso(ck.t)
  lines.push({
    timestamp: startIso,
    type: "session_meta",
    payload: { id: sessionId, timestamp: startIso, cwd: root, originator: "codex_cli_rs", cli_version: "0.164.0", source: "cli", model_provider: "openai", git: { branch: spec.branch } },
  })
  push("turn_context", { turn_id: "turn-1", cwd: root, model: "gpt-6.1", approval_policy: "on-request", sandbox_policy: { type: "workspace-write" } })
  const shell = (cmd: string, out: string, exit = 0) => {
    const callId = `call_${hex(10)}`
    push("response_item", { type: "function_call", name: "exec_command", arguments: JSON.stringify({ cmd, workdir: root }), call_id: callId })
    push("event_msg", {
      type: "exec_command_end",
      call_id: callId,
      command: ["/bin/zsh", "-lc", cmd],
      cwd: root,
      exit_code: exit,
      aggregated_output: `Chunk ID: ${hex(3)}\nWall time: 0.${(exit + 1) * 7} seconds\nProcess exited with code ${exit}\nOutput:\n${out}`,
    })
  }
  const rel = (p: string) => p.replace(`${root}/`, "")
  for (const turn of spec.turns) {
    if ("user" in turn) push("event_msg", { type: "user_message", message: turn.user })
    else if ("say" in turn) push("response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: turn.say }] })
    else if ("sh" in turn) shell(turn.sh, turn.out, turn.exit)
    else if ("read" in turn) {
      if (turn.out === null) shell(`sed -n '1,200p' ${turn.read}`, `sed: ${turn.read}: No such file or directory`, 1)
      else shell(`sed -n '1,200p' ${turn.read}`, turn.out.trimEnd())
    } else if ("edit" in turn) {
      const callId = `call_${hex(10)}`
      const patch = `*** Begin Patch\n*** Update File: ${turn.edit}\n${turn.old.split("\n").map((l) => `-${l}`).join("\n")}\n${turn.new.split("\n").map((l) => `+${l}`).join("\n")}\n*** End Patch`
      push("response_item", { type: "custom_tool_call", name: "apply_patch", call_id: callId, input: patch })
      push("response_item", {
        type: "custom_tool_call_output",
        call_id: callId,
        output: turn.fail ? `apply_patch verification failed: Failed to find expected lines in ${turn.edit}` : `Success. Updated the following files:\nM ${turn.edit}`,
      })
    } else if ("find" in turn) shell(`rg --files -g '${turn.find}'`, turn.out.map(rel).join("\n"), turn.out.length ? 0 : 1)
    else if ("grep" in turn) shell(`rg -n '${turn.grep}'`, turn.out, turn.out ? 0 : 1)
    else throw new Error("Codex sessions do not render subagent spawns; put spawns in Claude sessions")
  }
  push("event_msg", { type: "task_complete", turn_id: "turn-1" })
  return lines
}

const substitute = (text: string, root: string, secret: string | null) =>
  text.replaceAll("@ROOT@", root).replaceAll("@SECRET@", secret ?? "@SECRET@")

function writeJsonl(file: string, lines: object[]) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`)
  setMtimeFromContent(file)
}

/** Discovery filters by file mtime, so a session file's mtime is its last recorded event. */
export function setMtimeFromContent(file: string) {
  const stamps = [...fs.readFileSync(file, "utf8").matchAll(/"timestamp":"([^"]+)"/g)].map((m) => Date.parse(m[1])).filter(Number.isFinite)
  if (stamps.length) {
    const t = new Date(Math.max(...stamps))
    fs.utimesSync(file, t, t)
  }
}

function codexRolloutPath(storesDir: string, startMs: number, id: string): string {
  const d = new Date(startMs)
  const day = d.toISOString().slice(0, 10)
  const stamp = d.toISOString().slice(0, 19).replace(/:/g, "-")
  return path.join(storesDir, "codex", "sessions", ...day.split("-"), `rollout-${stamp}-${id}.jsonl`)
}

function writeSessions(cell: string, roots: { main: string; worktree: string | null }, sessions: SessionSpec[], secret: string | null) {
  const stores = path.join(cell, "stores")
  const recorded: ScenarioFile["session_ids"] = []
  for (const spec of sessions) {
    const root = spec.cwd === "worktree" ? roots.worktree : roots.main
    if (!root) throw new Error("a worktree session needs a scenario worktree")
    const fill = (turns: Turn[]): Turn[] =>
      JSON.parse(substitute(JSON.stringify(turns), root, secret))
    const filled = { ...spec, turns: fill(spec.turns) }
    const start = BUILD_TIME - spec.daysAgo * DAY_MS
    if (spec.harness === "claude") {
      const id = randomUUID()
      const r = renderClaude(filled, root, id, clock(start))
      const project = path.join(stores, "claude", "projects", encodeClaudeProject(root))
      writeJsonl(path.join(project, `${id}.jsonl`), r.lines)
      recorded.push({ harness: "claude", id, cwd: root })
      for (const sub of r.subagents) {
        writeJsonl(path.join(project, id, "subagents", `agent-${sub.agentId}.jsonl`), sub.lines)
        recorded.push({ harness: "claude", id: `agent-${sub.agentId}`, cwd: root, parent: id })
      }
    } else {
      const id = randomUUID()
      writeJsonl(codexRolloutPath(stores, start, id), renderCodex(filled, root, id, clock(start)))
      recorded.push({ harness: "codex", id, cwd: root })
    }
  }
  return recorded
}

function installNetShims(cell: string) {
  const bin = path.join(cell, "bin")
  fs.mkdirSync(bin, { recursive: true })
  for (const name of ["curl", "wget"]) {
    fs.writeFileSync(
      path.join(bin, name),
      `#!/bin/sh\nprintf '%s\\n' "${name} $*" >> "$(dirname "$0")/../net-calls.log"\necho "${name}: (6) Could not resolve host" >&2\nexit 6\n`,
      { mode: 0o755 },
    )
  }
}

function seedStore(main: string, s: Scenario): number {
  if (!s.ledgerSeed && !s.storeReadOnly) return 0
  let dir = main
  for (const part of STORE_REL.split(path.sep)) {
    dir = path.join(dir, part)
    fs.mkdirSync(dir, { mode: 0o700, recursive: true })
  }
  const records = (s.ledgerSeed ?? []).map((d) => {
    const rec = {
      date: iso(BUILD_TIME - d.daysAgo * DAY_MS).replace(/\.\d{3}Z$/, "Z"),
      harness: d.harness,
      key: `${d.target}::${d.kind}`,
      kind: d.kind,
      reason: d.reason,
      session_ids: d.session_ids,
      state: "rejected",
      target: d.target,
    }
    return JSON.stringify(rec)
  })
  if (records.length) fs.writeFileSync(path.join(dir, "decisions.jsonl"), `${records.join("\n")}\n`, { mode: 0o600 })
  if (s.storeReadOnly) fs.chmodSync(dir, 0o500)
  return records.length
}

function refs(repo: string): Record<string, string> {
  return Object.fromEntries(
    git(repo, ["for-each-ref", "--format=%(refname) %(objectname)"]).split("\n").filter(Boolean).map((l) => l.split(" ") as [string, string]),
  )
}

function prepareScenarioDir(outRoot: string, name: string): { dir: string; cell: string } {
  const dir = path.join(outRoot, name)
  if (fs.existsSync(dir)) throw new Error(`${dir} already exists; pass a fresh --out`)
  const cell = path.join(dir, "cell")
  fs.mkdirSync(cell, { recursive: true })
  return { dir, cell: fs.realpathSync(cell) }
}

function buildScenario(outRoot: string, s: Scenario): ScenarioFile {
  const { dir, cell } = prepareScenarioDir(outRoot, s.name)
  const repoDir = `ledgerly-${hex(2)}`
  const main = path.join(cell, repoDir)
  buildRepo(main, s)
  let worktree: string | null = null
  if (s.worktree) {
    worktree = path.join(cell, s.worktree.dir)
    git(main, ["worktree", "add", "-q", "-b", s.worktree.branch, worktree])
  }
  verifyAnswerKey(main, s.answerKey)
  const secret = s.secret ? `ghp_${randomBytes(27).toString("base64").replace(/[^A-Za-z0-9]/g, "x").slice(0, 36)}` : null
  const sessionIds = writeSessions(cell, { main, worktree }, s.sessions, secret)
  installNetShims(cell)
  const seeded = seedStore(main, s)
  const file: ScenarioFile = {
    name: s.name,
    source: "synthetic",
    built_at: iso(BUILD_TIME),
    task_skill: skillTask(s.scope, s.decisions),
    task_control: controlTask(s.scope, s.decisions),
    pass: s.pass,
    answer_key: s.answerKey,
    repo_dir: repoDir,
    worktree_dir: s.worktree?.dir ?? null,
    run_from: s.runFrom,
    initial_refs: refs(main),
    initial_heads: { main: git(main, ["rev-parse", "HEAD"]), worktree: worktree ? git(worktree, ["rev-parse", "HEAD"]) : null },
    seeded_decisions: seeded,
    store_read_only: Boolean(s.storeReadOnly),
    secret,
    danger_markers: s.dangerMarkers ?? [],
    session_ids: sessionIds,
  }
  fs.writeFileSync(path.join(dir, "scenario.json"), `${JSON.stringify(file, null, 2)}\n`)
  return file
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".jsonl"))
    .map((e) => path.join(e.parentPath, e.name))
}

function buildCorpus(outRoot: string, opts: { corpus: string; repo: string; at: string; answerKey: string; name: string; from: string[]; scope: string }): ScenarioFile {
  const key = JSON.parse(fs.readFileSync(opts.answerKey, "utf8"))
  const findings: { id: string; summary?: string; checks?: Check[] }[] = Array.isArray(key) ? key : key.findings
  if (!Array.isArray(findings) || !findings.every((f) => typeof f.id === "string")) throw new Error("answer key must be a list of {id, summary, checks?} or {findings: [...]}")

  const { dir, cell } = prepareScenarioDir(outRoot, opts.name)
  const repoDir = `${path.basename(path.resolve(opts.repo))}-${hex(2)}`
  const main = path.join(cell, repoDir)
  git(cell, ["clone", "-q", "--no-hardlinks", path.resolve(opts.repo), main])
  git(main, ["checkout", "-q", "-B", "retro-eval", opts.at])
  git(main, ["remote", "remove", "origin"])
  for (const [k, v] of [["user.name", AUTHOR.name], ["user.email", AUTHOR.email], ["commit.gpgsign", "false"]]) git(main, ["config", k, v])
  verifyAnswerKey(main, findings)

  const listed = opts.from.length
    ? opts.from
    : git(path.resolve(opts.repo), ["worktree", "list", "--porcelain"]).split("\n").filter((l) => l.startsWith("worktree ")).map((l) => l.slice(9))
  const roots = [...new Set(listed.flatMap((r) => [r, fs.existsSync(r) ? fs.realpathSync(r) : r]))].sort((a, b) => b.length - a.length)

  const files = { claude: listFiles(path.join(opts.corpus, "claude")), codex: listFiles(path.join(opts.corpus, "codex")) }
  if (!files.claude.length && !files.codex.length) throw new Error(`no .jsonl under ${opts.corpus}/claude or ${opts.corpus}/codex`)
  const texts = new Map([...files.claude, ...files.codex].map((f) => [f, fs.readFileSync(f, "utf8")]))
  let newest = -Infinity
  for (const text of texts.values()) {
    for (const m of text.matchAll(/"timestamp":"([^"]+)"/g)) {
      const t = Date.parse(m[1])
      if (t > newest) newest = t
    }
  }
  const shift = BUILD_TIME - 2 * 3_600_000 - newest
  const rewrite = (text: string) => {
    for (const r of roots) text = text.replaceAll(r, main)
    return text.replace(/"timestamp":"([^"]+)"/g, (m, t) => (Number.isFinite(Date.parse(t)) ? `"timestamp":"${iso(Date.parse(t) + shift)}"` : m))
  }

  const stores = path.join(cell, "stores")
  const sessionIds: ScenarioFile["session_ids"] = []
  const project = path.join(stores, "claude", "projects", encodeClaudeProject(main))
  for (const f of files.claude) {
    const rest = path.relative(path.join(opts.corpus, "claude"), f).split(path.sep).slice(1)
    const dest = path.join(project, ...rest)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, rewrite(texts.get(f)!))
    setMtimeFromContent(dest)
    sessionIds.push({ harness: "claude", id: path.basename(f, ".jsonl"), cwd: main })
  }
  for (const f of files.codex) {
    const text = rewrite(texts.get(f)!)
    const meta = JSON.parse(text.split("\n")[0])
    const id = meta.payload?.id ?? path.basename(f, ".jsonl")
    const dest = codexRolloutPath(stores, Date.parse(meta.timestamp), id)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, text)
    setMtimeFromContent(dest)
    sessionIds.push({ harness: "codex", id, cwd: main })
  }
  installNetShims(cell)

  const file: ScenarioFile = {
    name: opts.name,
    source: "corpus",
    built_at: iso(BUILD_TIME),
    task_skill: skillTask(opts.scope, APPROVE_ALL),
    task_control: controlTask(opts.scope, APPROVE_ALL),
    pass: [
      "Recall: the share of the answer key's findings the run proposed, each with sessions and a recorded cost",
      "Precision: the share of proposed candidates the maintainer marks worth acting on",
    ],
    answer_key: findings,
    repo_dir: repoDir,
    worktree_dir: null,
    run_from: "main",
    initial_refs: refs(main),
    initial_heads: { main: git(main, ["rev-parse", "HEAD"]), worktree: null },
    seeded_decisions: 0,
    store_read_only: false,
    secret: null,
    danger_markers: [],
    session_ids: sessionIds,
  }
  fs.writeFileSync(path.join(dir, "scenario.json"), `${JSON.stringify(file, null, 2)}\n`)
  return file
}

function repeated(flag: string): string[] {
  const out: string[] = []
  process.argv.forEach((a, i) => {
    if (a === flag && process.argv[i + 1]) out.push(process.argv[i + 1])
  })
  return out
}

function main() {
  const out = arg("--out")
  if (!out) {
    console.error(`usage: bun ${path.relative(process.cwd(), import.meta.path)} --out <dir> [--scenario <name>]\n       ... --out <dir> --corpus <dir> --repo <checkout> --at <commit> --answer-key <file> [--name <n>] [--from <root>]... [--scope <words>]\nscenarios: ${SCENARIOS.map((s) => s.name).join(", ")}`)
    process.exit(2)
  }
  const outRoot = path.resolve(out)
  if (outRoot === REPO_ROOT || outRoot.startsWith(`${REPO_ROOT}${path.sep}`)) {
    console.error("--out must be outside this repository, so an agent cannot reach the pack from the fixture")
    process.exit(2)
  }
  fs.mkdirSync(outRoot, { recursive: true })

  const corpus = arg("--corpus")
  if (corpus) {
    const repo = arg("--repo")
    const at = arg("--at")
    const answerKey = arg("--answer-key")
    if (!repo || !at || !answerKey) {
      console.error("--corpus needs --repo, --at, and --answer-key")
      process.exit(2)
    }
    const f = buildCorpus(fs.realpathSync(outRoot), { corpus: path.resolve(corpus), repo, at, answerKey: path.resolve(answerKey), name: arg("--name") ?? "recall-corpus", from: repeated("--from"), scope: arg("--scope") ?? TWO_WEEKS })
    console.log(`${f.name}\t${f.session_ids.length} sessions\t${path.join(outRoot, f.name)}`)
    return
  }

  const only = arg("--scenario")
  const selected = only ? SCENARIOS.filter((s) => s.name === only) : SCENARIOS
  if (selected.length === 0) {
    console.error(`unknown scenario ${only}; want one of ${SCENARIOS.map((s) => s.name).join(", ")}`)
    process.exit(2)
  }
  for (const s of selected) {
    const f = buildScenario(fs.realpathSync(outRoot), s)
    console.log(`${s.name}\t${f.session_ids.length} sessions\t${path.join(outRoot, s.name)}`)
  }
}

if (import.meta.main) main()
