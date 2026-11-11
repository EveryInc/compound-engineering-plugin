export function invoiceSummary(invoice) {
  return [
    `Invoice ${invoice.id}`,
    `Customer: ${invoice.customer}`,
    "Subtotal: $" + invoice.subtotal.toFixed(2),
    "Shipping: $" + invoice.shipping.toFixed(2),
    "Total: $" + invoice.total,
  ].join("\n")
}
