import { test, expect } from "bun:test"
import { isFresh } from "../src/fetch-rates.js"

test("an EU-morning timestamp without offset is fresh", () => {
  const now = Date.parse("2026-03-02T07:30:00Z")
  expect(isFresh({ asOf: "2026-03-02T08:10:00" }, now)).toBe(true)
})
