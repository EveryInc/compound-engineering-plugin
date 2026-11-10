import { test, expect } from "bun:test"
import { formatRate } from "../src/rates.js"

test("each rate carries its quote currency", () => {
  expect(formatRate({ base: "USD", quote: "EUR", value: 0.9 }).currency).toBe("EUR")
})
