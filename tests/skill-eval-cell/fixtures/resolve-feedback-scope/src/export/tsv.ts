export function tsvRow(fields: string[]): string {
  return fields.join("\t");
}

export function toTsv(rows: string[][]): string {
  return rows.map(tsvRow).join("\n");
}
