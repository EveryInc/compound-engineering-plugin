const { getPrice } = require("../src/products.js");
const { updatePrice } = require("../src/admin/update-price.js");

const realNow = Date.now;
const start = realNow();
getPrice("MUG-BLUE");
updatePrice(7, 1500);
Date.now = () => start + 61 * 1000;
const shown = getPrice("MUG-BLUE");
Date.now = realNow;
if (shown !== 1500) {
  console.error(`stale price: expected 1500 61s after update, got ${shown}`);
  process.exit(1);
}
