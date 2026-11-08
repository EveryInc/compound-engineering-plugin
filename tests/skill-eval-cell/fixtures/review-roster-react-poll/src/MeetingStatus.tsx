import { useEffect, useState } from "react"

type Status = { state: "scheduled" | "live" | "ended"; attendees: number; updatedAt: string }

export function MeetingStatus({ meetingId }: { meetingId: string }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/status`)
        if (!res.ok) throw new Error(`status ${res.status}`)
        setStatus(await res.json())
        setError(null)
      } catch (err) {
        setError(String(err))
      }
    }
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [meetingId])

  if (error) return <span className="chip chip-error">Status unavailable</span>
  if (!status) return <span className="chip">Loading…</span>
  return (
    <span className={`chip chip-${status.state}`}>
      {status.state} · {status.attendees} joined
    </span>
  )
}
