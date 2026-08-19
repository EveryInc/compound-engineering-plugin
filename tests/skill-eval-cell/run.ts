/**
 * One eval cell: extract skills/<name> from a git ref and run the same
 * prompt on the host CLIs that are installed.
 *
 *   bun run test:skill-eval-cell -- --skill ce-debug --task "mode:pipeline …"
 *
 * Does not run in default `bun test` / CI. Missing CLIs skip.
 */
import { spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { arg, flag } from "./cli"
import { WORKTREE_REF, extractSkill, mintCellDir } from "./extract"
import { HOSTS, planHost, resolveRunHosts, wrapPrompt, type Host, type HostPlan } from "./hosts"
import { installPathShims, type PathShim } from "./path-shim"

function parseHosts(): Host[] | undefined {
  const raw = arg("--hosts")
  if (raw === undefined) return undefined
  if (!raw) {
    console.error("usage: --hosts claude,codex,grok")
    process.exit(2)
  }
  const wanted = raw.split(",").map((s) => s.trim()).filter(Boolean) as Host[]
  for (const host of wanted) {
    if (!HOSTS.includes(host)) {
      console.error(`unknown host ${host} (want ${HOSTS.join(", ")})`)
      process.exit(2)
    }
  }
  return wanted
}

function copyFixture(src: string, dest: string) {
  fs.cpSync(src, dest, { recursive: true })
}

function snapshotWorkspace(hostDir: string, workspace: string, seedSha: string) {
  const git = (args: string[]) =>
    spawnSync("git", args, { cwd: workspace, encoding: "utf8" })
  const status = git(["status", "--porcelain"])
  const log = git(["log", "--oneline", "-5"])
  fs.writeFileSync(
    path.join(hostDir, "git-status.txt"),
    status.status === 0 ? status.stdout : `(not a git repo)\n${status.stderr}`,
  )
  fs.writeFileSync(
    path.join(hostDir, "git-log.txt"),
    log.status === 0 ? log.stdout : `(no git log)\n${log.stderr}`,
  )
  const list = spawnSync("find", [".", "-path", "./.git", "-prune", "-o", "-type", "f", "-print"], {
    cwd: workspace,
    encoding: "utf8",
  })
  fs.writeFileSync(path.join(hostDir, "files.txt"), list.stdout)
  // What the run itself committed, across however many commits it made -- not what
  // the seed already tracked, and not merely HEAD's own changeset.
  const headFiles = seedSha
    ? git(["diff", "--name-only", seedSha, "HEAD"])
    : git(["ls-tree", "-r", "--name-only", "HEAD"])
  fs.writeFileSync(
    path.join(hostDir, "git-head-files.txt"),
    headFiles.status === 0 ? headFiles.stdout : "",
  )
}

async function runPlan(
  plan: HostPlan,
  cwd: string,
  timeoutMs: number,
): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const stdin = fs.openSync("/dev/null", "r")
    const child = spawn(plan.argv[0], plan.argv.slice(1), {
      cwd,
      env: plan.env,
      stdio: [stdin, "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (c) => {
      stdout += c.toString()
    })
    child.stderr.on("data", (c) => {
      stderr += c.toString()
    })
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      resolve({ exitCode: null, stdout, stderr, timedOut: true })
    }, timeoutMs)
    child.on("close", (code) => {
      clearTimeout(timer)
      try {
        fs.closeSync(stdin)
      } catch {
        // already closed
      }
      resolve({ exitCode: code, stdout, stderr, timedOut: false })
    })
    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({ exitCode: null, stdout, stderr: `${stderr}\n${String(err)}`, timedOut: false })
    })
  })
}

