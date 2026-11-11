const { syncOrder } = require("../src/sync.js");
const { rowsFor } = require("../src/store.js");

const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const order = { id: 1001 };
  await Promise.all([syncOrder(order), later(Math.random() * 200).then(() => syncOrder(order))]);
  const count = rowsFor(1001).length;
  if (count !== 1) {
    console.error(`duplicate order: expected 1 row for order 1001, got ${count}`);
    process.exit(1);
  }
})();
