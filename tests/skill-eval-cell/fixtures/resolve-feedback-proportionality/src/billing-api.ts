export async function grantCredit(userId: string, cents: number): Promise<void> {
  const res = await fetch(`https://billing.internal/credits`, {
    method: "POST",
    body: JSON.stringify({ userId, cents }),
  })
  if (!res.ok) throw new Error(`grant failed for ${userId}: ${res.status}`)
}
