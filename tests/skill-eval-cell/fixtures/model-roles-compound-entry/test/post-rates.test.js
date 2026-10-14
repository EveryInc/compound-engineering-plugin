const test = require("node:test")
const assert = require("node:assert")
const { postRates } = require("../src/post-rates.js")

function sender(statuses) {
  const calls = []
  const send = async (batch) => {
    calls.push(batch.id)
    return statuses[calls.length - 1]
  }
  return { send, calls }
}

test("a 201 is delivered on the first attempt", async () => {
  const { send, calls } = sender([201])
  assert.deepStrictEqual(await postRates(send, { id: "b1" }), { ok: true, duplicate: false })
  assert.strictEqual(calls.length, 1)
})

test("a 504 followed by a 409 counts as delivered", async () => {
  const { send, calls } = sender([504, 409])
  assert.deepStrictEqual(await postRates(send, { id: "b1" }), { ok: true, duplicate: true })
  assert.strictEqual(calls.length, 2)
})

test("a 400 is not retried", async () => {
  const { send, calls } = sender([400, 201])
  assert.deepStrictEqual(await postRates(send, { id: "b1" }), { ok: false, status: 400 })
  assert.strictEqual(calls.length, 1)
})
