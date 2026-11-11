import { expect, test } from "bun:test"
import { roundCents } from "../src/money.js"

// Finance reconciles against half-up totals, so half-even rounding reopens the mismatch.
test("rounds half up", () => {
  expect(roundCents(2.5)).toBe(3)
})
