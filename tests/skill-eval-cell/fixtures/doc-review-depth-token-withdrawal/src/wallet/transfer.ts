import { chain } from "../chain"
import { db } from "../db"

export async function transfer(userId: string, toAddress: string, amount: bigint) {
  const account = await db.get("accounts", userId)
  if (account.balance < amount) throw new Error("insufficient balance")
  const tx = await chain.signAndBroadcast(account.hotWalletKeyId, toAddress, amount)
  await db.update("accounts", userId, { balance: account.balance - amount })
  return tx.hash
}
