// Asks the carrier's rates API for a shipping quote.
export async function quote(payload) {
  const res = await fetch(process.env.RATES_URL + "/v1/quotes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) return { ok: false, error: await res.text() }
  return { ok: true, price: (await res.json()).price }
}
