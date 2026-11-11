export function assertOwner(record, accountId) {
  if (record.accountId !== accountId) throw new Error("Forbidden")
}

export function download(record, accountId, sign) {
  assertOwner(record, accountId)
  return sign(record.id)
}
