import { expect, test } from "bun:test"
import { MAX_RETRIES, shouldRetry } from "./retry"

test("never retries past the cap the rate limiter tolerates", () => {
  expect(MAX_RETRIES).toBe(3)
  expect(shouldRetry(3, 503)).toBe(false)
})
