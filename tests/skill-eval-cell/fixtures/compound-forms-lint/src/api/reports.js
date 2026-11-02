import fs from "node:fs"

export function reportsHandler(file) {
  return fs.readFileSync(file, "utf8")
}
