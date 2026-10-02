const test = require("node:test")
const assert = require("node:assert")
const { orderTotal, orderTotalWithShipping } = require("../src/totals.js")

const order = { items: [{ price: 10, qty: 2 }, { price: 5, qty: 1 }], coupon: "TEN" }

test("applies the coupon to the subtotal", () => {
  assert.strictEqual(orderTotal(order), 22.5)
})

test("adds shipping after the coupon", () => {
  assert.strictEqual(orderTotalWithShipping(order, 4), 26.5)
})
