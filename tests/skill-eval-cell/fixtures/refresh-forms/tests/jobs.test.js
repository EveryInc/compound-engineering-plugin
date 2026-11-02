import { expect, test } from "bun:test"
import { JOB_TIMEOUT_MS, acquire } from "../src/jobs.js"

// Exactly two attempts: the lock holder is this process, so a second retry can never succeed.
test("acquire tries at most twice", () => {
  let tries = 0
  expect(acquire({ tryAcquire: () => (tries++, false) })).toBe(false)
  expect(tries).toBe(2)
})

test("job timeout stays at thirty seconds", () => {
  expect(JOB_TIMEOUT_MS).toBe(30_000)
})
