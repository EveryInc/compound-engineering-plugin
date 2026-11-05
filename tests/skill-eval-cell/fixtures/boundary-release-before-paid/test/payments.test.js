import assert from "node:assert/strict"
import test from "node:test"
import { outbox } from "../src/mailer.js"
import { handlePaymentWebhook } from "../src/payments.js"
import { getRegistration, registerGuest } from "../src/registrations.js"

test("a succeeded payment marks the registration paid and sends a receipt", () => {
  const { id } = registerGuest({ eventId: "evt_spring_launch", name: "Ada", email: "ada@example.test" })
  assert.deepEqual(handlePaymentWebhook({ registrationId: id, status: "succeeded", amountCents: 2500 }), { ok: true })
  assert.equal(getRegistration(id).status, "paid")
  assert.match(outbox.at(-1).subject, /^Receipt:/)
})

test("a failed payment leaves the registration pending", () => {
  const { id } = registerGuest({ eventId: "evt_spring_launch", name: "Bo", email: "bo@example.test" })
  handlePaymentWebhook({ registrationId: id, status: "failed", amountCents: 2500 })
  assert.equal(getRegistration(id).status, "pending_payment")
})
