// invoices: id, customer_id, amount_cents, due_at, status ('open' | 'paid' | 'void').
export async function findOverdueOpenInvoices(): Promise<{ id: string; customerId: string; amountCents: number }[]> { return [] }
export async function markPaid(invoiceId: string): Promise<void> {}
