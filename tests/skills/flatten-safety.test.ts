import { describe, expect, test } from "bun:test"
import { execFileSync } from "child_process"
import { readFileSync } from "fs"
import { Glob } from "bun"
import path from "path"
import { extractBashBlocks } from "./fenced-blocks"

// Some hosts (observed on Codex) execute a fenced code block by flattening it to a single
// line — every newline becomes a space — before handing it to the shell. A block that is
// valid multi-line can then become a syntax error: `SCRIPT_DIR="..." if [...]` (assignment
// prefix before a reserved word), `fi bash`, or `then X elif` all break. This lint replays
// that transformation on every ```bash block under skills/ and asserts it still parses
// (`bash -n`). Keep blocks flatten-safe by ending each physical line in a separator that
// survives the newline->space swap (`;`, `then`, `else`, `&&`, `|`, ...).
//
// See docs/solutions for the origin (PR #1105). Two block kinds are exempt:
//   - heredocs (`<<EOF`), which are inherently multi-line and never pasted as one line, and
//   - blocks carrying a `# flatten-lint: skip` marker, for the rare intentionally-multi-line
//     case (e.g. an illustrative broken/correct example). Prefer fixing over skipping.
//
// Scope: this catches the syntax-error class only. A flattened `#` comment that swallows a
// following command is a silent no-op, not a parse error, so `bash -n` cannot see it — keep
// executable comments out of runnable blocks (put them in surrounding prose) rather than
// relying on this lint to flag them.

const SKILLS_DIR = path.join(import.meta.dir, "..", "..", "skills")

type Block = { file: string; line: number; body: string }

function isExempt(body: string): boolean {
  if (/<<-?\s*['"]?\w+/.test(body)) return true // heredoc: inherently multi-line
  if (/#\s*flatten-lint:\s*skip/.test(body)) return true
  return false
}

/** Replace <angle-bracket placeholders> with a path-like token so `bash -n` sees valid words. */
function withPlaceholders(body: string): string {
  return body.replace(/<[^>\n]*>/g, "/tmp/ph")
}

function parsesWhenFlattened(body: string): { ok: true } | { ok: false; error: string } {
  const flattened = withPlaceholders(body).replace(/\n/g, " ")
  try {
    execFileSync("bash", ["-n"], { input: flattened, stdio: ["pipe", "pipe", "pipe"] })
    return { ok: true }
  } catch (e) {
    const stderr = (e as { stderr?: Buffer }).stderr?.toString().trim() ?? String(e)
    return { ok: false, error: stderr.split("\n").pop() ?? stderr }
  }
}

const allBlocks: Block[] = [...new Glob("**/*.md").scanSync({ cwd: SKILLS_DIR })]
  .sort()
  .flatMap((rel) =>
    extractBashBlocks(readFileSync(path.join(SKILLS_DIR, rel), "utf8")).map((b) => ({ file: rel, ...b })),
  )

describe("skills bash blocks are flatten-safe", () => {
  test("every ```bash block still parses when flattened to a single line", () => {
    expect(allBlocks.length).toBeGreaterThan(0)

    const failures = allBlocks
      .filter((b) => !isExempt(b.body))
      .map((b) => ({ b, result: parsesWhenFlattened(b.body) }))
      .filter((r) => !r.result.ok)
      .map((r) => `  ${r.b.file}:${r.b.line} — ${(r.result as { error: string }).error}`)

    expect(
      failures,
      failures.length
        ? `These ${failures.length} bash block(s) break when a host flattens them to one line ` +
            `(newline->space). End each physical line in a separator (';', 'then', 'else', ...) ` +
            `or add a '# flatten-lint: skip' marker if it is legitimately multi-line:\n${failures.join("\n")}`
        : undefined,
    ).toEqual([])
  })
})
