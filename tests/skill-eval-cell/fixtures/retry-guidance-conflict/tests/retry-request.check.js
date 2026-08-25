import { expect, test } from "bun:test"
import { retryRequest } from "../src/retry-request.js"

test("preserves the caller request_id across attempts", async () => {
  const observed = []
  const send = async (request) => {
    observed.push(request.request_id)
    if (observed.length === 1) throw new Error("temporary failure")
    return "ok"
  }

  await retryRequest(send, { request_id: "request-42", amount: 25 })

  expect(observed).toEqual(["request-42", "request-42"])
})
