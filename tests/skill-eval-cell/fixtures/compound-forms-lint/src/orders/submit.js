import { saveOrder } from "./store.js"

export async function submitOrder(order) {
  await saveOrder(order)
  return { confirmed: true }
}
