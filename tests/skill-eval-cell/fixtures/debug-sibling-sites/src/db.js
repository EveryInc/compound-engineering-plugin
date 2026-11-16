// In-memory stand-in for the warehouse tables.
const tables = { orders: [], customers: [], invoices: [], audit: [], products: [] }

function seed(table, rows) {
  tables[table] = rows.slice()
}

function query(table, { offset, limit }) {
  return tables[table].slice(offset, offset + limit)
}

module.exports = { seed, query }
