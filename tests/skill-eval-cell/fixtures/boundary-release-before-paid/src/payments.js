import { receiptEmail } from "./emails.js"
import { getEvent } from "./events.js"
import { sendEmail } from "./mailer.js"
import { getRegistration } from "./registrations.js"

export function handlePaymentWebhook({ registrationId, status, amountCents }) {
  const registration = getRegistration(registrationId)
  if (!registration) return { ok: false, reason: "unknown registration" }
  if (status !== "succeeded") return { ok: true, ignored: true }
  if (registration.status === "paid") return { ok: true, duplicate: true }
  registration.status = "paid"
  const event = getEvent(registration.eventId)
  sendEmail({ to: registration.guest.email, ...receiptEmail({ guest: registration.guest, event, amountCents }) })
  return { ok: true }
}
