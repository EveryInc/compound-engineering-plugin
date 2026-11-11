export function assertOwner(record, accountId) {
  if (record.accountId !== accountId) {
    throw Object.assign(new Error("Forbidden"), { status: 403 })
  }
}
