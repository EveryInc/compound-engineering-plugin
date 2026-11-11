import { test } from "node:test"
import assert from "node:assert/strict"
import { createBooking, confirmPayment } from "../src/bookings.js"

test("a booking starts pending and becomes paid", () => {
  const booking = createBooking("visitor@example.com", "s1")
  assert.equal(booking.status, "pending")
  assert.equal(confirmPayment(booking.id).status, "paid")
})
