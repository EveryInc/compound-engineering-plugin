import { now } from "../clock.js"

export function issueInvoice(order) {
  return { order, issuedAt: now() }
}
