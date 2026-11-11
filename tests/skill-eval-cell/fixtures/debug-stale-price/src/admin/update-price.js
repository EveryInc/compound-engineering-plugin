const cache = require("../cache.js");
const db = require("../db.js");

function updatePrice(productId, price) {
  db.savePrice(productId, price);
  cache.invalidate(`price:${productId}`);
}

module.exports = { updatePrice };
