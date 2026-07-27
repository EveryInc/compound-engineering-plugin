import { describe, expect, test } from "bun:test"
import fs from "fs"
import path from "path"

const REPO_ROOT = path.join(__dirname, "..")

async function git(args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = await new Response(proc.stdout).text()
  expect(await proc.exited).toBe(0)
  return stdout
}

// A bundled bash/python script: .sh/.py by extension, or extensionless with a
// bash/python shebang. Other-runtime scripts (e.g. a #!/usr/bin/env node file
// run via `node`) are excluded: bash never parses them and node tolerates CRLF.
function isBundledPosixScript(relPath: string): boolean {
  if (relPath.endsWith(".sh") || relPath.endsWith(".py")) return true
  const base = relPath.split("/").pop() || ""
  if (base.includes(".")) return false
  try {
    const firstLine = fs
      .readFileSync(path.join(REPO_ROOT, relPath), "latin1")
      .split("\n", 1)[0]
    return /^#!.*\b(sh|bash|dash|python[0-9.]*)\b/.test(firstLine)
  } catch {
    return false
  }
}

// Bundled scripts are executed by POSIX bash/python; a CRLF checkout breaks
// them before their own logic runs (issue #1251). The fix is .gitattributes
// eol=lf, which governs checkout, so this asserts the resolved eol attribute
// (git check-attr) rather than the current index bytes. That way it fails if
// .gitattributes is removed or a script (including extensionless ones) is left
// uncovered, which a raw byte scan would not catch.
describe("bundled script line endings (#1251)", () => {
  test("every bundled bash/python script resolves to eol=lf", async () => {
    const scripts = (await git(["ls-files", "--", "skills"]))
      .split("\n")
      .filter(Boolean)
      .filter(isBundledPosixScript)

    // Enumeration sanity: the bundled scripts were actually found.
    expect(scripts.length).toBeGreaterThan(30)

    // check-attr -z emits NUL-separated (path, "eol", value) triples.
    const fields = (
      await git(["check-attr", "-z", "eol", "--", ...scripts])
    ).split("\0")
    const offenders: string[] = []
    for (let i = 0; i + 2 < fields.length; i += 3) {
      if (fields[i + 2] !== "lf") {
        offenders.push(`${fields[i]} (eol=${fields[i + 2]})`)
      }
    }

    expect(offenders).toEqual([])
  })
})
