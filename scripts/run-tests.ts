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
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
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

function run(args: string[]): number {
  const result = spawnSync(process.execPath, ["test", ...args], { stdio: "inherit" })
  if (result.error) throw result.error
  return result.status ?? 1
}

function main(argv: string[]): number {
  const reportDir = mkdtempSync(path.join(tmpdir(), "bun-test-report-"))
  const report = path.join(reportDir, "junit.xml")
  try {
    const first = run(["--parallel", "--reporter=junit", `--reporter-outfile=${report}`, ...argv])
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
  process.exitCode = main(process.argv.slice(2))
}
