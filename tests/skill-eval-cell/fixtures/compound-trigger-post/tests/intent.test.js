import { test, expect } from "bun:test"
import { isHowToQuery } from "../src/intent.js"

test("a query without the hint is not a how-to query", async () => {
  expect(await isHowToQuery("bitcoin price today", {})).toBe(false)
})

test("one run keeps its first answer", async () => {
  const run = { howTo: true }
  expect(await isHowToQuery("how is bitcoin doing", run)).toBe(true)
})
