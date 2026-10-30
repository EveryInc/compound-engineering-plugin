export function formatMoney(amount) {
  const [whole, cents] = Math.abs(amount).toFixed(2).split(".")
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return `${amount < 0 ? "-" : ""}$${grouped}.${cents}`
}
