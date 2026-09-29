// `bun run test` entry point: one parallel pass, then one serial re-run of the
// files that failed, in a fresh bun process.
//
// Why: bun has an open defect where a test worker loses a child process's exit
// or pipe notification (oven-sh/bun#34069, #41024). The lost event is per
// spawn, not a dead worker: later tests in the same file can still pass. The
// first-pass tell is TimeoutError-only failures, often mixed with passes, at
// exactly the per-test timeout. The same files pass in a fresh process. Any
// assertion failure or error anywhere keeps the first result with no re-run,
// so a defect that only shows under parallel load is not retried away.
import { type ChildProcess, spawn, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { constants, tmpdir } from "node:os"
import path from "node:path"

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/

export type JunitCase = { file: string; failure: string | null }

/** Every testcase in a bun junit report, in report order, with its failure type if any. */
export function junitCases(xml: string): JunitCase[] {
  const out: JunitCase[] = []
  const suites: string[] = []
  let current: JunitCase | null = null
  for (const tag of xml.matchAll(/<(\/?)(testsuite|testcase|failure|error)\b([^>]*?)(\/?)>/g)) {
    const [, closing, name, attrs, selfClosing] = tag
    const attr = (key: string) => attrs.match(new RegExp(`\\b${key}="([^"]*)"`))?.[1]
    if (name === "testsuite") {
      if (closing) suites.pop()
      else if (!selfClosing) suites.push(attr("file") ?? attr("name") ?? "")
    } else if (name === "testcase") {
      if (closing) current = null
      else {
        const file = attr("file") ?? suites.findLast((s) => TEST_FILE.test(s)) ?? ""
        if (TEST_FILE.test(file)) out.push((current = { file, failure: null }))
        if (selfClosing) current = null
      }
    } else if (!closing && current && !current.failure) {
      current.failure = attr("type") ?? name
    }
  }
  return out
}

/**
 * Files to re-run after a first pass whose failures are all TimeoutError.
 * A later passing test does not disqualify the file: the bun defect drops
 * individual child-exit notifications, so the same worker can pass the next
 * spawn. A non-timeout failure anywhere, including in another file, means
 * the first result stands and nothing is re-run.
 */
export function rerunCandidates(cases: JunitCase[]): string[] {
  const byFile = new Map<string, JunitCase[]>()
  for (const c of cases) byFile.set(c.file, [...(byFile.get(c.file) ?? []), c])
  const failed = [...byFile].filter(([, cs]) => cs.some((c) => c.failure))
  const timeoutOnly = failed.every(([, cs]) => cs.filter((c) => c.failure).every((c) => c.failure === "TimeoutError"))
  return failed.length > 0 && timeoutOnly ? failed.map(([file]) => file).sort() : []
}

/** Caller argv minus test-file paths and reporter/parallel flags this wrapper owns. */
export function passthroughArgs(argv: string[]): string[] {
  const skipValue = new Set(["--reporter", "--reporter-outfile"])
  const out: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--parallel" || arg.startsWith("--reporter-outfile=") || arg === "--reporter=junit") continue
    if (skipValue.has(arg)) {
      if (argv[i + 1] && !argv[i + 1].startsWith("-")) i++
      continue
    }
    if (TEST_FILE.test(arg)) continue
    out.push(arg)
  }
  return out
}

const DEFAULT_PASS_TIMEOUT_MS = 20 * 60_000
const DEFAULT_LOST_EXIT_MS = 60_000

function positiveSecondsMs(value: string | undefined, fallback: number): number {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : fallback
}

/**
 * First-pass wall-clock limit: CE_TEST_PASS_TIMEOUT_SECONDS when it is a positive
 * number, else 20 minutes. None for --watch or --hot, which stay alive on purpose.
 */
export function passTimeoutMs(env: Record<string, string | undefined>, argv: string[] = []): number | null {
  if (argv.includes("--watch") || argv.includes("--hot")) return null
  return positiveSecondsMs(env.CE_TEST_PASS_TIMEOUT_SECONDS, DEFAULT_PASS_TIMEOUT_MS)
}

