const { query } = require("../db")

function getProduct(id) {
  return query("products", { offset: 0, limit: 1000 }).find((p) => p.id === id) ?? null
}

module.exports = { getProduct }
