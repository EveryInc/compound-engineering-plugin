import { describe, expect, test } from "bun:test"
import path from "path"

const REPO_ROOT = path.join(__dirname, "..")

// Bundled .sh/.py scripts are executed by POSIX bash/python. A CRLF-committed
// script fails under WSL/Linux bash before its own logic runs ($'\r': command
// not found), and the file-existence guards skills use don't catch it because
// the file exists — it just doesn't parse (issue #1251). .gitattributes pins
// these to eol=lf; this guards the invariant against a future CRLF commit.
//
// The check reads the git index eol (i/...), not the working tree (w/...): the
// index is what ships and is identical on every platform, whereas the working
// tree eol depends on the checkout's core.autocrlf.
describe("bundled script line endings (#1251)", () => {
  test("no tracked .sh/.py script has CRLF line endings in the index", async () => {
    const proc = Bun.spawn(
      ["git", "ls-files", "--eol", "--", "*.sh", "*.py"],
      { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" }
    )
    const stdout = await new Response(proc.stdout).text()
    expect(await proc.exited).toBe(0)

    const offenders: string[] = []
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue
      // Format: "i/<eol>\tw/<eol>\tattr/<attr>\t<path>"
      const [attrs, filePath] = line.split("\t")
      const indexEol = attrs.trim().split(/\s+/)[0] // e.g. "i/lf", "i/crlf", "i/none"
      if (indexEol === "i/crlf" || indexEol === "i/mixed") {
        offenders.push(`${filePath} (${indexEol})`)
      }
    }

    expect(offenders).toEqual([])
  })
})
