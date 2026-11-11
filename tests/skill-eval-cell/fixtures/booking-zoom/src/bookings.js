import { getSession } from "./sessions.js"

const bookings = new Map()
let nextId = 1

export function createBooking(email, sessionId) {
  const session = getSession(sessionId)
  for (const b of bookings.values()) {
    if (b.sessionId === session.id && b.status === "paid") throw new Error("session already booked")
  }
  const booking = { id: String(nextId++), email, sessionId: session.id, status: "pending" }
  bookings.set(booking.id, booking)
  return booking
}

export function confirmPayment(bookingId) {
  const booking = bookings.get(bookingId)
  if (!booking) throw new Error(`no booking ${bookingId}`)
  booking.status = "paid"
  return booking
}
