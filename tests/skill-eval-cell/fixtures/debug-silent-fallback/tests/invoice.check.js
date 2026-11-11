const { invoiceTotal } = require("../src/invoice.js");
const total = invoiceTotal(100, "EUR");
if (Math.round(total) !== 110) {
  console.error("invoice total: expected 110, got " + total);
  process.exit(1);
}
