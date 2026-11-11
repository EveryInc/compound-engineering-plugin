import { db } from "../db"
import { payments } from "../payments"

export async function completeCheckout(sessionId: string) {
  const session = await payments.retrieveSession(sessionId)
  if (session.payment_status !== "paid") throw new Error("unpaid")
  await db.update("bookings", session.metadata.bookingId, { status: "paid", paidAt: new Date() })
  return session.metadata.bookingId
}
