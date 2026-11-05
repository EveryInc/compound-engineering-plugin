import { db } from "../db"

export async function createBooking(userId: string, slotId: string) {
  const booking = await db.insert("bookings", { userId, slotId, status: "pending_payment" })
  return booking
}
