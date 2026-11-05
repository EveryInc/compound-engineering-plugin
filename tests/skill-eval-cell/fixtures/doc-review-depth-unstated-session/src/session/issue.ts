import crypto from "node:crypto"
import { SECRET } from "../config"

const DAY = 24 * 60 * 60 * 1000

export function issueSessionToken(userId: string, remember: boolean): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + (remember ? 7 * DAY : DAY)
  const payload = `${userId}.${expiresAt}`
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex")
  return { token: `${payload}.${sig}`, expiresAt }
}
