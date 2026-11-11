import { test } from "node:test"
import assert from "node:assert/strict"
import { exportJson } from "./src/export.js"

const record = { id: "r1", accountId: "a1", data: ["value"] }
test("owner receives existing JSON export", () => {
  assert.equal(exportJson(record, "a1"), '["value"]')
})
test("JSON export rejects another account", () => {
  assert.throws(() => exportJson(record, "a2"), { status: 403 })
})
