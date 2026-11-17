function isoDay(d) {
  return d.toISOString().slice(0, 10)
}

module.exports = { isoDay }
