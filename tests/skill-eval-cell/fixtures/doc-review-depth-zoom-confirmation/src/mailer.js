export const outbox = []

export function send(to, subject, body) {
  outbox.push({ to, subject, body, sentAt: new Date().toISOString() })
}
