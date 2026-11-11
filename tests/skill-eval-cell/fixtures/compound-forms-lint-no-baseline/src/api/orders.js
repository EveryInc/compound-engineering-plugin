import fs from "node:fs"

export async function ordersHandler(file) {
  return fs.promises.readFile(file, "utf8")
}