/** How long a bun test process may leave a child unreaped: CE_TEST_LOST_EXIT_SECONDS, else 60 seconds. */
export function lostExitMs(env: Record<string, string | undefined>): number {
  return positiveSecondsMs(env.CE_TEST_LOST_EXIT_SECONDS, DEFAULT_LOST_EXIT_MS)
}

export type PsRow = { pid: number; ppid: number; pgid: number; stat: string; args: string; line: string }

/** Rows of `ps -eo pid,ppid,pgid,stat,etime,args`, header excluded. */
export function parsePs(stdout: string): PsRow[] {
  return stdout.trim().split("\n").slice(1).flatMap((line) => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+\S+\s+(.*)$/)
    return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]), stat: m[4], args: m[5], line }] : []
  })
}

/**
 * Zombie children of a bun test process: the child exited and bun never took
 * its exit (oven-sh/bun#34069). A wedged worker is blocked in that spawn and
 * no timeout frees it.
 */
export function lostExitZombies(rows: PsRow[]): PsRow[] {
  const bunTest = new Set(rows.filter((r) => /(^|\/)bun\s+test\b/.test(r.args)).map((r) => r.pid))
  return rows.filter((r) => r.stat.startsWith("Z") && bunTest.has(r.ppid))
}

function run(args: string[]): number {
  const result = spawnSync(process.execPath, ["test", ...args], { stdio: "inherit" })
  if (result.error) throw result.error
  return result.status ?? 1
}

type PassResult = { status: number; stalled: boolean; lostExit: boolean; interrupted: boolean }

/** Every live process that belongs to the pass: its descendants plus anything left in its process group. */
function passProcesses(root: number): PsRow[] {
  const listing = spawnSync("ps", ["-eo", "pid,ppid,pgid,stat,etime,args"], { encoding: "utf8" })
  if (listing.status !== 0) return []
  const rows = parsePs(listing.stdout)
  const members = new Set([root])
  for (let grew = true; grew; ) {
    grew = false
    for (const row of rows) {
      if (!members.has(row.pid) && (members.has(row.ppid) || row.pgid === root)) {
        members.add(row.pid)
        grew = true
      }
    }
  }
  return rows.filter((row) => members.has(row.pid))
}

function killPass(child: ChildProcess, signal: NodeJS.Signals, extra: number[] = []): void {
  const pid = child.pid
  if (pid === undefined) return
  try {
    if (process.platform === "win32") child.kill(signal)
    else process.kill(-pid, signal)
  } catch {
    // The group may already be gone.
  }
  for (const other of extra) {
    try {
      process.kill(other, signal)
    } catch {
      // Already exited.
    }
  }
}

/**
 * One test pass, bounded by wall-clock time and by the lost-exit check. A
 * wedged bun worker (#1784) never exits, so without a limit GitHub cancels the
 * job and nothing is reported. The pass runs in its own process group so a
 * stall or an interrupt can take down every process it started.
 */
