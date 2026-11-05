// Writes a cell's output layout so collect.ts reads both arms the same way.
import { spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { planHost, userConfigDir, type Host } from "../../hosts"
import { installPathShims } from "../../path-shim"
import { prepareOutput, writeJSON } from "../../provenance"

const args = process.argv.slice(2)
const arg = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const host = arg("--host") as Host
const fixture = arg("--fixture")
const taskFile = arg("--task-file")
const outArg = arg("--out")
if (!["claude", "codex"].includes(host) || !fixture || !taskFile || !outArg) {
  console.error("usage: vanilla.ts --host claude|codex --fixture <dir> --task-file <f> --out <dir> [--effort xhigh] [--timeout-secs 2400]")
  process.exit(2)
}
const effort = arg("--effort") ?? "xhigh"
const timeoutMs = Number(arg("--timeout-secs") ?? 2400) * 1000

const out = prepareOutput(outArg)
const hostDir = path.join(out, "hosts", host)
const workspace = path.join(hostDir, "workspace")
fs.cpSync(fixture, workspace, { recursive: true })
const git = (...a: string[]) => spawnSync("git", a, { cwd: workspace, encoding: "utf8" })
git("init", "-q", "-b", "main")
git("add", ".")
git("-c", "user.name=eval", "-c", "user.email=eval@example.invalid", "commit", "-q", "-m", "seed")
const seed = git("rev-parse", "HEAD").stdout.trim()
git("remote", "add", "origin", "https://example.invalid/eval.git")
git("update-ref", "refs/remotes/origin/main", seed)

const task = fs.readFileSync(taskFile, "utf8").trim()
const prompt = `${task}\n\nWork in ${fs.realpathSync(workspace)}. Do not use any installed skills or plugins.\n`
const plan = planHost(host, { cwd: workspace, prompt, promptFile: path.join(hostDir, "prompt.md"), userConfigDir: userConfigDir(out, host), reasoningEffort: effort })
if (host === "claude") plan.argv.push("--disable-slash-commands")
Object.assign(plan.env, installPathShims(hostDir, [{ bin: "git", subcommand: "push", exitCode: 1, stderr: "fatal: no configured remote" }]))
fs.writeFileSync(path.join(hostDir, "prompt.md"), prompt)
fs.writeFileSync(path.join(hostDir, "argv.json"), `${JSON.stringify(plan.argv.map((a) => (a === prompt ? "<prompt.md>" : a)), null, 2)}\n`)
writeJSON(path.join(out, "input-manifest.json"), { schema_version: 1, arm: "vanilla", started_at: new Date().toISOString(), host, effort, fixture, task_file: taskFile, timeout_ms: timeoutMs }, true)

// Detached so a timeout can kill the host's whole process group; its subprocesses would
// otherwise keep running and billing, and hold the pipes open past the timeout.
const child = spawn(plan.argv[0], plan.argv.slice(1), { cwd: workspace, env: plan.env, stdio: ["ignore", "pipe", "pipe"], detached: true })
const killTree = () => {
  try {
    if (child.pid) process.kill(-child.pid, "SIGKILL")
  } catch {}
}
process.on("exit", killTree)
let stdout = ""
let stderr = ""
child.stdout.on("data", (d) => (stdout += d))
child.stderr.on("data", (d) => (stderr += d))
let timedOut = false
let backstop: ReturnType<typeof setTimeout> | undefined
const exitCode = await new Promise<number | null>((resolve) => {
  const timer = setTimeout(() => {
    timedOut = true
    killTree()
    backstop = setTimeout(() => resolve(null), 5000)
  }, timeoutMs)
  child.on("close", (code) => {
    clearTimeout(timer)
    if (backstop) clearTimeout(backstop)
    resolve(timedOut ? null : code)
  })
})
fs.writeFileSync(path.join(hostDir, "stdout.txt"), stdout)
fs.writeFileSync(path.join(hostDir, "stderr.txt"), stderr)
fs.writeFileSync(path.join(hostDir, "exit.json"), `${JSON.stringify({ exitCode, timedOut }, null, 2)}\n`)
console.log(JSON.stringify({ out, host, exitCode, timedOut }))
