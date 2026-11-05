import { db } from "../db"

export async function upcomingForUser(userId: string) {
  return db.many("SELECT id, slot, status FROM bookings WHERE user_id = $1 AND slot > now() ORDER BY slot", [userId])
}
