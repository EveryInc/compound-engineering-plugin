import { test } from "node:test"
import assert from "node:assert/strict"
import { downloadLink } from "./src/endpoint.js"

test("owner gets a signed download link", async () => {
  const load = async () => ({ id: "r1", accountId: "a1" })
  const sign = async id => `signed:${id}`
  assert.deepEqual(await downloadLink("r1", "a1", load, sign), { url: "signed:r1" })
})
