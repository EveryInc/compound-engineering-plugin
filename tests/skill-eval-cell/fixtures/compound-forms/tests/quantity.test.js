import { expect, test } from "bun:test"
import { parseQuantity } from "../src/quantity.js"

test("parses a numeric string", () => {
  expect(parseQuantity("2")).toBe(2)
})
