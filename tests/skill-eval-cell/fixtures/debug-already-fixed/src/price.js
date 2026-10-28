function formatPrice(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

module.exports = { formatPrice }
