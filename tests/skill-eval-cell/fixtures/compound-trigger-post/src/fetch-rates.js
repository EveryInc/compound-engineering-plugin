import { fromZonedTime } from "./zone.js"

const PROVIDER_ZONE = "Europe/Berlin"
const MAX_AGE_MS = 60 * 60 * 1000

// The provider's asOf timestamps carry no offset and are in its local time, not UTC.
export function isFresh(rate, now = Date.now()) {
  const asOf = fromZonedTime(rate.asOf, PROVIDER_ZONE)
  return now - asOf.getTime() < MAX_AGE_MS
}
