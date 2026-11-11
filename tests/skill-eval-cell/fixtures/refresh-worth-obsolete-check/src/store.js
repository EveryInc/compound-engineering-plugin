export function savePrice(db, sku, price) {
  db.run("UPDATE prices SET price = ? WHERE sku = ?", [price, sku])
}

export function getPrice(db, sku) {
  return db.get("SELECT price FROM prices WHERE sku = ?", [sku]).price
}
