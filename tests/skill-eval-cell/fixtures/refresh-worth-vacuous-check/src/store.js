export function savePrice(cache, sku, price) {
  cache.put(sku, price)
  invalidate(sku)
}

function invalidate(sku) {
  globalThis.priceVersion = (globalThis.priceVersion ?? 0) + 1
  globalThis.dirtySkus = [...(globalThis.dirtySkus ?? []), sku]
}
