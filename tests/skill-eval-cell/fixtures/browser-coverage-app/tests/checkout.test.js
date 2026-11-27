import request from "supertest"
import { describe, expect, test, vi } from "vitest"

vi.mock("../src/payments.js", () => ({
  charge: vi.fn().mockResolvedValue({ ok: true, error: null }),
}))

const { app } = await import("../src/app.js")

describe("checkout", () => {
  test("places the order when the charge succeeds", async () => {
    const res = await request(app).post("/checkout").type("form").send({ card: "4242424242424242", total: "19.99" })
    expect(res.status).toBe(200)
    expect(res.text).toContain("Order placed")
  })
})
