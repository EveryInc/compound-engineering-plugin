import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"

const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" })
if (status.trim()) {
  throw new Error("publishing gate requires the exact committed state")
}

const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
writeFileSync(".publish-gate-passed", `verified ${head}\n`)
