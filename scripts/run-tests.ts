// `bun run test` entry point: one parallel pass, then one serial re-run of the
// files that failed, in a fresh bun process.
//
// Why: bun has an open defect where a test worker loses a child process's exit
// or pipe notification (oven-sh/bun#34069, #41024). Once a worker is wedged,
// every later spawnSync in it hangs until the per-test timeout, so one lost
// event turns the rest of that file red at exactly the timeout. The wedge is
// process-local: the same file passes in a fresh process. The re-run happens
// only when every failed file shows the wedge shape, timeouts from its first
// failure to its end; any other failure, or a test that passed after a
// timeout, keeps the first result, so a defect that only shows under parallel
// load is not retried away.
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
 * Files that show the wedged-worker shape and nothing else: from the first
 * failure in the file onward, every test timed out. A worker that lost a
 * subprocess event cannot complete any later spawn, so the file's tail is
 * all timeouts. A file with a passing test after a timeout, or any failure
 * that is not a timeout, is failing for a reason the tests reproduce, so
 * nothing is re-run and the first result stands.
 */
export function rerunCandidates(cases: JunitCase[]): string[] {
  const byFile = new Map<string, JunitCase[]>()
  for (const c of cases) byFile.set(c.file, [...(byFile.get(c.file) ?? []), c])
  const failed = [...byFile].filter(([, cs]) => cs.some((c) => c.failure))
  const wedged = failed.every(([, cs]) => cs.slice(cs.findIndex((c) => c.failure)).every((c) => c.failure === "TimeoutError"))
  return failed.length > 0 && wedged ? failed.map(([file]) => file).sort() : []
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
      `\nEvery failed file timed out from its first failure to its end, the wedged-worker shape.` +
        ` Re-running ${failed.length} file(s) serially in a fresh process (oven-sh/bun#34069):` +
        `\n  ${failed.join("\n  ")}\n`,
    )
    const second = run(failed)
    if (second === 0) {
      console.error(
        "\nEvery re-run file passed in a fresh process, so the first-pass failures were" +
          " process-local (a wedged worker), not a defect the tests reproduce.",
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
