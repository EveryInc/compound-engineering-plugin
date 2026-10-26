/**
 * Runs one stale-intake scenario on one host against one skill ref, then collects
 * gradable facts.
 *
 *   bun tests/skill-eval-cell/packs/ce-babysit-pr-stale-intake/run-scenario.ts \
 *     --fixtures <built-dir> --scenario <name> --host claude|codex --out <new-dir> \
 *     [--ref WORKTREE|<git-ref>] [--timeout-secs 1800]
 *
 * The cell driver (run.ts) cannot be used directly: its --fixture copy leaves `origin`
 * pointing at the shared fixture remote, and it has no way to put the fake gh first on
 * PATH. This copies a pristine built scenario (minus scenario.json), repoints origin,
 * renames the repo per run so babysit's OS-temp state dir never collides, and keeps the
 * expected verdict out of the agent's reach until the host exits.
 */
import { spawn, spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { arg } from "../../cli"
import { REPO_ROOT, WORKTREE_REF, extractSkill } from "../../extract"
import { planHost, wrapPrompt, type Host } from "../../hosts"
import { prepareOutput, writeJSON } from "../../provenance"
import type { ScenarioFile } from "./scenarios"


function usage(): never {
  console.error(
    "usage: bun run-scenario.ts --fixtures <built-dir> --scenario <name> --host claude|codex --out <new-dir> [--ref WORKTREE|<git-ref>] [--timeout-secs 1800]",
  )
  process.exit(2)
}

function git(gitDir: string, args: string[]): { ok: boolean; out: string } {
  const r = spawnSync("git", ["--git-dir", gitDir, ...args], { encoding: "utf8" })
  return { ok: r.status === 0, out: r.stdout.trim() }
}

function readJsonl(file: string): Record<string, unknown>[] {
  if (!fs.existsSync(file)) return []
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function hostArgv(host: Host, argv: string[], finalFile: string): string[] {
  if (host === "claude") {
    const i = argv.indexOf("--output-format")
    const next = [...argv]
    next.splice(i, 2, "--output-format", "stream-json", "--verbose")
    return next
  }
  // The prompt is codex's last argument. A login shell would rerun the user's profile and
  // macOS path_helper, which put the real `gh` ahead of the fixture's bin/ again.
  return [...argv.slice(0, -1), "-c", "allow_login_shell=false", "--json", "-o", finalFile, argv[argv.length - 1]]
}

type Event = { t: number; stream: "stdout" | "stderr"; line: string }

function runHost(argv: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number, eventsFile: string) {
  return new Promise<{ exitCode: number | null; timedOut: boolean; started: number }>((resolve) => {
    const started = Date.now() / 1000
    const stdin = fs.openSync("/dev/null", "r")
    const child = spawn(argv[0], argv.slice(1), { cwd, env, stdio: [stdin, "pipe", "pipe"], detached: true })
    const events = fs.openSync(eventsFile, "a")
    const pending = { stdout: "", stderr: "" }
    const onData = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
      pending[stream] += chunk.toString()
      const lines = pending[stream].split("\n")
      pending[stream] = lines.pop() ?? ""
      for (const line of lines) fs.writeSync(events, `${JSON.stringify({ t: Date.now() / 1000, stream, line })}\n`)
    }
    child.stdout!.on("data", onData("stdout"))
    child.stderr!.on("data", onData("stderr"))
    let timedOut = false
    const killGroup = () => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL")
      } catch {}
    }
    const timer = setTimeout(() => {
      timedOut = true
      killGroup()
    }, timeoutMs)
    child.on("close", (code) => {
      clearTimeout(timer)
      for (const stream of ["stdout", "stderr"] as const) {
        if (pending[stream]) fs.writeSync(events, `${JSON.stringify({ t: Date.now() / 1000, stream, line: pending[stream] })}\n`)
      }
      fs.closeSync(events)
      fs.closeSync(stdin)
      // A watcher the agent armed in this process group would otherwise keep polling.
      killGroup()
      resolve({ exitCode: timedOut ? null : code, timedOut, started })
    })
  })
}

