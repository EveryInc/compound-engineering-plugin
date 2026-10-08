const test = require("node:test")
const assert = require("node:assert")
const greet = require("../src/greet.js")

test("greets by name", () => {
  assert.strictEqual(greet("Ada"), "hello Ada")
})
