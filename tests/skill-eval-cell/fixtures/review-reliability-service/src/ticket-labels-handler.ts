// HTTP handler for POST /tickets/:id/escalate, called by the support UI on every escalation.
// Runs in the shared api-gateway service (a fixed pool of 32 request workers).

export async function escalateTicket(ticketId: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`https://support.internal/api/tickets/${ticketId}/labels`, {
    method: "PUT",
    body: JSON.stringify({ labels: ["escalated"] }),
  })
  if (!res.ok) return { status: 502, body: `escalation failed: ${res.status}` }
  return { status: 200, body: "ok" }
}
