export type Cell = string | number | null | undefined

export type Align = "left" | "right"

export interface TableOptions {
  headers: string[]
  align?: Align[]
  padding?: number
}

function cellText(cell: Cell): string {
  if (cell === null || cell === undefined) return ""
  return String(cell)
}

function widths(headers: string[], rows: Cell[][]): number[] {
  const out = headers.map((h) => h.length)
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = cellText(cell).length
      if (len > (out[i] ?? 0)) out[i] = len
    })
  }
  return out
}

function pad(text: string, width: number, align: Align, padding: number): string {
  const gap = " ".repeat(padding)
  const fill = " ".repeat(Math.max(0, width - text.length))
  return align === "right" ? gap + fill + text + gap : gap + text + fill + gap
}

export function renderTable(rows: Cell[][], options: TableOptions): string {
  const padding = options.padding ?? 1
  const cols = widths(options.headers, rows)
  const align = options.align ?? options.headers.map(() => "left" as Align)
  const line = (cells: Cell[]) =>
    "|" + cells.map((c, i) => pad(cellText(c), cols[i], align[i] ?? "left", padding)).join("|") + "|"
  const rule = "+" + cols.map((w) => "-".repeat(w + padding * 2)).join("+") + "+"
  const body = rows.map(line)
  return [rule, line(options.headers), rule, ...body, rule].join("\n")
}

export function renderList(items: string[]): string {
  if (items.length === 0) return "(none)"
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n")
}
