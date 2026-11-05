import { db } from "../db"

export type Profile = { userId: string; displayName: string; timezone: string }

export async function getProfile(userId: string): Promise<Profile> {
  const row = await db.one("SELECT user_id, display_name, timezone FROM profiles WHERE user_id = $1", [userId])
  return { userId: row.user_id, displayName: row.display_name, timezone: row.timezone }
}
