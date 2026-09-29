import { Router } from "express"
import { db } from "../db"
import { requireUser } from "../auth"

export const orders = Router()

// GET /orders — the signed-in user's order history page.
orders.get("/orders", requireUser, async (req, res) => {
  const rows = await db.query(
    "SELECT id, placed_at, status, total_cents FROM orders WHERE user_id = $1 ORDER BY placed_at DESC",
    [req.user.id],
  )
  res.render("orders", { orders: rows })
})
