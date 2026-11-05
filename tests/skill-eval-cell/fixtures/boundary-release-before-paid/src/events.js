const events = new Map([
  [
    "evt_spring_launch",
    {
      id: "evt_spring_launch",
      title: "Spring Launch Webinar",
      startsAt: "2026-12-03T17:00:00Z",
      priceCents: 2500,
      zoomUrl: "https://zoom.us/j/81234567890",
      zoomPasscode: "launch42",
    },
  ],
])

export function getEvent(eventId) {
  const event = events.get(eventId)
  if (!event) throw new Error(`unknown event: ${eventId}`)
  return event
}
