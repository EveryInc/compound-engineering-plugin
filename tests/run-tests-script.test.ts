import { describe, expect, test } from "bun:test"
import { junitFailures, rerunCandidates } from "../scripts/run-tests"

const junit = (suites: string) => `<?xml version="1.0"?>\n<testsuites name="bun test">\n${suites}\n</testsuites>`

const timeout = (file: string, line: number) =>
  `<testcase name="t${line}" classname="g" time="30" file="${file}" line="${line}"><failure type="TimeoutError" /></testcase>`

describe("run-tests: choosing files to re-run from a bun junit report", () => {
  test("reads failures per testcase, taking the file from the case or its suite", () => {
    const xml = junit(`
  <testsuite name="tests/b.test.ts" file="tests/b.test.ts" tests="2" failures="1">
    <testsuite name="group" file="tests/b.test.ts" line="3" tests="2" failures="1">
      <testcase name="ok" classname="group" time="0" file="tests/b.test.ts" line="4" />
      ${timeout("tests/b.test.ts", 5)}
    </testsuite>
  </testsuite>
  <testsuite name="tests/a.test.ts" tests="1" failures="1">
    <testcase name="no file attr on the case, bun 1.2 shape" classname="" time="30" line="2"><failure type="TimeoutError" /></testcase>
  </testsuite>
  <testsuite name="tests/c.test.ts" file="tests/c.test.ts" tests="1" failures="0">
    <testcase name="ok" classname="" time="0" file="tests/c.test.ts" line="1" />
  </testsuite>`)
    expect(junitFailures(xml)).toEqual([
      { file: "tests/b.test.ts", type: "TimeoutError" },
      { file: "tests/a.test.ts", type: "TimeoutError" },
    ])
    expect(rerunCandidates(junitFailures(xml))).toEqual(["tests/a.test.ts", "tests/b.test.ts"])
  })

  test("re-runs nothing when any failure is not a timeout, even in another file", () => {
    const xml = junit(`
  <testsuite name="tests/b.test.ts" file="tests/b.test.ts" tests="1" failures="1">
    ${timeout("tests/b.test.ts", 5)}
  </testsuite>
  <testsuite name="tests/d.test.ts" file="tests/d.test.ts" tests="1" failures="1">
    <testcase name="wrong" classname="" time="0" file="tests/d.test.ts" line="3"><failure type="AssertionError" /></testcase>
  </testsuite>`)
    expect(rerunCandidates(junitFailures(xml))).toEqual([])
  })

  test("re-runs nothing for a clean, errored-only, or empty report", () => {
    const clean = junit(`  <testsuite name="tests/c.test.ts" file="tests/c.test.ts" tests="1" failures="0"><testcase name="ok" file="tests/c.test.ts" line="1" /></testsuite>`)
    const errored = junit(`  <testsuite name="tests/e.test.ts" file="tests/e.test.ts" tests="1" errors="1"><testcase name="boom" file="tests/e.test.ts" line="1"><error message="import failed" /></testcase></testsuite>`)
    expect(rerunCandidates(junitFailures(clean))).toEqual([])
    expect(junitFailures(errored)).toEqual([{ file: "tests/e.test.ts", type: "error" }])
    expect(rerunCandidates(junitFailures(errored))).toEqual([])
    expect(rerunCandidates(junitFailures(""))).toEqual([])
  })
})
