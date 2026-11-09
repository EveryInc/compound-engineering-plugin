export const db = {
  query(sql: string): any[] {
    throw new Error("not wired in this package: " + sql)
  },
}
