const { seed } = require("../src/db")
const { listOrders } = require("../src/api/orders")

seed("orders", Array.from({ length: 45 }, (_, i) => ({ id: i + 1 })))
const first = listOrders(1)
if (first[0]?.id !== 1) {
  console.error("FAIL: page 1 should start at order 1, got " + first[0]?.id)
  process.exit(1)
}
console.log("ok")
