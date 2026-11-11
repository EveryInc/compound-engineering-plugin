const { getPrice } = require("../src/products.js");
const { updatePrice } = require("../src/admin/update-price.js");

getPrice("MUG-BLUE");
updatePrice(7, 1500);
const shown = getPrice("MUG-BLUE");
if (shown !== 1500) {
  console.error(`stale price: expected 1500 after update, got ${shown}`);
  process.exit(1);
}
