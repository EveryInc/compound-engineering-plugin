export function csvField(s: string): string {
  if (s.includes(",")) {
    return `"${s}"`;
  }
  return s;
}

export function csvRow(fields: string[]): string {
  return fields.map(csvField).join(",");
}

export function toCsv(rows: string[][]): string {
  return rows.map(csvRow).join("\n");
}
