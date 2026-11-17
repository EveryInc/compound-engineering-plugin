const { query } = require("../db")

// The audit log viewer streams pages from a background job that counts from 0,
// so page 0 is the first page here.
function auditPage(page, pageSize = 100) {
  const offset = page * pageSize
  return query("audit", { offset, limit: pageSize })
}

module.exports = { auditPage }
