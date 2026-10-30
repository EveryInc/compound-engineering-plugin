import assert from "node:assert/strict"
import { invoiceSummary } from "../src/invoice-summary.js"

const out = invoiceSummary({ id: "INV-7", customer: "Acme", subtotal: 10, shipping: 2.5, total: 12.5 })
assert.match(out, /Total: \$12\.50$/)
console.log("ok")
