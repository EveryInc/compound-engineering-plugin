export function parseCents(amount) {
  const [dollars, cents = "0"] = amount.split(".")
  return Number(dollars) * 100 + Number(cents.padEnd(2, "0"))
}
