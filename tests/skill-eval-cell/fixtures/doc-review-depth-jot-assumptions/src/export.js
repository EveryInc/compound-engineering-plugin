import { load } from "./store.js"

export function exportNotes(format) {
  const notes = load()
  if (format === "csv") {
    // Note text is not quoted, so a comma in a note shifts every later column.
    return ["id,text,tag,created", ...notes.map((n) => `${n.id},${n.text},${n.tag ?? ""},${n.created}`)].join("\n") + "\n"
  }
  return notes.map((n) => `- ${n.text}${n.tag ? ` #${n.tag}` : ""}`).join("\n") + "\n"
}
