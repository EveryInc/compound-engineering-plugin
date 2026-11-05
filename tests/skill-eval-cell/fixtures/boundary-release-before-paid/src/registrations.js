import { confirmationEmail } from "./emails.js"
import { getEvent } from "./events.js"
import { sendEmail } from "./mailer.js"

const registrations = new Map()
let nextId = 1

export function registerGuest({ eventId, name, email }) {
  const event = getEvent(eventId)
  const id = `reg_${nextId++}`
  const registration = {
    id,
    eventId,
    guest: { name, email },
    status: "pending_payment",
    paymentUrl: `https://pay.example.test/checkout/${id}`,
  }
  registrations.set(id, registration)
  sendEmail({ to: email, ...confirmationEmail({ guest: registration.guest, event, registration }) })
  return registration
}

export function getRegistration(id) {
  return registrations.get(id)
}
