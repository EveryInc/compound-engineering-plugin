// `bun run test` entry point: one parallel pass, then one serial re-run of the
// files that failed, in a fresh bun process.
//
// Why: bun has an open defect where a test worker loses a child process's exit
// or pipe notification (oven-sh/bun#34069, #41024). Once a worker is wedged,
// every later spawnSync in it hangs until the per-test timeout, so one lost
// event turns the rest of that file red at exactly the timeout. The wedge is
// process-local: the same file passes in a fresh process. A real failure fails
// in both passes, so this cannot hide one; it only stops the wedge from
// failing CI.
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/

/** Test files that recorded at least one failure or error in a bun junit report. */
export function failedFilesFromJunit(xml: string): string[] {
  const files = new Set<string>()
  for (const tag of xml.matchAll(/<testsuite\b[^>]*>/g)) {
    const attrs = tag[0]
    const file = attrs.match(/\bfile="([^"]*)"/)?.[1]
    if (!file || !TEST_FILE.test(file)) continue
    const failures = Number(attrs.match(/\bfailures="(\d+)"/)?.[1] ?? "0")
    const errors = Number(attrs.match(/\berrors="(\d+)"/)?.[1] ?? "0")
    if (failures > 0 || errors > 0) files.add(file)
  }
  return [...files].sort()
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

    const failed = existsSync(report) ? failedFilesFromJunit(readFileSync(report, "utf8")) : []
    if (failed.length === 0) return first

    console.error(
      `\nRe-running ${failed.length} failed test file(s) serially in a fresh process, in case a` +
        ` parallel worker lost a subprocess event (oven-sh/bun#34069):\n  ${failed.join("\n  ")}\n`,
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
