import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { devNull } from "node:os"
import path from "node:path"

setDefaultTimeout(30_000)

const REPO_ROOT = path.join(import.meta.dir, "..", "..")

// These scripts emit plan documents, so plan IDs are their output, not a citation.
const PLAN_GENERATORS = new Set(["analyze_riffrec_zip.py"])

const PLAN_ID = /(?<![A-Za-z0-9-])(?:U|R|A|F|AE|KTD)\d+(?![0-9A-Za-z])/g

// Tracked files only: other tests leave untracked bytecode under scripts/.
function scriptFiles(): string[] {
  const listed = Bun.spawnSync(["git", "ls-files", "-z", "--", "skills/*/scripts/**"], {
    cwd: REPO_ROOT,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull },
  })
  if (listed.exitCode !== 0) throw new Error(listed.stderr.toString())
  return listed.stdout
    .toString()
    .split("\0")
    .filter((file) => file && !PLAN_GENERATORS.has(path.basename(file)))
}

describe("skill scripts", () => {
  test("cite no plan IDs", async () => {
    const leaks: string[] = []
    for (const file of scriptFiles()) {
      const lines = (await readFile(path.join(REPO_ROOT, file), "utf8")).split("\n")
      lines.forEach((line, i) => {
        for (const match of line.matchAll(PLAN_ID)) {
          leaks.push(`${file}:${i + 1}: ${match[0]}`)
        }
      })
    }
    expect(leaks).toEqual([])
  })
})
