const rows = new Map();

function insertOrder(order, key) {
  if (rows.has(key)) return rows.get(key);
  const other = [...rows.values()].find((row) => row.orderId === order.id);
  if (other) console.log(`DEDUPE_KEY_MISMATCH order=${order.id} keys=[${other.key}, ${key}]`);
  const row = { orderId: order.id, key };
  rows.set(key, row);
  return row;
}

function rowsFor(orderId) {
  return [...rows.values()].filter((row) => row.orderId === orderId);
}

async function sendToWarehouse(order, { timeoutMs }) {
  return new Promise((resolve) => setTimeout(resolve, Math.random() * timeoutMs));
}

module.exports = { insertOrder, rowsFor, sendToWarehouse };