function transcript(host: Host, events: Event[], started: number): { lines: string[]; final: string } {
  const lines: string[] = []
  let final = ""
  const stamp = (t: number) => `[+${(t - started).toFixed(1)}s]`
  for (const e of events) {
    if (e.stream !== "stdout") continue
    let ev: any
    try {
      ev = JSON.parse(e.line)
    } catch {
      continue
    }
    if (host === "claude") {
      if (ev.type === "assistant") {
        for (const c of ev.message?.content ?? []) {
          if (c.type === "text" && c.text.trim()) lines.push(`${stamp(e.t)} ASSISTANT: ${c.text.trim()}`)
          if (c.type === "tool_use") {
            const detail = c.name === "Bash" ? c.input?.command : JSON.stringify(c.input).slice(0, 300)
            lines.push(`${stamp(e.t)} TOOL ${c.name}: ${detail}`)
          }
        }
      }
      if (ev.type === "result" && typeof ev.result === "string") final = ev.result
    } else if (ev.type === "item.completed") {
      if (ev.item?.type === "agent_message") lines.push(`${stamp(e.t)} ASSISTANT: ${String(ev.item.text).trim()}`)
      if (ev.item?.type === "command_execution") lines.push(`${stamp(e.t)} TOOL shell (exit ${ev.item.exit_code}): ${ev.item.command}`)
    }
  }
  return { lines, final }
}

function collectFacts(cell: string, s: ScenarioFile, started: number) {
  const remote = path.join(cell, "remote.git")
  const branchRef = `refs/heads/${s.head_branch}`
  const finalHead = git(remote, ["rev-parse", branchRef]).out
  const mainTip = git(remote, ["rev-parse", "refs/heads/main"]).out
  const isAncestor = (a: string, b: string) => git(remote, ["merge-base", "--is-ancestor", a, b]).ok
  const rewritten = finalHead !== s.initial.head && !isAncestor(s.initial.head, finalHead)
  // `git cherry` lists only original commits the final head does not already contain, "-" when
  // an equivalent patch landed anyway.
  const missing = new Map(
    git(remote, ["cherry", finalHead, s.initial.head, s.initial.merge_base]).out
      .split("\n")
      .filter(Boolean)
      .map((l) => [l.slice(2), l.startsWith("-")] as const),
  )
  const originals = git(remote, ["rev-list", "--reverse", `${s.initial.merge_base}..${s.initial.head}`]).out.split("\n").filter(Boolean)
  const pushes = readJsonl(path.join(cell, "git-pushes.jsonl"))
  const mutations = readJsonl(path.join(cell, "mutations.jsonl"))
  const authorPreserved = s.author_commit
    ? isAncestor(s.author_commit, finalHead) ||
      git(remote, ["cherry", finalHead, s.author_commit, `${s.author_commit}~1`]).out.startsWith("-")
    : null
  return {
    scenario: s.name,
    initial_head: s.initial.head,
    final_head: finalHead,
    pull_ref: git(remote, ["rev-parse", `refs/pull/${s.pr}/head`]).out,
    main_tip: mainTip,
    main_moved: mainTip !== s.initial.base,
    head_changed: finalHead !== s.initial.head,
    rewritten,
    fast_forward_only: finalHead !== s.initial.head && !rewritten,
    contains_main_tip: isAncestor(mainTip, finalHead),
    merge_commits_in_series: Number(git(remote, ["rev-list", "--count", "--merges", `${mainTip}..${finalHead}`]).out || 0),
    original_commits_in_final: originals.map((c) => ({
      commit: c.slice(0, 9),
      subject: git(remote, ["log", "-1", "--format=%s", c]).out,
      in_final: missing.has(c) ? (missing.get(c) ? "equivalent-patch" : "missing-or-changed") : "same-commit",
    })),
    final_series: git(remote, ["log", "--format=%h %s (%an)", `${mainTip}..${finalHead}`]).out.split("\n").filter(Boolean),
    final_diff_vs_main: git(remote, ["diff", "--stat", mainTip, finalHead]).out,
    pushes: pushes.map((p) => ({ ...p, t_rel: Number(p.ts) - started })),
    pushes_succeeded: pushes.filter((p) => p.exit === 0 && !p.dry_run).length,
    forced_without_lease: pushes.filter((p) => p.force && !p.lease).length,
    lease_refusals: pushes.filter((p) => p.lease && p.exit !== 0).length,
    author_commit: s.author_commit ?? null,
    author_commit_preserved: authorPreserved,
    mutations: mutations.map((m) => ({ argv: m.argv, t_rel: Number(m.ts) - started })),
    gh_calls: readJsonl(path.join(cell, "gh-calls.jsonl")).length,
    remote_reflog: git(remote, ["reflog", "show", "--date=iso-strict", "--format=%gd %h %gs", branchRef]).out.split("\n").filter(Boolean),
  }
}

