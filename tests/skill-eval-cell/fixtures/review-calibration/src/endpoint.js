import { assertOwner } from "./export.js"

export async function endpoint(record, accountId, sign) {
  if (record.accountId !== accountId) throw new Error("Forbidden")
  return sign(record.id)
}
