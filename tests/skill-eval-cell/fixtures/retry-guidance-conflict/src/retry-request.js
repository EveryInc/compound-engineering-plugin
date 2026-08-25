import { randomUUID } from "node:crypto"

export async function retryRequest(send, request) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await send({ ...request, request_id: randomUUID() })
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}
