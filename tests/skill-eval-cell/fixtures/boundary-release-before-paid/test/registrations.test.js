import assert from "node:assert/strict"
import test from "node:test"
import { outbox } from "../src/mailer.js"
import { registerGuest } from "../src/registrations.js"

test("registering emails a confirmation with the payment link", () => {
  const registration = registerGuest({ eventId: "evt_spring_launch", name: "Ada", email: "ada@example.test" })
  assert.equal(registration.status, "pending_payment")
  const sent = outbox.at(-1)
  assert.equal(sent.to, "ada@example.test")
  assert.match(sent.subject, /Spring Launch Webinar/)
  assert.ok(sent.body.includes(registration.paymentUrl))
})
