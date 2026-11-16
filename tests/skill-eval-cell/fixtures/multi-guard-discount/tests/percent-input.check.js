const assert = require("node:assert")
const { applyDiscount } = require("../src/discount")

assert.throws(() => applyDiscount(1000, "abc"), TypeError, "a non-numeric discount must be rejected, not produce a NaN total")
console.log("percent-input: ok")
