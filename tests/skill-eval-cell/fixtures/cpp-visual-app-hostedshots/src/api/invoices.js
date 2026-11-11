export function invoiceTotal(lines) {
  return lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0)
}
export function handleGetInvoice(req, res, db) {
  const inv = db.invoices.get(req.params.id)
  res.json({ id: inv.id, total: invoiceTotal(inv.lines) })
}
