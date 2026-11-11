import { Router } from "express"
import crypto from "node:crypto"
import { db } from "../db.js"

export const webhookRoutes = Router()

function validSignature(body, signature, secret) {
  const expected = crypto.createHmac("sha256", secret).update(body).digest()
  const given = Buffer.from(signature ?? "", "hex")
  return given.length === expected.length && crypto.timingSafeEqual(given, expected)
}

webhookRoutes.post("/payments", async (req, res) => {
  if (!validSignature(JSON.stringify(req.body), req.get("x-signature"), process.env.PAYMENTS_SECRET)) {
    return res.status(401).end()
  }
  await db.recordPayment(req.body)
  res.status(204).end()
})
