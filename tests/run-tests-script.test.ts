import { describe, expect, test } from "bun:test"
import { junitCases, rerunCandidates } from "../scripts/run-tests"

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

  test("re-runs a file only when it timed out from its first failure to its end", () => {
    const wedged = suite("tests/w.test.ts", ok("tests/w.test.ts", 1) + fail("tests/w.test.ts", 2, "TimeoutError") + fail("tests/w.test.ts", 3, "TimeoutError"))
    expect(rerunCandidates(junitCases(junit(wedged)))).toEqual(["tests/w.test.ts"])
    // A test that passed after a timeout means the worker was still alive: not a wedge.
    const recovered = suite("tests/r.test.ts", fail("tests/r.test.ts", 1, "TimeoutError") + ok("tests/r.test.ts", 2))
    expect(rerunCandidates(junitCases(junit(recovered)))).toEqual([])
    // A non-timeout failure anywhere, even in another file, keeps the first result.
    const assertion = suite("tests/d.test.ts", fail("tests/d.test.ts", 1, "AssertionError"))
    expect(rerunCandidates(junitCases(junit(wedged + assertion)))).toEqual([])
    const late = suite("tests/l.test.ts", fail("tests/l.test.ts", 1, "TimeoutError") + fail("tests/l.test.ts", 2, "AssertionError"))
    expect(rerunCandidates(junitCases(junit(late)))).toEqual([])
  })

  test("re-runs nothing for a clean, errored-only, or empty report", () => {
    expect(rerunCandidates(junitCases(junit(suite("tests/c.test.ts", ok("tests/c.test.ts", 1)))))).toEqual([])
    const errored = junit(`<testsuite name="tests/e.test.ts" file="tests/e.test.ts"><testcase name="boom" file="tests/e.test.ts" line="1"><error message="import failed" /></testcase></testsuite>`)
    expect(junitCases(errored)).toEqual([{ file: "tests/e.test.ts", failure: "error" }])
    expect(rerunCandidates(junitCases(errored))).toEqual([])
    expect(rerunCandidates(junitCases(""))).toEqual([])
  })
})
