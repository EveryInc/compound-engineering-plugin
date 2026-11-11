export function sum(entries) {
  return entries.reduce((total, entry) => total + entry.amount, 0)
}
