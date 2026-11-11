import { invoiceTotal } from "../api/invoices.js"
export function formatRow(inv) {
  return `${inv.id},${invoiceTotal(inv.lines)}`
}
