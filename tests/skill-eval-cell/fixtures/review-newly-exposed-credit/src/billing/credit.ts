import { db } from "../db"

// Adds store credit to an account and returns the new balance in cents.
export async function creditAccount(accountId: string, cents: number): Promise<number> {
  const account = await db.get("accounts", accountId)
  const balance = account.balanceCents + cents
  await db.update("accounts", accountId, { balanceCents: balance })
  return balance
}
