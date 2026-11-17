const { query } = require("../db")

// Pushes invoices to the accounting system. Its API numbers pages from 1.
function invoicesForPage(pageNo, perPage = 25) {
  const skip = pageNo * perPage
  return query("invoices", { offset: skip, limit: perPage })
}

module.exports = { invoicesForPage }
