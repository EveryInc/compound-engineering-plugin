const RATES = { USD: 1, EUR: 0.92, GBP: 0.79 }

export function priceFor(cents, currency) {
  return cents * (RATES[currency] ?? RATES.USD)
}
