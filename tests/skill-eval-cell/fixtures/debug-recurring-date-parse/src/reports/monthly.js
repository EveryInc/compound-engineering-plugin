// monthly report: groups order rows by calendar day.
// row.day is a calendar date string from the warehouse, e.g. "2026-09-01".
function bucket(rows) {
  const out = new Map()
  for (const row of rows) {
    const day = new Date(row.day)
    const key = day.getFullYear() + "-" + (day.getMonth() + 1) + "-" + day.getDate()
    out.set(key, (out.get(key) ?? 0) + row.total)
  }
  return out
}
module.exports = { bucket }
