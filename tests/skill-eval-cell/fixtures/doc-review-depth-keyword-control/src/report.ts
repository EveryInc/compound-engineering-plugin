export type Section = { title: string; rows: string[] }

export function renderReport(sections: Section[]): string {
  return sections.map((s) => `## ${s.title}\n${s.rows.join("\n")}`).join("\n\n")
}
