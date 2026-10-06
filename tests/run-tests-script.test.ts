import { afterAll, describe, expect, test } from "bun:test"
import { spawn, spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { junitCases, lostExitMs, lostExitZombies, parsePs, passTimeoutMs, passthroughArgs, rerunCandidates } from "../scripts/run-tests"
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
    expect(junitCases(xml)).toMatchObject([
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
      { file: "timeout.test.ts", failure: "AssertionError", describe: [], name: "slow assertion then hang", message: "expect(received).toBe(expected)" },
      { file: "timeout.test.ts", failure: "TimeoutError", describe: [], name: "pure timeout", message: "test timed out" },
      { file: "timeout.test.ts", failure: null, describe: [], name: "after timeout still runs", message: "" },
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
    expect(junitCases(errored)).toEqual([{ file: "tests/e.test.ts", failure: "error", describe: [], name: "boom", message: "import failed" }])
    expect(rerunCandidates(junitCases(errored))).toEqual([])
    expect(rerunCandidates(junitCases(""))).toEqual([])
  })

  test("keeps each case's describe path, name, and decoded message (bun 1.4.2 output)", () => {
    // Verbatim bun output: nested describes are nested suites, classname lists them innermost first.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="3" assertions="1" failures="2" skipped="0" time="0.00934">
  <testsuite name="a.test.ts" file="a.test.ts" tests="3" assertions="1" failures="2" skipped="0" time="0.005708" hostname="ci">
    <testsuite name="outer &lt;x&gt;" file="a.test.ts" line="2" tests="2" assertions="1" failures="1" skipped="0" time="0" hostname="ci">
      <testsuite name="inner &amp; co" file="a.test.ts" line="2" tests="2" assertions="1" failures="1" skipped="0" time="0.002" hostname="ci">
        <testcase name="fails &quot;quoted&quot;" classname="inner &amp; co &gt; outer &lt;x&gt;" time="0.002903" file="a.test.ts" line="3" assertions="1">
          <failure type="AssertionError" message="expect(received).toEqual(expected)&#10;&#10;  {&#10;-   &quot;a&quot;: &quot;c&quot;,&#10;+   &quot;a&quot;: &quot;&lt;b&gt;&quot;,&#10;  }&#10;">AssertionError: expect(received).toEqual(expected)&#10;      at a.test.ts:3:55&#10;</failure>
        </testcase>
        <testcase name="passes" classname="inner &amp; co &gt; outer &lt;x&gt;" time="0.000008" file="a.test.ts" line="4" assertions="0" />
      </testsuite>
    </testsuite>
    <testcase name="top level" classname="" time="0.000039" file="a.test.ts" line="6" assertions="0">
      <failure type="Error" message="line1&#10;line2 &amp; &lt;tag&gt; &#x41;&apos;">Error: line1&#10;      at a.test.ts:6:65&#10;</failure>
    </testcase>
  </testsuite>
</testsuites>`
    expect(junitCases(xml)).toEqual([
      {
        file: "a.test.ts",
        failure: "AssertionError",
        describe: ["outer <x>", "inner & co"],
        name: 'fails "quoted"',
        message: 'expect(received).toEqual(expected)\n\n  {\n-   "a": "c",\n+   "a": "<b>",\n  }\n',
      },
      { file: "a.test.ts", failure: null, describe: ["outer <x>", "inner & co"], name: "passes", message: "" },
      { file: "a.test.ts", failure: "Error", describe: [], name: "top level", message: "line1\nline2 & <tag> A'" },
    ])
  })

  test("falls back to the failure body when it has no message attribute", () => {
    const xml = junit(suite("tests/f.test.ts", `<testcase name="t1" classname="g" file="tests/f.test.ts"><error type="SyntaxError">Unexpected &amp;&#10;at 1:1</error></testcase>`))
    expect(junitCases(xml)).toEqual([{ file: "tests/f.test.ts", failure: "SyntaxError", describe: ["g"], name: "t1", message: "Unexpected &\nat 1:1" }])
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

const RECAP = "Failing tests ("
const lastLine = (text: string) => text.trimEnd().split("\n").at(-1) ?? ""
/** The recap block, which must be the last thing the runner prints. */
function recapOf(stderr: string): string {
  const at = stderr.lastIndexOf(RECAP)
  expect(at).toBeGreaterThanOrEqual(0)
  return stderr.slice(at)
}

function runRunner(dir: string, args: string[] = ["./fixture.test.ts"], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, CE_TEST_PASS_TIMEOUT_SECONDS: "60", ...env },
    timeout: 60_000,
    killSignal: "SIGKILL",
  })
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
      expect(lastLine(r.stderr)).toContain("killed before a report was written")
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
    expect(r.stderr).not.toContain(RECAP)
    // The runner's own repo has its dependencies, so a bare temp cwd never trips the preflight.
    expect(r.stderr).not.toContain("bun install")
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
    expect(lostExitMs({ CE_TEST_LOST_EXIT_SECONDS: "2" })).toBe(2_000)
    expect(lostExitMs({ CE_TEST_LOST_EXIT_SECONDS: "abc" })).toBe(60_000)

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

// The first attempt leaves an exited child unreaped under a process named like a
// bun test worker: bash backgrounds a short sleep, then execs into a sleep that
// never reaps it. The later attempt passes, unless ALWAYS is set.
const LOST_EXIT = (always: boolean) => `
import { test } from "bun:test"
import { spawn } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
test("loses a child exit on the first attempt", async () => {
  if (${always} || !existsSync("attempted")) {
    writeFileSync("attempted", "")
    spawn("bash", ["-c", "sleep 1 & exec -a 'bun test --test-worker' sleep 300"], { stdio: "ignore" })
    await new Promise(() => {})
  }
}, 600_000)
`

describe.skipIf(process.platform === "win32")("run-tests: lost child-exit", () => {
  const runLostExit = (always: boolean) =>
    spawnSync(process.execPath, [RUNNER, "./fixture.test.ts"], {
      cwd: fixture(LOST_EXIT(always)),
      encoding: "utf8",
      env: { ...process.env, CE_TEST_PASS_TIMEOUT_SECONDS: "60", CE_TEST_LOST_EXIT_SECONDS: "2" },
      timeout: 60_000,
      killSignal: "SIGKILL",
    })

  test("a worker's unreaped child stops the pass and one fresh pass recovers it", () => {
    const r = runLostExit(false)
    expect(r.signal).toBeNull()
    expect(r.stderr).toContain("unreaped")
    expect(r.stderr).toContain("Re-running the whole first pass")
    expect(r.status).toBe(0)
  }, 90_000)

  test("a second lost child-exit fails the run", () => {
    const r = runLostExit(true)
    expect(r.signal).toBeNull()
    expect(r.stderr.match(/unreaped/g)).toHaveLength(2)
    expect(r.status).not.toBe(0)
  }, 90_000)

  test("only a zombie under a bun test process counts", () => {
    const rows = parsePs(`  PID  PPID  PGID STAT ELAPSED ARGS
  100     1   100 Sl      20:00 /home/runner/.bun/bin/bun test --parallel
  101   100   100 Sl      19:59 /home/runner/.bun/bin/bun test --test-worker --isolate
  102   101   100 Z       19:19 [python3] <defunct>
  103   101   100 S       00:01 python3 script.py
  104   103   100 Z       00:30 [git] <defunct>
`)
    expect(lostExitZombies(rows).map((r) => r.pid)).toEqual([102])
  })
})

describe("run-tests: failure recap", () => {
  test("ends with each failing test's path and first message line, entities decoded", () => {
    const dir = fixture(`import { describe, expect, test } from "bun:test"
describe("group <a> & b", () => {
  test("compares \\"x\\"", () => { throw new Error("a & b <c>\\nsecond line") })
  test("passes", () => expect(1).toBe(1))
})
`)
    const r = runRunner(dir)
    expect(r.status).not.toBe(0)
    const recap = recapOf(r.stderr)
    expect(recap).toContain('fixture.test.ts > group <a> & b > compares "x"')
    expect(recap).toContain("a & b <c>")
    expect(recap).toContain("second line")
    expect(recap).not.toContain("passes")
  }, 90_000)

  test("names two failing tests in one file, in order", () => {
    const dir = fixture(`import { expect, test } from "bun:test"
test("first", () => expect(1).toBe(2))
test("ok", () => {})
test("second", () => expect("x").toBe("y"))
`)
    const recap = recapOf(runRunner(dir).stderr)
    expect(recap).toContain("expect(received).toBe(expected)")
    const first = recap.indexOf("fixture.test.ts > first")
    const second = recap.indexOf("fixture.test.ts > second")
    expect(first).toBeGreaterThan(0)
    expect(second).toBeGreaterThan(first)
  }, 90_000)

  test("names every failing test and bounds only the message lines", () => {
    const dir = fixture(`import { test } from "bun:test"
for (let i = 0; i < 25; i++) {
  test("case " + i, () => { throw new Error(Array.from({ length: 12 }, (_, n) => "case " + i + " line " + n).join("\\n")) })
}
`)
    const recap = recapOf(runRunner(dir).stderr)
    for (let i = 0; i < 25; i++) {
      expect(recap).toContain(`fixture.test.ts > case ${i}\n`)
      expect(recap).toContain(`case ${i} line 0`)
      expect(recap).not.toContain(`case ${i} line 11`)
    }
  }, 90_000)

  test("a load error the report omits points at bun's output", () => {
    const dir = fixture(`import { test } from "bun:test"\ntest("ok", () => {})\n`)
    writeFileSync(path.join(dir, "broken.test.ts"), `import "./no-such-module"\n`)
    const r = runRunner(dir, ["./fixture.test.ts", "./broken.test.ts"])
    expect(r.status).not.toBe(0)
    expect(lastLine(r.stderr)).toContain("lists no failing test")
  }, 90_000)

  test("a filter that matches no files says no report was written", () => {
    const r = runRunner(fixture(""), ["no-such-test-file-xyz"])
    expect(r.status).not.toBe(0)
    expect(r.stderr).not.toContain(RECAP)
    expect(lastLine(r.stderr)).toContain("No junit report")
    expect(lastLine(r.stderr)).toContain("above")
  }, 90_000)

  test("a TimeoutError-only first pass whose re-run fails recaps the re-run's failures", () => {
    const dir = fixture(`import { test } from "bun:test"
import { existsSync, writeFileSync } from "node:fs"
test("times out, then fails", async () => {
  if (!existsSync("attempted")) {
    writeFileSync("attempted", "")
    await new Promise(() => {})
  }
  throw new Error("re-run failure")
}, 500)
`)
    const r = runRunner(dir)
    expect(r.stderr).toContain("Re-running 1 file(s)")
    expect(r.status).not.toBe(0)
    const recap = recapOf(r.stderr)
    expect(recap).toContain("fixture.test.ts > times out, then fails")
    expect(recap).toContain("re-run failure")
    expect(recap).not.toContain("timed out")
  }, 90_000)
})

describe("run-tests: dependency preflight", () => {
  test("a declared dependency missing from node_modules fails fast, naming it and bun install", () => {
    const repo = fixture(`import { test } from "bun:test"\nimport { writeFileSync } from "node:fs"\ntest("ran", () => writeFileSync("ran", ""))\n`)
    mkdirSync(path.join(repo, "scripts"))
    copyFileSync(RUNNER, path.join(repo, "scripts", "run-tests.ts"))
    writeFileSync(
      path.join(repo, "package.json"),
      JSON.stringify({ dependencies: { present: "1" }, devDependencies: { "@scope/absent": "1", "plain-absent": "1" } }),
    )
    mkdirSync(path.join(repo, "node_modules", "present"), { recursive: true })
    writeFileSync(path.join(repo, "node_modules", "present", "package.json"), "{}")
    const started = Date.now()
    const r = spawnSync(process.execPath, [path.join(repo, "scripts", "run-tests.ts"), "./fixture.test.ts"], {
      cwd: repo,
      encoding: "utf8",
      timeout: 30_000,
    })
    expect(r.status).not.toBe(0)
    expect(Date.now() - started).toBeLessThan(10_000)
    expect(r.stderr).toContain("@scope/absent")
    expect(r.stderr).toContain("plain-absent")
    expect(r.stderr).not.toContain("present,")
    expect(r.stderr).toContain("bun install")
    expect(r.stderr).not.toContain(RECAP)
    expect(existsSync(path.join(repo, "ran"))).toBe(false)
  }, 60_000)
})
