import { validate } from "../validate.js"

export function createOrder(body) {
  return validate(body)
}
