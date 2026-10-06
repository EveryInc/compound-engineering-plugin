import { test } from "node:test"
import assert from "node:assert/strict"
import { sum } from "../src/ledger.js"

test("sum adds entry amounts", () => {
  assert.equal(sum([{ amount: 2 }, { amount: 3 }]), 5)
})
