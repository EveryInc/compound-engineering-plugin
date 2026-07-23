import { readFileSync } from "fs"
import { readdirSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const REPO_ROOT = path.join(import.meta.dir, "..")
const SKILLS_ROOT = path.join(REPO_ROOT, "skills")

// CE-owned artifact subdirectories. A skill must compose these under the
// resolved `<root>` (see tests/fixtures/docs-root-rule.md), never as a literal
// `docs/<subdir>` path. `brainstorms` and `specs` are intentionally excluded:
// brainstorms is a legacy read-only location (and a legacy frontmatter-field
// signal), and specs is not a CE-written artifact type — both may appear literally.
const IN_SCOPE_SUBDIRS = [
  "solutions",
  "plans",
  "ideation",
  "explainers",
  "residual-review-findings",
  "pulse-reports",
  "dogfood-reports",
  "feedback-sweep",
  "personas",
]

const LITERAL = new RegExp(`docs/(${IN_SCOPE_SUBDIRS.join("|")})(?:/|\\b)`)

// Files that carry skill content the agent reads or the runtime executes.
const SCANNED_EXTS = new Set([".md", ".py", ".sh", ".yaml", ".yml"])

// Comment markers by extension. A literal is allowlisted only when it sits
// inside a comment on its line: the two legitimate cases are bibliographic
// citations to this plugin's own learning docs (elevation-dispatch.sh) and
// default-path documentation in the config template — both in `#` comments.
// Markdown uses `#` for headings (not comments), so `.md` gets no `#` allowance;
// there is no legitimate literal in any `.md` file today, and a heading naming a
// hardcoded artifact path should fail.
const COMMENT_MARKERS: Record<string, string[]> = {
  ".sh": ["#"],
  ".py": ["#"],
  ".yaml": ["#"],
  ".yml": ["#"],
  ".md": ["<!--"],
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (SCANNED_EXTS.has(path.extname(entry.name))) out.push(full)
  }
  return out
}

function inComment(line: string, matchIndex: number, ext: string): boolean {
  for (const marker of COMMENT_MARKERS[ext] ?? []) {
    const c = line.indexOf(marker)
    if (c !== -1 && c < matchIndex) return true
  }
  return false
}

describe("docs-root literal-path guard", () => {
  test("no skill composes a hardcoded docs/<subdir> artifact path outside a comment", () => {
    const offenders: string[] = []
    for (const file of walk(SKILLS_ROOT)) {
      const ext = path.extname(file)
      const lines = readFileSync(file, "utf8").split("\n")
      lines.forEach((line, i) => {
        const m = LITERAL.exec(line)
        if (!m) return
        if (inComment(line, m.index, ext)) return
        offenders.push(`${path.relative(REPO_ROOT, file)}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(
      offenders,
      `Hardcoded artifact paths must compose under the resolved <root>:\n${offenders.join("\n")}`,
    ).toEqual([])
  })

  test("the guard actually fires on a non-comment literal", () => {
    // Guard against the guard silently passing: a bare docs/<subdir> in prose
    // must be detected, and the same path inside a comment must not.
    const proseLine = "Write the learning to docs/solutions/foo.md"
    const commentLine = "# see docs/solutions/skill-design/note.md"
    expect(LITERAL.test(proseLine)).toBe(true)
    expect(inComment(proseLine, LITERAL.exec(proseLine)!.index, ".md")).toBe(false)
    expect(inComment(commentLine, LITERAL.exec(commentLine)!.index, ".sh")).toBe(true)
  })
})
