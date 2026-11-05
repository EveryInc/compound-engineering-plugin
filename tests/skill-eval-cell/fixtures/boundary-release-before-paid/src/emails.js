function formatStart(iso) {
  return new Date(iso).toUTCString()
}

export function confirmationEmail({ guest, event, registration }) {
  return {
    subject: `You're registered: ${event.title}`,
    body: [
      `Hi ${guest.name},`,
      "",
      `Thanks for registering for ${event.title} on ${formatStart(event.startsAt)}.`,
      `Complete your payment here: ${registration.paymentUrl}`,
    ].join("\n"),
  }
}

export function receiptEmail({ guest, event, amountCents }) {
  return {
    subject: `Receipt: ${event.title}`,
    body: [
      `Hi ${guest.name},`,
      "",
      `We received your payment of $${(amountCents / 100).toFixed(2)} for ${event.title}.`,
    ].join("\n"),
  }
}
