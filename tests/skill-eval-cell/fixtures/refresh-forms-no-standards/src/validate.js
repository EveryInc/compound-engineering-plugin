export function validate(body) {
  if (!body) throw new Error("missing body")
  return body
}
