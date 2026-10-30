import { pool } from "./db.js"

export async function findOrders(customerId) {
  const { rows } = await pool.query("SELECT * FROM orders WHERE customer_id = $1", [customerId])
  return rows
}

export async function cancelOrder(id) {
  await pool.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [id])
  await notifyCancelled(id)
}

async function notifyCancelled(id) {}
