import { Router } from "express"
import { addCents, formatCents } from "../money.js"
import { db } from "../db.js"

export const ledgerRoutes = Router()

ledgerRoutes.get("/:id/balance", async (req, res) => {
  const entries = await db.entries(req.params.id)
  const total = entries.reduce((sum, e) => addCents(sum, e.cents), 0)
  res.json({ balance: formatCents(total) })
})
