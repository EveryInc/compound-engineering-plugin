const db = require("../db.js");

function updatePrice(productId, price) {
  db.savePrice(productId, price);
}

module.exports = { updatePrice };
