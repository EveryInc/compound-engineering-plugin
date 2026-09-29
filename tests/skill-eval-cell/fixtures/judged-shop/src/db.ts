import { Pool } from "pg"
export const db = { query: async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rows }
const pool = new Pool()
