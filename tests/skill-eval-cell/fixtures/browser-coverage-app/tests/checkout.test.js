import request from "supertest"
import { describe, expect, test, vi } from "vitest"

vi.mock("../src/rates.js", () => ({
  quote: vi.fn().mockResolvedValue({ ok: true, price: "4.50" }),
}))

const { app } = await import("../src/app.js")

describe("checkout", () => {
  test("shows the shipping quote for a postcode", async () => {
    const res = await request(app).post("/checkout").type("form").send({ postcode: "94107" })
    expect(res.status).toBe(200)
    expect(res.text).toContain("Shipping: 4.50 USD")
  })
})
