import { describe, expect, test } from "bun:test"
import { junitCases, passthroughArgs, rerunCandidates } from "../scripts/run-tests"

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
