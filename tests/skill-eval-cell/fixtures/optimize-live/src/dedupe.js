// Returns the distinct values of `items` in first-seen order.
// `count` is called once per element comparison so the cost is measurable
// without a clock.
function dedupe(items, count = () => {}) {
  const out = []
  for (const item of items) {
    let seen = false
    for (const kept of out) {
      count()
      if (kept === item) seen = true
    }
    if (!seen) out.push(item)
  }
  return out
}

module.exports = { dedupe }
