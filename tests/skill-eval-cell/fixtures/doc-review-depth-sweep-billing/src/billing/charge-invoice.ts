import { gateway } from "./gateway"
import { db } from "../db"

export async function chargeInvoice(invoiceId: string) {
  const invoice = await db.get("invoices", invoiceId)
  const result = await gateway.charge(invoice.customerId, invoice.amountCents)
  await db.update("invoices", invoiceId, { status: result.ok ? "paid" : "failed" })
}
