import { assertOwner } from "./access.js"

export function exportJson(record, accountId) {
  assertOwner(record, accountId)
  return JSON.stringify(record.data)
}
