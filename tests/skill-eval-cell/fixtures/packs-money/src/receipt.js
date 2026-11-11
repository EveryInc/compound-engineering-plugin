export function receiptLine(item) {
  return `${item.name}: $` + item.price.toFixed(2)
}
