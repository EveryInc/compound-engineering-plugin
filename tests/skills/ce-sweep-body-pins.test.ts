import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import path from "path"

// ce-sweep's body was cut to fit Codex's 8000-byte skill prompt budget
// (tests/codex-skill-prompt-budget.test.ts), with the per-phase detail relocated
// into references/run.md. Split the guards by load-time: rules that must control
// behavior from the always-loaded window are pinned against SKILL.md, and rules
// that moved are pinned against references/run.md so a later edit cannot quietly
// delete them from the file the run actually loads.
const SKILL_DIR = path.join(import.meta.dir, "..", "..", "skills", "ce-sweep")
const body = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8")

// Phase 2's detail moved into references/run.md, the one reference Phase 2 is
// required to load, so those invariants are pinned against that file rather than
// a concatenation of every reference - a sibling reference that happens to
// mention the same token must not stand in for the rule the run actually reads.
const runMd = readFileSync(path.join(SKILL_DIR, "references", "run.md"), "utf8")

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
    expect(body.indexOf("Read `references/run.md` now and follow it")).toBeLessThan(
      body.indexOf("Ordering invariant"),
    )
  })
})

describe("ce-sweep relocated invariants stay in the reference Phase 2 loads", () => {

  for (const invariant of [
    // 2a
    "STALE-RECLAIMED",
    "Only once your lease is pushed and confirmed do you touch a source.",
    // 2b
    "Personas report facts and never advance cursors.",
    // 2c
    "If the count exceeds `sweep_ack_cap`",
    "do NOT ack, and flag it prominently in the summary",
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
    test(`run.md keeps: ${invariant.slice(0, 48)}`, () => {
      expect(runMd).toContain(invariant)
    })
  }
})
