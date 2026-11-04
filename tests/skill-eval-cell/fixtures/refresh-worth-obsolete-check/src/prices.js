import { getPrice, savePrice } from "./store.js"

export function applyDiscount(db, sku, pct) {
  const price = getPrice(db, sku)
  savePrice(db, sku, Math.round(price * (100 - pct)) / 100)
}
