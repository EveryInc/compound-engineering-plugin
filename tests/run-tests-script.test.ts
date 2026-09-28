import { afterAll, describe, expect, test } from "bun:test"
import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { junitCases, passTimeoutMs, passthroughArgs, rerunCandidates } from "../scripts/run-tests"
import { alive } from "./helpers/process"

const junit = (suites: string) => `<?xml version="1.0"?>\n<testsuites name="bun test">\n${suites}\n</testsuites>`
const ok = (file: string, n: number) => `<testcase name="t${n}" classname="g" time="0" file="${file}" line="${n}" />`
const fail = (file: string, n: number, type: string) =>
  `<testcase name="t${n}" classname="g" time="30" file="${file}" line="${n}"><failure type="${type}" /></testcase>`
const suite = (file: string, body: string) => `<testsuite name="${file}" file="${file}"><testsuite name="g" file="${file}">${body}</testsuite></testsuite>`

describe("run-tests: choosing files to re-run from a bun junit report", () => {
  test("reads cases in order, taking the file from the case or its enclosing suite", () => {
    const xml = junit(`
  ${suite("tests/b.test.ts", ok("tests/b.test.ts", 1) + fail("tests/b.test.ts", 2, "TimeoutError"))}
  <testsuite name="tests/a.test.ts">
    <testcase name="bun 1.2 shape: no file attr on the case" classname="" time="30" line="2"><failure type="TimeoutError" /></testcase>
  </testsuite>`)
    expect(junitCases(xml)).toEqual([
      { file: "tests/b.test.ts", failure: null },
      { file: "tests/b.test.ts", failure: "TimeoutError" },
      { file: "tests/a.test.ts", failure: "TimeoutError" },
    ])
    expect(rerunCandidates(junitCases(xml))).toEqual(["tests/a.test.ts", "tests/b.test.ts"])
  })

  test("re-runs when every failed file's failures are TimeoutError, including passes after a timeout", () => {
    const wedged = suite("tests/w.test.ts", ok("tests/w.test.ts", 1) + fail("tests/w.test.ts", 2, "TimeoutError") + fail("tests/w.test.ts", 3, "TimeoutError"))
    expect(rerunCandidates(junitCases(junit(wedged)))).toEqual(["tests/w.test.ts"])
    // PR 1680 CI: the same worker passed later tests after a 30s spawn hang.
    const recovered = suite("tests/r.test.ts", fail("tests/r.test.ts", 1, "TimeoutError") + ok("tests/r.test.ts", 2))
    expect(rerunCandidates(junitCases(junit(recovered)))).toEqual(["tests/r.test.ts"])
    const interspersed = suite(
      "tests/i.test.ts",
      fail("tests/i.test.ts", 1, "TimeoutError") + ok("tests/i.test.ts", 2) + fail("tests/i.test.ts", 3, "TimeoutError"),
    )
    expect(rerunCandidates(junitCases(junit(interspersed + recovered)))).toEqual(["tests/i.test.ts", "tests/r.test.ts"])
    // A non-timeout failure anywhere, even in another file, keeps the first result.
    const assertion = suite("tests/d.test.ts", fail("tests/d.test.ts", 1, "AssertionError"))
    expect(rerunCandidates(junitCases(junit(wedged + assertion)))).toEqual([])
    const late = suite("tests/l.test.ts", fail("tests/l.test.ts", 1, "TimeoutError") + fail("tests/l.test.ts", 2, "AssertionError"))
    expect(rerunCandidates(junitCases(junit(late)))).toEqual([])
  })

  test("parses bun 1.4 junit, where a timed-out assertion is still TimeoutError", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="3" assertions="2" failures="2" skipped="0" time="0.14">
  <testsuite name="timeout.test.ts" file="timeout.test.ts" tests="3" assertions="2" failures="2" skipped="0" time="0.09" hostname="ci">
    <testcase name="slow assertion then hang" classname="" time="0.03" file="timeout.test.ts" line="3" assertions="1">
      <failure type="AssertionError" message="expect(received).toBe(expected)">AssertionError</failure>
    </testcase>
    <testcase name="pure timeout" classname="" time="0.05" file="timeout.test.ts" line="7" assertions="0">
      <failure type="TimeoutError" message="test timed out" />
    </testcase>
    <testcase name="after timeout still runs" classname="" time="0.0001" file="timeout.test.ts" line="11" assertions="1" />
  </testsuite>
</testsuites>`
    expect(junitCases(xml)).toEqual([
      { file: "timeout.test.ts", failure: "AssertionError" },
      { file: "timeout.test.ts", failure: "TimeoutError" },
      { file: "timeout.test.ts", failure: null },
    ])
    expect(rerunCandidates(junitCases(xml))).toEqual([])

    const timeoutThenPass = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="2" assertions="1" failures="1" skipped="0" time="0.05">
  <testsuite name="tests/routes.test.ts" file="tests/routes.test.ts" tests="2" assertions="1" failures="1" skipped="0" time="0.05" hostname="ci">
    <testcase name="Cursor default omits a model request" classname="" time="30.029" file="tests/routes.test.ts" line="1557" assertions="0">
      <failure type="TimeoutError" message="test timed out" />
    </testcase>
    <testcase name="receiptless Composer through Cursor" classname="" time="0.209" file="tests/routes.test.ts" line="1571" assertions="1" />
  </testsuite>
</testsuites>`
    expect(rerunCandidates(junitCases(timeoutThenPass))).toEqual(["tests/routes.test.ts"])
  })

  test("re-runs a thrown TimeoutError from a lost child-exit, but not an empty-word assertion", () => {
    const lost = suite(
      "tests/skills/ce-work-unit-workspace-fallback.test.ts",
      fail("tests/skills/ce-work-unit-workspace-fallback.test.ts", 67, "TimeoutError") +
        ok("tests/skills/ce-work-unit-workspace-fallback.test.ts", 71),
    )
    expect(rerunCandidates(junitCases(junit(lost)))).toEqual([
      "tests/skills/ce-work-unit-workspace-fallback.test.ts",
    ])
    const emptyWord = suite(
      "tests/skills/ce-work-unit-workspace-fallback.test.ts",
      fail("tests/skills/ce-work-unit-workspace-fallback.test.ts", 67, "AssertionError"),
    )
    expect(rerunCandidates(junitCases(junit(emptyWord)))).toEqual([])
  })


  test("re-runs nothing for a clean, errored-only, or empty report", () => {
    expect(rerunCandidates(junitCases(junit(suite("tests/c.test.ts", ok("tests/c.test.ts", 1)))))).toEqual([])
    const errored = junit(`<testsuite name="tests/e.test.ts" file="tests/e.test.ts"><testcase name="boom" file="tests/e.test.ts" line="1"><error message="import failed" /></testcase></testsuite>`)
    expect(junitCases(errored)).toEqual([{ file: "tests/e.test.ts", failure: "error" }])
    expect(rerunCandidates(junitCases(errored))).toEqual([])
    expect(rerunCandidates(junitCases(""))).toEqual([])
  })

  test("passes caller options through and drops wrapper-owned reporter flags", () => {
    expect(passthroughArgs(["--timeout=100", "tests/a.test.ts", "--bail"])).toEqual(["--timeout=100", "--bail"])
    expect(passthroughArgs(["--reporter", "junit", "--reporter-outfile", "/tmp/out.xml", "--timeout=5"])).toEqual(["--timeout=5"])
    expect(passthroughArgs(["--parallel", "--reporter=junit", "--reporter-outfile=/tmp/out.xml", "-t", "foo"])).toEqual(["-t", "foo"])
  })
})