async function main() {
  const fixtures = arg("--fixtures")
  const name = arg("--scenario")
  const host = arg("--host") as Host | undefined
  const outArg = arg("--out")
  if (!fixtures || !name || !outArg || (host !== "claude" && host !== "codex")) usage()
  const ref = arg("--ref", WORKTREE_REF) ?? WORKTREE_REF
  const timeoutMs = Number(arg("--timeout-secs", "1800")) * 1000

  const src = path.resolve(fixtures, name)
  const scenario: ScenarioFile = JSON.parse(fs.readFileSync(path.join(src, "scenario.json"), "utf8"))
  if (fs.existsSync(path.join(src, "gh-calls.jsonl")) || fs.existsSync(path.join(src, "git-pushes.jsonl"))) {
    throw new Error(`${src} has been used; rebuild fixtures so every run starts pristine`)
  }

  const out = prepareOutput(outArg)
  const cell = path.join(out, "cell")
  fs.cpSync(src, cell, { recursive: true, filter: (p) => p !== path.join(src, "scenario.json") })
  const runId = randomBytes(2).toString("hex")
  const ghDataFile = path.join(cell, "gh-data.json")
  const ghData = JSON.parse(fs.readFileSync(ghDataFile, "utf8"))
  ghData.repo = `${ghData.repo}-${runId}`
  fs.writeFileSync(ghDataFile, `${JSON.stringify(ghData, null, 2)}\n`)
  const workspace = path.join(cell, "work")
  spawnSync("git", ["-C", workspace, "remote", "set-url", "origin", path.join(cell, "remote.git")])

  const resolved = ref === WORKTREE_REF
    ? WORKTREE_REF
    : spawnSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd: REPO_ROOT, encoding: "utf8" }).stdout.trim()
  if (!resolved) throw new Error(`cannot resolve ref ${ref}`)
  const { skillDir } = extractSkill({ skill: "ce-babysit-pr", ref: resolved, dest: path.join(out, "extract") })

  const prompt = wrapPrompt({ skillDir, workspace, task: scenario.task })
  const promptFile = path.join(out, "prompt.md")
  fs.writeFileSync(promptFile, prompt)
  const plan = planHost(host, { cwd: workspace, prompt, promptFile })
  const finalFile = path.join(out, "final.md")
  const argv = hostArgv(host, plan.argv, finalFile)
  // An empty ZDOTDIR keeps the user's ~/.zshenv from prepending Homebrew (and the real `gh`) in every zsh.
  const zdotdir = path.join(out, "zdotdir")
  fs.mkdirSync(zdotdir, { recursive: true })
  const env = { ...plan.env, ZDOTDIR: zdotdir, PATH: `${path.join(cell, "bin")}${path.delimiter}${plan.env.PATH ?? ""}` }
  writeJSON(path.join(out, "argv.json"), argv.map((a) => (a === prompt ? "<prompt.md>" : a)))

  const eventsFile = path.join(out, "events.jsonl")
  const result = await runHost(argv, workspace, env, timeoutMs, eventsFile)
  const watcherPattern = `pr-snapshot.*${ghData.repo}`
  const stray = spawnSync("pgrep", ["-fl", watcherPattern], { encoding: "utf8" }).stdout.trim()
  if (stray) spawnSync("pkill", ["-f", watcherPattern])

  const events = readJsonl(eventsFile) as Event[]
  const t = transcript(host, events, result.started)
  if (host === "claude") fs.writeFileSync(finalFile, t.final)
  fs.writeFileSync(path.join(out, "transcript.md"), `${t.lines.join("\n\n")}\n`)
  writeJSON(path.join(out, "facts.json"), { ...collectFacts(cell, scenario, result.started), stray_watchers: stray || null })
  writeJSON(path.join(out, "run.json"), {
    scenario: name,
    host,
    requested_ref: ref,
    resolved_ref: resolved,
    repo_slug: `${ghData.owner}/${ghData.repo}`,
    exit_code: result.exitCode,
    timed_out: result.timedOut,
    started_at: new Date(result.started * 1000).toISOString(),
    duration_s: Math.round(Date.now() / 1000 - result.started),
  })
  // Written only after the host exited, so the agent could not read the expected verdict.
  fs.copyFileSync(path.join(src, "scenario.json"), path.join(out, "scenario.json"))
  console.log(out)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
