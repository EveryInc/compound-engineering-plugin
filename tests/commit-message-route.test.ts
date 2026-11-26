import { readdirSync, readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

/**
 * Every commit a skill prescribes passes its message to `git commit -F -` on stdin:
 * a quoted heredoc in bash, a single-quoted here-string piped in PowerShell. The
 * heredoc ends at a delimiter no message line repeats: with `EOF`, a message line
 * reading `EOF` ends it early and the rest runs as shell commands. `-m`
 * interpolates `$` and backticks in both shells, and an unnamed message file let
 * concurrent sessions commit each other's messages. A file that commits also
 * carries the PowerShell route and its encoding line: Windows PowerShell 5.1 pipes
 * ASCII to native programs, turning non-ASCII into `?`, and adds a BOM on a UTF-8
 * console. This guard keeps a skill from drifting back to its own commit route.
 */

const SKILLS_DIR = path.join(import.meta.dir, "..", "skills")
const ENCODING_LINE = "$OutputEncoding = [Console]::InputEncoding = [Text.UTF8Encoding]::new()"

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return markdownFiles(full)
    return entry.name.endsWith(".md") ? [full] : []
  })
}

type Fence = { lang: string; lines: string[] }

function fences(content: string): Fence[] {
  const out: Fence[] = []
  let open: Fence | null = null
  for (const line of content.split("\n")) {
    const marker = line.match(/^\s*```(\S*)\s*$/)
    if (marker && !open) open = { lang: marker[1], lines: [] }
    else if (marker && open) {
      out.push(open)
      open = null
    } else open?.lines.push(line)
  }
  return out
}

const commitLine = /(^|[\s;&|])git commit\b/

const committingFiles = markdownFiles(SKILLS_DIR)
  .map((file) => ({ file: path.relative(SKILLS_DIR, file), fences: fences(readFileSync(file, "utf8")) }))
  .filter(({ fences }) => fences.some((f) => f.lines.some((l) => commitLine.test(l))))

describe("commit message route", () => {
  test("some skill prescribes a commit, so the guard is live", () => {
    expect(committingFiles.length).toBeGreaterThan(0)
  })

  test.each(committingFiles.map(({ file, fences }) => [file, fences] as const))(
    "%s passes every commit message on stdin, with the PowerShell route",
    (_file, fileFences) => {
      for (const fence of fileFences) {
        for (const line of fence.lines.filter((l) => commitLine.test(l))) {
          if (fence.lang === "powershell") expect(line).toMatch(/^'@ \| git commit -F - /)
          else expect(line).toMatch(/git commit -F - .*<<'CE_COMMIT_MESSAGE_END'$/)
        }
      }
      const powershell = fileFences.filter((f) => f.lang === "powershell")
      expect(powershell.some((f) => f.lines[0] === ENCODING_LINE && f.lines.some((l) => commitLine.test(l)))).toBe(true)
    },
  )
})
