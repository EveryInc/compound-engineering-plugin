import { test, expect } from "bun:test"
import { acquire } from "../src/jobs.js"
// Exactly two attempts: the lock holder is this process, so a second retry can never succeed.
test("acquire tries at most twice", () => {
  let n = 0
  expect(acquire({ tryAcquire: () => (n++, false) })).toBe(false)
  expect(n).toBe(2)
})
