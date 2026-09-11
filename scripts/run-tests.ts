// `bun run test` entry point: one parallel pass, then one serial re-run of the
// files that failed, in a fresh bun process.
//
// Why: bun has an open defect where a test worker loses a child process's exit
// or pipe notification (oven-sh/bun#34069, #41024). Once a worker is wedged,
// every later spawnSync in it hangs until the per-test timeout, so one lost
// event turns the rest of that file red at exactly the timeout. The wedge is
// process-local: the same file passes in a fresh process. The re-run happens
// only when every first-pass failure is a timeout, the one shape the wedge
// produces; an assertion failure or error anywhere keeps the first result, so
// a defect that only shows under parallel load is not retried away.
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/

export type JunitFailure = { file: string; type: string }

/** Every failed or errored testcase in a bun junit report, with the file it ran in. */
export function junitFailures(xml: string): JunitFailure[] {
  const out: JunitFailure[] = []
  const suites: string[] = []
  let currentCase: string | null = null
  for (const tag of xml.matchAll(/<(\/?)(testsuite|testcase|failure|error)\b([^>]*?)(\/?)>/g)) {
    const [, closing, name, attrs, selfClosing] = tag
    const attr = (key: string) => attrs.match(new RegExp(`\\b${key}="([^"]*)"`))?.[1]
    if (name === "testsuite") {
      if (closing) suites.pop()
      else if (!selfClosing) suites.push(attr("file") ?? attr("name") ?? "")
      continue
    }
    if (name === "testcase") {
      currentCase = closing || selfClosing ? null : (attr("file") ?? suites.findLast((s) => TEST_FILE.test(s)) ?? "")
      continue
    }
    if (!closing && currentCase && TEST_FILE.test(currentCase)) out.push({ file: currentCase, type: attr("type") ?? name })
  }
  return out
}

/**
 * Files whose every failure is a per-test timeout, the only shape a wedged
 * worker produces. Any other failure type in the report means a defect the
 * tests reproduce, so nothing is re-run and the first result stands.
 */
export function rerunCandidates(failures: JunitFailure[]): string[] {
  if (failures.length === 0 || failures.some((f) => f.type !== "TimeoutError")) return []
  return [...new Set(failures.map((f) => f.file))].sort()
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

    const failed = existsSync(report) ? rerunCandidates(junitFailures(readFileSync(report, "utf8"))) : []
    if (failed.length === 0) return first

    console.error(
      `\nEvery first-pass failure was a per-test timeout. Re-running ${failed.length} file(s) serially` +
        ` in a fresh process, in case a parallel worker lost a subprocess event (oven-sh/bun#34069):` +
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
