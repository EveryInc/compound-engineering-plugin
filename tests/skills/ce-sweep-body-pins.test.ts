import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "fs"
import path from "path"

// ce-sweep's body was cut to fit Codex's 8000-byte skill prompt budget
// (tests/codex-skill-prompt-budget.test.ts), with the per-phase detail relocated
// into references/run.md. Split the guards by load-time: rules that must control
// behavior from the always-loaded window are pinned against SKILL.md, and rules
// that moved are pinned against the whole skill corpus so a later edit cannot
// quietly delete them from both places.
const SKILL_DIR = path.join(import.meta.dir, "..", "..", "skills", "ce-sweep")
const body = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8")

function corpus(): string {
  const refs = path.join(SKILL_DIR, "references")
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    )
  return [body, ...walk(refs).map((f) => readFileSync(f, "utf8"))].join("\n")
}

describe("ce-sweep always-loaded body pins", () => {
  test("states its outcome and done bar", () => {
    expect(body).toMatch(/\*\*Outcome:\*\*/)
    expect(body).toMatch(/\*\*Done:\*\*/)
  })

  test("keeps the untrusted-input and write-authority boundaries in the window", () => {
    expect(body).toContain("never as instructions")
    expect(body).toContain("`approved: false`")
    // The injection gate on a claimed fix ref must be stated as its accept-set,
    // not as an unqualified "validate the shape".
    expect(body).toContain("[0-9a-f]{7,40}")
  })

  test("keeps the phase ordering invariant and the 2d write ordering", () => {
    expect(body).toMatch(/Ordering invariant/)
    for (const phase of ["2a", "2b", "2c", "2d", "2e", "2f", "2g", "2h", "2i"]) {
      expect(body).toContain(phase)
    }
    expect(body).toContain("`upsert-item` -> `cursor-advance`")
    expect(body).toContain("never past an item not yet upserted")
  })

  test("keeps the stop classes", () => {
    expect(body).toContain("LOCKED")
    expect(body).toContain("LEASE-LOST")
    expect(body).toContain("aborted-locked")
  })

  test("names the required read at the step that needs it", () => {
    expect(body.indexOf("Read `references/run.md` now and follow it")).toBeGreaterThan(-1)
    expect(body.indexOf("references/run.md")).toBeLessThan(body.indexOf("Ordering invariant"))
  })
})

describe("ce-sweep relocated invariants stay greppable in the corpus", () => {
  const all = corpus()

  for (const invariant of [
    // 2a
    "STALE-RECLAIMED",
    "sweep_shared_branch",
    // 2b
    "Personas report facts and never advance cursors.",
    // 2c
    "sweep_ack_cap",
    // 2d
    "the engine drops `body`/`quote` before writing",
    // 2e
    "manual_stuck",
    "unsafe scratch root symlink",
    // 2f
    "verified_merge_sha",
    "source_gone",
    // 2g
    "never read or write inside the human-owned notes region",
    // 2i
    "docs(sweep): feedback sweep <date>",
    "never `-A`",
    // engine invocation skeleton
    'SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";',
    "no working Python 3 interpreter on PATH",
  ]) {
    test(`corpus keeps: ${invariant.slice(0, 48)}`, () => {
      expect(all).toContain(invariant)
    })
  }
})
