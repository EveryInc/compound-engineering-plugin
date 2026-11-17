const { query } = require("../db")
const { isoDay } = require("../util/dates")

function shipmentsSince(day) {
  return query("orders", { offset: 0, limit: 10000 }).filter((o) => o.shippedOn && o.shippedOn >= isoDay(day))
}

module.exports = { shipmentsSince }
