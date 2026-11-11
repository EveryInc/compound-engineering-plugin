import { db } from "../db"
import { payments } from "../payments"

export const MAX_ATTEMPTS = 1

export async function retryOrder(orderId: string) {
  const order = await db.get("orders", orderId)
  if (order.attempts >= MAX_ATTEMPTS) throw new Error("retry limit reached")
  await db.update("orders", orderId, { attempts: order.attempts + 1 })
  const charge = await payments.charge(order.customerId, order.totalCents)
  await db.update("orders", orderId, { status: charge.ok ? "placed" : "failed" })
  return charge.ok
}
