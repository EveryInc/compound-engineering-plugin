export function addCents(a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b)) throw new TypeError("cents must be integers")
  return a + b
}

export function formatCents(cents) {
  return (cents / 100).toFixed(2)
}
