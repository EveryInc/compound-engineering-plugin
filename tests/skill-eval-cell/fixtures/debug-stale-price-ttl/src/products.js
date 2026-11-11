const cache = require("./cache.js");
const db = require("./db.js");

function getPrice(sku) {
  const key = `price:${sku}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const price = db.findBySku(sku).price;
  cache.set(key, price);
  return price;
}

module.exports = { getPrice };
