// Calls the payment provider's HTTP API.
export async function charge(payload) {
  const res = await fetch(process.env.PAYMENTS_URL + "/v1/charges", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  })
  return { ok: res.ok, error: res.ok ? null : await res.text() }
}
