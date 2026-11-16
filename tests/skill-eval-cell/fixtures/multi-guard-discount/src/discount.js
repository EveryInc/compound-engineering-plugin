function parsePercent(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) throw new TypeError(`discount percent is not a number: ${raw}`)
  if (n < 0 || n > 100) throw new RangeError(`discount percent out of range: ${raw}`)
  return n
}

// Manual discounts arrive as form strings.
function applyDiscount(cents, rawPercent) {
  const p = parsePercent(rawPercent)
  return Math.round((cents * (100 - p)) / 100)
}

// Coupons come from the coupons table already numeric, so they skip parsePercent.
function applyCoupon(cents, coupon) {
  if (coupon.percent < 0 || coupon.percent > 100) throw new RangeError(`coupon ${coupon.code} percent out of range`)
  return Math.round((cents * (100 - coupon.percent)) / 100)
}

module.exports = { parsePercent, applyDiscount, applyCoupon }
