type Row = Record<string, any>

const tables = new Map<string, Map<string, Row>>()

export const db = {
  async get(table: string, id: string): Promise<Row> {
    const row = tables.get(table)?.get(id)
    if (!row) throw new Error(`${table}/${id} not found`)
    return row
  },
  async update(table: string, id: string, patch: Row): Promise<void> {
    const row = await db.get(table, id)
    Object.assign(row, patch)
  },
}
