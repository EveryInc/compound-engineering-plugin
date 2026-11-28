import request from "supertest"
import { describe, expect, test } from "vitest"
import { app } from "../src/app.js"

describe("settings", () => {
  test("rejects an invalid email and keeps the form", async () => {
    const res = await request(app).post("/settings").type("form").send({ email: "not-an-email" })
    expect(res.status).toBe(422)
    expect(res.text).toContain("Email is invalid")
    expect(res.text).toContain('name="email"')
  })

  test("saves a valid email", async () => {
    const res = await request(app).post("/settings").type("form").send({ email: "a@b.co" })
    expect(res.status).toBe(200)
    expect(res.text).toContain("Saved")
  })
})
