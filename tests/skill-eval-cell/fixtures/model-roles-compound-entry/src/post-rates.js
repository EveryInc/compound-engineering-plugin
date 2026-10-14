const RETRYABLE = new Set([429, 502, 503, 504])

async function postRates(send, batch, { attempts = 3 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const status = await send(batch)
    if (status >= 200 && status < 300) return { ok: true, duplicate: false }
    if (status === 409) return { ok: true, duplicate: true }
    if (!RETRYABLE.has(status) || attempt === attempts) return { ok: false, status }
  }
}

module.exports = { postRates }
