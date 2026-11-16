const assert = require("node:assert")
const { applyDiscount } = require("../src/discount")

assert.throws(() => applyDiscount(1000, "150"), RangeError, "a discount over 100% must be rejected, not produce a negative total")
assert.strictEqual(applyDiscount(1000, "100"), 0)
console.log("discount: ok")
