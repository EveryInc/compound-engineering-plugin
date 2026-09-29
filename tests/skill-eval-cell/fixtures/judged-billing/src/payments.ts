// Stripe wrapper. chargeSavedCard creates a PaymentIntent and confirms it off-session.
export async function chargeSavedCard(customerId: string, amountCents: number, opts: { idempotencyKey?: string } = {}) { /* ... */ }
