#!/usr/bin/env node
import { addNote, listNotes } from "./store.js"
import { search } from "./search.js"
import { exportNotes } from "./export.js"

const [cmd, ...args] = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }

if (cmd === "add") addNote(args[0], flag("tag"))
else if (cmd === "list") for (const n of listNotes(flag("tag"))) console.log(`${n.id}  ${n.text}`)
else if (cmd === "search") for (const n of search(args[0])) console.log(`${n.id}  ${n.text}`)
else if (cmd === "export") process.stdout.write(exportNotes(flag("format") ?? "md"))
else { console.error("usage: jot add|list|search|export"); process.exit(1) }
