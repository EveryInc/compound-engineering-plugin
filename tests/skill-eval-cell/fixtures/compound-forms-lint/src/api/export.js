import fs from "node:fs"

export function exportHandler(file) {
  return fs.readFileSync(file, "utf8")
}
