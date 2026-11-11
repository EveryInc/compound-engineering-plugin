import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"

// Every route validates its input; an unvalidated body crashed a worker.
test("each route file calls validate()", () => {
  for (const file of readdirSync("src/routes")) {
    expect(readFileSync(`src/routes/${file}`, "utf8"), `${file} must call validate()`).toContain("validate(")
  }
})