async function main() {
  const skill = arg("--skill")
  const task = arg("--task")
  const taskFile = arg("--task-file")
  if (!skill) {
    console.error(
      "usage: bun run test:skill-eval-cell -- --skill <name> --task \"...\" [--task-file p] [--ref WORKTREE|<git-ref>] [--hosts claude,codex,grok] [--fixture dir] [--out dir] [--timeout-secs 600] [--read-only] [--git-init] [--shim-git-push] [--shim-gh-pr]\n       default --hosts is the other two harnesses from this session; missing CLIs warn and continue",
    )
    process.exit(2)
  }
  const taskText = taskFile ? fs.readFileSync(taskFile, "utf8") : task
  if (!taskText) {
    console.error("pass --task or --task-file")
    process.exit(2)
  }

  const ref = arg("--ref", WORKTREE_REF) ?? WORKTREE_REF
  const timeoutMs = Number(arg("--timeout-secs", "600")) * 1000
  const readOnly = flag("--read-only")
  const resolution = resolveRunHosts({ explicit: parseHosts() })
  for (const line of resolution.warnings) console.error(line)
  const hosts = resolution.run
  if (hosts.length === 0) {
    console.error(`error: no harness CLIs on PATH (wanted ${resolution.wanted.join(", ")})`)
    process.exit(2)
  }

  const out = arg("--out") ?? mintCellDir()
  fs.mkdirSync(out, { recursive: true })
  const { skillDir } = extractSkill({ skill, ref, dest: path.join(out, "extract") })
  const workspace = path.join(out, "workspace")
  // A reused --out otherwise keeps the previous run's files, commits, and mutations,
  // and --git-init skips reseeding because the old .git is still there.
  fs.rmSync(workspace, { recursive: true, force: true })
  fs.rmSync(path.join(out, "hosts"), { recursive: true, force: true })
  const fixture = arg("--fixture")
  if (fixture) copyFixture(fixture, workspace)
  else fs.mkdirSync(workspace, { recursive: true })
  if (flag("--git-init") && !fs.existsSync(path.join(workspace, ".git"))) {
    spawnSync("git", ["init", "-b", "main"], { cwd: workspace })
    spawnSync("git", ["config", "user.name", "CE skill-eval-cell"], { cwd: workspace })
    spawnSync("git", ["config", "user.email", "skill-eval-cell@example.test"], { cwd: workspace })
    const untracked = (arg("--git-untracked") ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
    spawnSync("git", ["add", "."], { cwd: workspace })
    for (const rel of untracked) {
      spawnSync("git", ["rm", "-f", "--cached", "--ignore-unmatch", "--", rel], { cwd: workspace })
    }
    spawnSync("git", ["commit", "-m", "seed", "--allow-empty"], { cwd: workspace })
  }
  const seedRev = spawnSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" })
  const seedSha = seedRev.status === 0 ? seedRev.stdout.trim() : ""

  const summary: Record<string, unknown> = {
    skill,
    ref,
    out,
    skillDir,
    workspace,
    current_harness: resolution.current,
    hosts_wanted: resolution.wanted,
    hosts_run: hosts,
    hosts_skipped: resolution.skipped,
    own_eval_only: resolution.ownEvalOnly,
    warnings: resolution.warnings,
    read_only: readOnly,
    seed_sha: seedSha,
    cells: {},
  }

  for (const host of hosts) {
    const hostDir = path.join(out, "hosts", host)
    const hostWorkspace = path.join(hostDir, "workspace")
    fs.mkdirSync(hostDir, { recursive: true })
    copyFixture(workspace, hostWorkspace)
    const hostPrompt = wrapPrompt({ skillDir, workspace: hostWorkspace, task: taskText })
    const promptFile = path.join(hostDir, "prompt.md")
    fs.writeFileSync(promptFile, hostPrompt)
    const plan = planHost(host, {
      cwd: hostWorkspace,
      prompt: hostPrompt,
      promptFile,
      readOnly,
    })
    const shims: PathShim[] = []
    if (flag("--shim-git-push")) {
      shims.push({ bin: "git", subcommand: "push", exitCode: 1, stderr: "fatal: no configured remote" })
    }
    if (flag("--shim-gh-pr")) {
      shims.push({
        bin: "gh",
        subcommand: "pr",
        exitCode: 1,
        stderr: "error: GitHub API failed (simulated unknown PR state)",
      })
    }
    if (shims.length > 0) Object.assign(plan.env, installPathShims(hostDir, shims))
    fs.writeFileSync(path.join(hostDir, "argv.json"), `${JSON.stringify(plan.argv, null, 2)}\n`)
    fs.writeFileSync(path.join(hostDir, "notes.txt"), `${plan.notes.join("\n")}\n`)
    const result = await runPlan(plan, hostWorkspace, timeoutMs)
    fs.writeFileSync(path.join(hostDir, "stdout.txt"), result.stdout)
    fs.writeFileSync(path.join(hostDir, "stderr.txt"), result.stderr)
    fs.writeFileSync(
      path.join(hostDir, "exit.json"),
      `${JSON.stringify({ exitCode: result.exitCode, timedOut: result.timedOut }, null, 2)}\n`,
    )
    snapshotWorkspace(hostDir, hostWorkspace, seedSha)
    ;(summary.cells as Record<string, unknown>)[host] = {
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stdout_bytes: Buffer.byteLength(result.stdout),
      stderr_bytes: Buffer.byteLength(result.stderr),
    }
  }

  const summaryPath = path.join(out, "summary.json")
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)
  console.log(summaryPath)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