function runPass(args: string[], limitMs: number | null, lostMs: number): Promise<PassResult> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess | undefined
    let stalled = false
    let lostExit = false
    let interrupted: NodeJS.Signals | null = null
    // Registered before the spawn: an interrupt that lands before the pass exists is
    // held and forwarded once it does, so the detached pass cannot outlive the runner.
    const forward = (signal: NodeJS.Signals) => {
      interrupted = signal
      if (child) killPass(child, signal)
    }
    // The detached pass receives none of the signals a terminal sends the runner.
    const forwarded: NodeJS.Signals[] = process.platform === "win32" ? ["SIGINT", "SIGTERM"] : ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"]
    const handlers = forwarded.map((signal) => [signal, () => forward(signal)] as const)
    for (const [signal, handler] of handlers) process.on(signal, handler)
    child = spawn(process.execPath, ["test", ...args], { stdio: "inherit", detached: process.platform !== "win32" })
    if (interrupted) killPass(child, interrupted)
    const stop = (reason: string) => {
      const members = child.pid === undefined ? [] : passProcesses(child.pid)
      console.error(
        `\n${reason} Its processes, before they were killed:` +
          `\n  PID  PPID  PGID STAT ELAPSED ARGS\n  ${members.map((m) => m.line).join("\n  ")}\n`,
      )
      killPass(child, "SIGKILL", members.map((m) => m.pid))
    }
    const timer = limitMs === null ? undefined : setTimeout(() => {
      stalled = true
      stop(`The test pass stalled: it was still running after ${Math.round(limitMs / 1000)}s (CE_TEST_PASS_TIMEOUT_SECONDS overrides the limit).`)
    }, limitMs)
    const firstSeen = new Map<number, number>()
    const poller = setInterval(() => {
      if (child.pid === undefined || stalled || lostExit) return
      const now = Date.now()
      const zombies = lostExitZombies(passProcesses(child.pid))
      for (const pid of firstSeen.keys()) if (!zombies.some((z) => z.pid === pid)) firstSeen.delete(pid)
      for (const z of zombies) if (!firstSeen.has(z.pid)) firstSeen.set(z.pid, now)
      if ([...firstSeen.values()].some((seen) => now - seen >= lostMs)) {
        lostExit = true
        stop(
          `A bun test process left an exited child unreaped for ${Math.round(lostMs / 1000)}s: a lost child-exit` +
            ` (oven-sh/bun#34069) that wedges its worker (CE_TEST_LOST_EXIT_SECONDS overrides the limit).`,
        )
      }
    }, Math.min(15_000, lostMs / 4))
    const clearTimers = () => {
      clearTimeout(timer)
      clearInterval(poller)
      for (const [signal, handler] of handlers) process.off(signal, handler)
    }
    child.on("error", (error) => {
      clearTimers()
      reject(error)
    })
    child.on("exit", (code, signal) => {
      clearTimers()
      // Anything still in the group outlived the pass; do not leave it running.
      killPass(child, "SIGKILL")
      // A signal death keeps its conventional status (130 for SIGINT), so Ctrl-C is not a test failure.
      const signalled = signal ?? interrupted
      const status = stalled || lostExit ? 1 : code ?? (signalled ? 128 + (constants.signals[signalled] ?? 0) : 0)
      resolve({ status, stalled, lostExit, interrupted: interrupted !== null })
    })
  })
}

async function main(argv: string[]): Promise<number> {
  const reportDir = mkdtempSync(path.join(tmpdir(), "bun-test-report-"))
  const report = path.join(reportDir, "junit.xml")
  try {
    const passArgs = ["--parallel", "--reporter=junit", `--reporter-outfile=${report}`, ...argv]
    const limitMs = passTimeoutMs(process.env, argv)
    const lostMs = lostExitMs(process.env)
    let pass = await runPass(passArgs, limitMs, lostMs)
    // A killed pass writes no junit report, so the whole pass is repeated, once, in a fresh process.
    if (pass.lostExit) {
      console.error("Re-running the whole first pass once in a fresh process.\n")
      pass = await runPass(passArgs, limitMs, lostMs)
    }
    // A stall is never re-run into a green result: without a lost-exit zombie its cause is unknown.
    if (pass.stalled || pass.lostExit) return 1
    if (pass.interrupted) return pass.status
    const first = pass.status
    if (first === 0) return 0

    const failed = existsSync(report) ? rerunCandidates(junitCases(readFileSync(report, "utf8"))) : []
    if (failed.length === 0) return first

    console.error(
      `\nEvery first-pass failure was a TimeoutError, the bun lost-child-exit shape.` +
        ` Re-running ${failed.length} file(s) serially in a fresh process (oven-sh/bun#34069):` +
        `\n  ${failed.join("\n  ")}\n`,
    )
    const second = run([...passthroughArgs(argv), ...failed])
    if (second === 0) {
      console.error(
        "\nEvery re-run file passed in a fresh process, so the first-pass failures were" +
          " process-local (a lost child-exit notification), not a defect the tests reproduce.",
      )
    }
    return second
  } finally {
    rmSync(reportDir, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2))
}
