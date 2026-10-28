/**
 * Build blinded grading bundles from ce-ideate run-scaling pack runs.
 *
 *   bun tests/skill-eval-cell/packs/ce-ideate-run-scaling/collect.ts --out <bundle-dir> <pack-run-dir>...
 *
 * Claude logs each dispatch's model and full prompt in its session log. Codex
 * encrypts the spawn payload in both the parent and the child rollout, so a
 * Codex bundle carries each spawn's task name and model, the child's model and
 * final answer, and the orchestrator transcript instead of the prompt.
 */
import { randomBytes } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { writeJSON } from "../../provenance"

type Dispatch = Record<string, unknown>

const PACK_DOC = fs.readFileSync(path.join(import.meta.dir, "..", "ce-ideate-run-scaling.md"), "utf8")

function expectationsFor(scenarioId: string): string {
  const section = PACK_DOC.slice(PACK_DOC.indexOf("## Expectations"), PACK_DOC.indexOf("## Fixture"))
  const key = scenarioId.replace(/^ce-ideate\/run-scaling-/, "")
  const lines = section.split("\n")
  const common = lines.find((l) => l.startsWith("Every scenario except")) ?? ""
  const dispatching = lines.find((l) => l.startsWith("Every scenario that dispatches")) ?? ""
  const own = lines.find((l) => l.startsWith(`- **${key}**`))
  if (!own) throw new Error(`no expectations for ${scenarioId}`)
  const exempt = key === "merge" || key === "non-software"
  return [own, exempt ? "" : common, dispatching].filter(Boolean).join("\n\n") + "\n"
}

function readJsonl(file: string): any[] {
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

function claudeDispatches(workspace: string): Dispatch[] {
  const dir = path.join(os.homedir(), ".claude", "projects", workspace.replace(/[^A-Za-z0-9]/g, "-"))
  if (!fs.existsSync(dir)) return []
  const out: Dispatch[] = []
  const seen = new Set<string>()
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"))) {
    for (const entry of readJsonl(path.join(dir, name))) {
      const content = entry.message?.content
      if (!Array.isArray(content)) continue
      for (const item of content) {
        if (item.type !== "tool_use" || !["Task", "Agent"].includes(item.name) || seen.has(item.id)) continue
        seen.add(item.id)
        const { model, subagent_type, description, prompt } = item.input ?? {}
        out.push({ model: model ?? "(inherits orchestrator)", subagent_type, description, prompt })
      }
    }
  }
  return out
}

function codexRollouts(since: number): string[] {
  const root = path.join(os.homedir(), ".codex", "sessions")
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.name.startsWith("rollout-") && fs.statSync(p).mtimeMs >= since) files.push(p)
    }
  }
  if (fs.existsSync(root)) walk(root)
  return files
}

type Rollout = { file: string; entries: any[] }

function codexDispatches(workspace: string, metas: Rollout[]): Dispatch[] {
  const meta = (m: { entries: any[] }) => m.entries.find((e) => e.type === "session_meta")?.payload ?? {}
  const sameDir = (cwd: string) => cwd && fs.existsSync(cwd) && fs.realpathSync(cwd) === workspace
  const threads = new Set(metas.filter((m) => sameDir(meta(m).cwd) && !meta(m).parent_thread_id).map((m) => meta(m).id))
  const dispatches: Dispatch[] = []
  const seen = new Set<string>()
  let grew = true
  while (grew) {
    grew = false
    for (const m of metas) {
      const p = meta(m)
      if (p.parent_thread_id && threads.has(p.parent_thread_id) && !threads.has(p.id)) {
        threads.add(p.id)
        grew = true
      }
    }
  }
  for (const m of metas) {
    const p = meta(m)
    if (!threads.has(p.id)) continue
    for (const e of m.entries) {
      if (e.payload?.type === "function_call" && e.payload.name === "spawn_agent" && !seen.has(e.payload.call_id)) {
        seen.add(e.payload.call_id)
        const args = JSON.parse(e.payload.arguments ?? "{}")
        dispatches.push({ kind: "spawn", from_thread: p.id, task_name: args.task_name, model: args.model ?? "(inherits orchestrator)", reasoning_effort: args.reasoning_effort })
      }
    }
    if (!p.parent_thread_id) continue
    const settings = m.entries.find((e) => e.payload?.type === "thread_settings_applied")?.payload?.thread_settings ?? {}
    const recipient = m.entries.find((e) => e.payload?.type === "agent_message")?.payload?.recipient
    const done = m.entries.filter((e) => e.payload?.type === "task_complete").pop()?.payload
    dispatches.push({
      kind: "child",
      thread: p.id,
      task_name: recipient,
      model: settings.model,
      reasoning_effort: settings.reasoning_effort,
      prompt: "(encrypted by Codex; not recoverable)",
      final_answer: String(done?.last_agent_message ?? "").slice(0, 6000),
    })
  }
  return dispatches
}

