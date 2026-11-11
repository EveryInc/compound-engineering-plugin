const products = new Map([[7, { id: 7, sku: "MUG-BLUE", price: 1200 }]]);

function findById(id) {
  return products.get(id);
}

function findBySku(sku) {
  return [...products.values()].find((p) => p.sku === sku);
}

function savePrice(id, price) {
  products.get(id).price = price;
}

module.exports = { findById, findBySku, savePrice };
