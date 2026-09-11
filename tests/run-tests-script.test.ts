import { describe, expect, test } from "bun:test"
import { failedFilesFromJunit } from "../scripts/run-tests"

const junit = (suites: string) => `<?xml version="1.0"?>\n<testsuites name="bun test">\n${suites}\n</testsuites>`

describe("run-tests: failed files from a bun junit report", () => {
  test("collects each file with a failure or error once, sorted, ignoring passing files", () => {
    const xml = junit(`
  <testsuite name="tests/b.test.ts" file="tests/b.test.ts" tests="2" failures="1" skipped="0" time="0">
    <testsuite name="group" file="tests/b.test.ts" line="3" tests="2" failures="1" skipped="0" time="0">
      <testcase name="ok" classname="group" time="0" file="tests/b.test.ts" line="4" />
      <testcase name="timed out" classname="group" time="30" file="tests/b.test.ts" line="5"><failure message="timeout" /></testcase>
    </testsuite>
  </testsuite>
  <testsuite name="tests/a.test.ts" file="tests/a.test.ts" tests="1" failures="0" errors="1" skipped="0" time="0" />
  <testsuite name="tests/c.test.ts" file="tests/c.test.ts" tests="1" failures="0" skipped="0" time="0" />`)
    expect(failedFilesFromJunit(xml)).toEqual(["tests/a.test.ts", "tests/b.test.ts"])
  })

  test("returns nothing for a clean or empty report", () => {
    expect(failedFilesFromJunit(junit(`  <testsuite name="tests/c.test.ts" file="tests/c.test.ts" tests="1" failures="0" skipped="0" time="0" />`))).toEqual([])
    expect(failedFilesFromJunit("")).toEqual([])
  })
})
