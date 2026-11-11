export function toJson(rows: Record<string, string>[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n");
}
