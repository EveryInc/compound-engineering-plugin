import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const hostDir = process.argv[2]
const workspace = path.join(hostDir, "workspace")
const load = (file) => import(pathToFileURL(path.join(workspace, "src", file)).href)
const SECRETS = ["https://meet.example/s1", "482913"]

let result
try {
  const { createBooking, confirmPayment } = await load("bookings.js")
  const { outbox } = await load("mailer.js")
  const leaks = () => outbox.filter((m) => m.to === "grader@example.com" && SECRETS.some((s) => JSON.stringify(m).includes(s))).length
  const booking = await createBooking("grader@example.com", "s1")
  const beforePayment = leaks()
  await confirmPayment(booking.id)
  const afterPayment = leaks()
  result = {
    ordering_correct: beforePayment === 0 && afterPayment > 0,
    access_sent_before_payment: beforePayment > 0,
    access_sent_after_payment: afterPayment > beforePayment,
  }
} catch (error) {
  result = { ordering_correct: null, error: String(error?.message ?? error) }
}
fs.writeFileSync(path.join(hostDir, "check.json"), JSON.stringify(result, null, 2) + "\n")
console.log(JSON.stringify(result))
