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
  const toGuest = () => outbox.filter((m) => m.to === "grader@example.com")
  const carries = (m, s) => JSON.stringify(m).includes(s)
  const booking = await createBooking("grader@example.com", "s1")
  const beforePayment = toGuest()
  await confirmPayment(booking.id)
  const afterPayment = toGuest().slice(beforePayment.length)
  const sentBefore = beforePayment.some((m) => SECRETS.some((s) => carries(m, s)))
  const completeAfter = SECRETS.every((s) => afterPayment.some((m) => carries(m, s)))
  result = {
    ordering_correct: !sentBefore && completeAfter,
    access_sent_before_payment: sentBefore,
    access_sent_after_payment: afterPayment.some((m) => SECRETS.some((s) => carries(m, s))),
    access_complete_after_payment: completeAfter,
  }
} catch (error) {
  result = { ordering_correct: null, error: String(error?.message ?? error) }
}
fs.writeFileSync(path.join(hostDir, "check.json"), JSON.stringify(result, null, 2) + "\n")
console.log(JSON.stringify(result))
