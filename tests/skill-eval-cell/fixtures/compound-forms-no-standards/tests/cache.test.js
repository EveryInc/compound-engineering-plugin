import { expect, test } from "bun:test"
import { getRate } from "../src/cache.js"

test("loads a rate on first use", () => {
  expect(getRate("usd", () => 1)).toBe(1)
})
