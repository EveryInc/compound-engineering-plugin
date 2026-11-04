import { savePrice } from "./store.js"

export function applyDiscount(cache, sku, price, pct) {
  savePrice(cache, sku, Math.round(price * (100 - pct)) / 100)
}
