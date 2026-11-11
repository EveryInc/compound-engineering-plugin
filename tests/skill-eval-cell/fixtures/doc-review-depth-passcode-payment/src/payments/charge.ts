import { db } from "../db"
import { stripe } from "./stripe"

export async function chargeBooking(bookingId: string, paymentMethodId: string) {
  const booking = await db.get("bookings", bookingId)
  await stripe.paymentIntents.create({ amount: booking.priceCents, payment_method: paymentMethodId, confirm: true })
  await db.update("bookings", bookingId, { status: "paid" })
}
