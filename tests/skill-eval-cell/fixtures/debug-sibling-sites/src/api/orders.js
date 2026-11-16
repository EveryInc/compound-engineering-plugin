const { query } = require("../db")

// page comes from ?page= in the admin UI; the first page is page 1.
function listOrders(page, pageSize = 20) {
  const offset = page * pageSize
  return query("orders", { offset, limit: pageSize })
}

module.exports = { listOrders }
