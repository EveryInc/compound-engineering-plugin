export function formatRate(rate) {
  return { base: rate.base, quote: rate.quote, value: Number(rate.value.toFixed(6)), currency: rate.quote }
}