// The run's scratch directory holds the briefs and checkpoints the orchestrator
// wrote; for Codex it is the only on-disk trace of what the subagents were given.
function copyScratch(hostDir: string, dispatches: Dispatch[], dest: string) {
  const text = ["stdout.txt", "stderr.txt"]
    .map((name) => path.join(hostDir, name))
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file, "utf8"))
    .concat(JSON.stringify(dispatches))
    .join("\n")
  const dirs = new Set(text.match(/\/[^\s"'`]*compound-engineering-\d+\/ce-ideate\/[0-9a-f]{8}/g) ?? [])
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    const target = path.join(dest, path.basename(dir))
    fs.mkdirSync(target, { recursive: true })
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name)
      if (fs.statSync(file).isFile()) fs.copyFileSync(file, path.join(target, name))
    }
  }
}

// Cell paths name the arm (`.../pre/...`), so they are replaced before a grader sees them.
function redactCellPaths(dir: string, runDir: string) {
  const roots = [...new Set([path.resolve(runDir), fs.realpathSync(runDir)])]
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`(?:${roots.map(escape).join("|")})[^\\s"'\`)\\]]*`, "g")
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name)
      if (entry.isDirectory()) walk(p)
      else fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(pattern, "<cell-path>"))
    }
  }
  walk(dir)
}

function main() {
  const args = process.argv.slice(2)
  const outIndex = args.indexOf("--out")
  if (outIndex < 0 || !args[outIndex + 1]) throw new Error("usage: collect.ts --out <bundle-dir> <pack-run-dir>...")
  const outDir = args[outIndex + 1]
  const runDirs = args.filter((_, i) => i !== outIndex && i !== outIndex + 1)
  fs.mkdirSync(outDir, { recursive: true })
  const keyPath = path.join(outDir, "key.json")
  const key: Record<string, unknown> = fs.existsSync(keyPath) ? JSON.parse(fs.readFileSync(keyPath, "utf8")) : {}

  for (const runDir of runDirs) {
    const pack = JSON.parse(fs.readFileSync(path.join(runDir, "pack.json"), "utf8"))
    const since = Date.parse(pack.started_at) - 60_000
    let rollouts: Rollout[] | undefined
    for (const row of Object.values<any>(pack.scenarios)) {
      if (!String(row.id).startsWith("ce-ideate/run-scaling-")) continue
      for (const [arm, info] of Object.entries<any>(row.arms)) {
        const hostsDir = path.join(info.out, "hosts")
        if (!fs.existsSync(hostsDir)) continue
        for (const host of fs.readdirSync(hostsDir)) {
          const hostDir = path.join(hostsDir, host)
          const workspace = fs.realpathSync(path.join(hostDir, "workspace"))
          const id = randomBytes(4).toString("hex")
          const bundle = path.join(outDir, id)
          fs.mkdirSync(path.join(bundle, "deliverables"), { recursive: true })
          fs.writeFileSync(path.join(bundle, "expectations.md"), expectationsFor(row.id))
          const stdout = path.join(hostDir, "stdout.txt")
          fs.writeFileSync(path.join(bundle, "answer.txt"), fs.existsSync(stdout) ? fs.readFileSync(stdout, "utf8") : "")
          const ideation = path.join(workspace, "docs", "ideation")
          for (const name of fs.existsSync(ideation) ? fs.readdirSync(ideation) : []) {
            if (name !== ".gitkeep") fs.copyFileSync(path.join(ideation, name), path.join(bundle, "deliverables", name))
          }
          if (host === "codex") rollouts ??= codexRollouts(since).map((file) => ({ file, entries: readJsonl(file) }))
          const dispatches = host === "codex" ? codexDispatches(workspace, rollouts!) : claudeDispatches(workspace)
          writeJSON(path.join(bundle, "dispatches.json"), dispatches)
          const stderr = path.join(hostDir, "stderr.txt")
          if (host === "codex" && fs.existsSync(stderr)) fs.copyFileSync(stderr, path.join(bundle, "orchestrator-transcript.txt"))
          copyScratch(hostDir, dispatches, path.join(bundle, "scratch"))
          redactCellPaths(bundle, runDir)
          key[id] = { scenario: row.id, arm, host, run: runDir }
        }
      }
    }
  }
  writeJSON(keyPath, key)
  console.log(`${Object.keys(key).length} bundles in ${outDir}`)
}

main()
