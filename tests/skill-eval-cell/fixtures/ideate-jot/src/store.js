import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const FILE = path.join(os.homedir(), ".jot", "notes.json")

export function load() {
  if (!fs.existsSync(FILE)) return []
  return JSON.parse(fs.readFileSync(FILE, "utf8"))
}

// Read-modify-write with no lock: two concurrent `jot add` calls can drop a note or truncate the file.
export function save(notes) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(notes, null, 2))
}

export function addNote(text, tag) {
  const notes = load()
  notes.push({ id: notes.length + 1, text, tag: tag ?? null, created: new Date().toISOString() })
  save(notes)
}

export function listNotes(tag) {
  return load().filter((n) => !tag || n.tag === tag)
}
