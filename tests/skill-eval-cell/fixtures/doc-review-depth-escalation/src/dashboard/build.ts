import { upcomingForUser } from "../bookings/repo"

export async function buildDashboard(userId: string) {
  return { upcoming: await upcomingForUser(userId) }
}
