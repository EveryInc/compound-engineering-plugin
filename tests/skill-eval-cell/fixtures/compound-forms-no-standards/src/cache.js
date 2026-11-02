const TTL_MS = 90_000
const entries = new Map()

export function getRate(key, load) {
  const hit = entries.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  const value = load()
  entries.set(key, { value, at: Date.now() })
  return value
}
