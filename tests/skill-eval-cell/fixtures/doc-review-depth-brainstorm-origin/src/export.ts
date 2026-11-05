import fs from "node:fs"

export function exportNotes(notes: { title: string; body: string }[], dir: string) {
  for (const n of notes) {
    fs.writeFileSync(`${dir}/${n.title}.md`, n.body)
  }
}
