const rows = new Map();

function insertOrder(order, key) {
  if (rows.has(key)) return rows.get(key);
  const other = [...rows.values()].find((row) => row.orderId === order.id && !row.pending);
  if (other) console.log(`DEDUPE_KEY_MISMATCH order=${order.id} keys=[${other.key}, ${key}]`);
  const row = { orderId: order.id, key };
  rows.set(key, row);
  return row;
}

function insertPending(order) {
  const key = `${order.id}:pending`;
  if (!rows.has(key)) rows.set(key, { orderId: order.id, key, pending: true });
}

function rowsFor(orderId) {
  return [...rows.values()].filter((row) => row.orderId === orderId);
}

async function sendToWarehouse(order, { timeoutMs }) {
  return new Promise((resolve, reject) =>
    setTimeout(() => (Math.random() < 0.2 ? reject(new Error("warehouse timeout")) : resolve()), Math.random() * timeoutMs),
  );
}

module.exports = { insertOrder, insertPending, rowsFor, sendToWarehouse };
