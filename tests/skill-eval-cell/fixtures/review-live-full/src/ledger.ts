export interface Entry {
  invoiceId: number
  amountCents: number
}

export interface Db {
  query(sql: string, params: unknown[]): Promise<{ rows: unknown[] }>
}

export async function postEntries(db: Db, entries: Entry[]): Promise<number> {
  let posted = 0
  for (const entry of entries) {
    if (entry.amountCents === 0) continue
    await db.query("INSERT INTO ledger_entries (invoice_id, amount_cents) VALUES ($1, $2)", [entry.invoiceId, entry.amountCents])
    posted += 1
  }
  return posted
}

export async function balance(db: Db, invoiceId: number): Promise<number> {
  const result = await db.query("SELECT SUM(amount_cents) AS total FROM ledger_entries WHERE invoice_id = $1", [invoiceId])
  const row = result.rows[0] as { total: string | null } | undefined
  return row && row.total ? Number(row.total) : 0
}
