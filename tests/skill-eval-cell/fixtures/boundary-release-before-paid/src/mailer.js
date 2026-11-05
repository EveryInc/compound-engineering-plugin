export const outbox = []

export function sendEmail({ to, subject, body }) {
  outbox.push({ to, subject, body })
}
