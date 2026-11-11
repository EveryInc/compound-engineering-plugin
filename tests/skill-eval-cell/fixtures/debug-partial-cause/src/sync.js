const { insertOrder, insertPending, sendToWarehouse } = require("./store.js");

async function syncOrder(order, { retries = 5 } = {}) {
  const key = `${order.id}:${order.syncedAt}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await sendToWarehouse(order, { timeoutMs: 200 });
      break;
    } catch (err) {
      insertPending(order);
      if (attempt === retries) throw err;
    }
  }
  order.syncedAt = order.syncedAt ?? Math.floor(Date.now() / 1000);
  return insertOrder(order, key);
}

module.exports = { syncOrder };
