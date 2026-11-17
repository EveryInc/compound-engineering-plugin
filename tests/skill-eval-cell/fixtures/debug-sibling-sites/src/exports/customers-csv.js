const { query } = require("../db")

// Nightly CSV export. The scheduler passes batch numbers starting at 1.
function exportCustomerBatch(batch, size = 500) {
  const rows = query("customers", { offset: size * batch, limit: size })
  return rows.map((c) => `${c.id},${c.name}`).join("\n")
}

module.exports = { exportCustomerBatch }
