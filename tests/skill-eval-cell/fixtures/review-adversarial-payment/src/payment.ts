export async function payInvoice(invoiceId: string, store: InvoiceStore, payments: PaymentGateway) {
  const invoice = await store.read(invoiceId)
  if (invoice.paid) return
  await payments.charge(invoice.customerId, invoice.amount)
  await store.markPaid(invoiceId)
}
interface InvoiceStore {
  read(id: string): Promise<{ paid: boolean; customerId: string; amount: number }>
  markPaid(id: string): Promise<void>
}
interface PaymentGateway {
  charge(customerId: string, amount: number): Promise<void>
}