const RUNNER = path.join(__dirname, "../scripts/run-tests.ts")
const fixtureRoots: string[] = []
afterAll(() => fixtureRoots.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

function fixture(body: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "run-tests-watchdog-"))
  fixtureRoots.push(dir)
  writeFileSync(path.join(dir, "fixture.test.ts"), body)
  return dir
}

function readPid(file: string): number {
  return Number(readFileSync(file, "utf8").trim())
}

// The worker records its own pid, leaves an orphan in its process group (the
// shape the stalled ce-work harness runs were suspected of), then never finishes.
const HANG = `
import { test } from "bun:test"
import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
test("never finishes", async () => {
  writeFileSync("worker.pid", String(process.pid))
  spawnSync("sh", ["-c", "sleep 300 >/dev/null 2>&1 & echo $! > orphan.pid"])
  writeFileSync("started", "")
  await new Promise(() => {})
}, 600_000)
`

describe("run-tests: stall watchdog", () => {
  test("a pass that outlives its limit fails with a process listing and leaves nothing running", () => {
    const dir = fixture(HANG)
    const started = Date.now()
    const r = spawnSync(process.execPath, [RUNNER, "./fixture.test.ts"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, CE_TEST_PASS_TIMEOUT_SECONDS: "3" },
      timeout: 60_000,
      killSignal: "SIGKILL",
    })
    const worker = readPid(path.join(dir, "worker.pid"))
    const orphan = readPid(path.join(dir, "orphan.pid"))
    try {
      expect(r.signal).toBeNull()
      expect(r.status).not.toBe(0)
      expect(Date.now() - started).toBeLessThan(30_000)
      expect(r.stderr).toContain("stalled")
      expect(r.stderr).toContain("sleep 300")
      expect(alive(worker)).toBe(false)
      expect(alive(orphan)).toBe(false)
    } finally {
      for (const pid of [worker, orphan]) if (alive(pid)) process.kill(pid, "SIGKILL")
    }
  }, 90_000)

  test("a pass that finishes within its limit keeps its normal result", () => {
    const dir = fixture(`import { test, expect } from "bun:test"\ntest("ok", () => expect(1).toBe(1))\n`)
    const r = spawnSync(process.execPath, [RUNNER, "./fixture.test.ts"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, CE_TEST_PASS_TIMEOUT_SECONDS: "60" },
      timeout: 60_000,
    })
    expect(r.status).toBe(0)
    expect(r.stderr).not.toContain("stalled")
  }, 90_000)

  test("a passing run leaves nothing from its pass running", () => {
    const dir = fixture(`import { test } from "bun:test"
import { spawnSync } from "node:child_process"
test("leaves an orphan behind", () => { spawnSync("sh", ["-c", "sleep 300 >/dev/null 2>&1 & echo $! > orphan.pid"]) })
`)
    const r = spawnSync(process.execPath, [RUNNER, "./fixture.test.ts"], { cwd: dir, encoding: "utf8", timeout: 60_000 })
    const orphan = readPid(path.join(dir, "orphan.pid"))
    try {
      expect(r.status).toBe(0)
      expect(alive(orphan)).toBe(false)
    } finally {
      if (alive(orphan)) process.kill(orphan, "SIGKILL")
    }
  }, 90_000)

  // Every signal a terminal or a tool sends the runner; the detached pass gets none of them directly.
  test.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
    ["SIGHUP", 129],
    ["SIGQUIT", 131],
  ] as const)("%s to the runner stops the pass it started", async (signal, status) => {
    const dir = fixture(HANG)
    const runner = spawn(process.execPath, [RUNNER, "./fixture.test.ts"], {
      cwd: dir,
      env: { ...process.env, CE_TEST_PASS_TIMEOUT_SECONDS: "120" },
      stdio: "ignore",
    })
    const exited = new Promise<number | null>((resolve) => runner.on("exit", (code) => resolve(code)))
    const deadline = Date.now() + 30_000
    while (!existsSync(path.join(dir, "started")) && Date.now() < deadline) await Bun.sleep(100)
    const worker = readPid(path.join(dir, "worker.pid"))
    const orphan = readPid(path.join(dir, "orphan.pid"))
    try {
      runner.kill(signal)
      // The signal's conventional status, so an interrupt is not mistaken for a test failure.
      expect(await exited).toBe(status)
      const settle = Date.now() + 5_000
      while (alive(worker) && Date.now() < settle) await Bun.sleep(100)
      expect(alive(worker)).toBe(false)
      expect(alive(orphan)).toBe(false)
    } finally {
      for (const pid of [worker, orphan]) if (alive(pid)) process.kill(pid, "SIGKILL")
      if (runner.exitCode === null) runner.kill("SIGKILL")
    }
  }, 90_000)

  test("reads the limit override in seconds and ignores unusable values", () => {
    expect(passTimeoutMs({ CE_TEST_PASS_TIMEOUT_SECONDS: "90" })).toBe(90_000)
    expect(passTimeoutMs({})).toBe(20 * 60_000)
    for (const bad of ["", "abc", "0", "-5"]) {
      expect(passTimeoutMs({ CE_TEST_PASS_TIMEOUT_SECONDS: bad })).toBe(20 * 60_000)
    }
    // Watch and hot modes stay alive on purpose; a limit would kill a healthy session.
    for (const flag of ["--watch", "--hot"]) {
      expect(passTimeoutMs({ CE_TEST_PASS_TIMEOUT_SECONDS: "5" }, ["tests/a.test.ts", flag])).toBeNull()
    }
  })
})
