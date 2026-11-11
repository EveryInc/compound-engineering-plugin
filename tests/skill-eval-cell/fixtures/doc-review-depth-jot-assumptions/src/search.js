import { load } from "./store.js"

// Linear scan over every note, lowercasing each one on every call.
export function search(term) {
  const t = term.toLowerCase()
  return load().filter((n) => n.text.toLowerCase().includes(t))
}
