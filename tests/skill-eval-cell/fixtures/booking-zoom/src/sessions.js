export const sessions = new Map([
  ["s1", { id: "s1", host: "Ada", startsAt: "2026-12-01T17:00:00Z", priceCents: 4500, joinUrl: "https://meet.example/s1", passcode: "482913" }],
])

export function getSession(id) {
  const session = sessions.get(id)
  if (!session) throw new Error(`no session ${id}`)
  return session
}
