import { parseCents } from "../money.js"

export function orderTotal(lines) {
  return lines.reduce((total, line) => total + parseCents(line.amount), 0)
}
