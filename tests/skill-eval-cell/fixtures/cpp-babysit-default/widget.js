export function total(items) {
  return items.reduce((a, b) => a + b.price, 0)
}
