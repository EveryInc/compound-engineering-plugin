import { expect, test } from "bun:test"
import { parseCents } from "../src/money.js"

test("parseCents keeps whole cents", () => {
  expect(parseCents("19.99")).toBe(1999)
})
