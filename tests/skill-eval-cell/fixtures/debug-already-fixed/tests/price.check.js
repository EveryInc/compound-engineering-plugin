const assert = require("node:assert")
const { formatPrice } = require("../src/price")

assert.strictEqual(formatPrice(1990), "$19.90")
assert.strictEqual(formatPrice(5), "$0.05")
console.log("ok")
