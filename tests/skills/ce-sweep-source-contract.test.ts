import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SOURCES_DIR = path.join(
  process.cwd(),
  "skills/ce-sweep/references/sources",
)

// The five section headings every source persona must expose verbatim. The
// orchestrator seeds a generic subagent with one of these personas and relies
// on this fixed shape (probe -> fetch -> map -> untrusted handling -> tool
// limits) to reason about what the source returned. A persona that renames or
// drops a heading silently breaks that contract.
const REQUIRED_SECTIONS = [
  "## Invocation Contract",
  "## Availability Probe",
  "## Fetch Guidance",
  "## Untrusted Input Handling",
  "## Tool Guidance",
]

// Per-persona exact degrade/skip sentences. These are the orchestrator's
// branch signals: on missing write scope a source degrades to read-only
// ingest (items become `ack_deferred`); on missing read tools the source is
// skipped. A paraphrase would break the run loop's detection, so they must
// appear byte-for-byte (em dash included).
const PERSONAS = {
  "slack.md": {
    bails: [
      "Slack write capability unavailable — source degrades to read-only ingest; items will be marked ack_deferred.",
      "Slack tools unavailable — source skipped this run.",
    ],
  },
  "github-issues.md": {
    bails: [
      "GitHub write capability unavailable — source degrades to read-only ingest; items will be marked ack_deferred.",
      "GitHub tools unavailable — source skipped this run.",
    ],
  },
  "email.md": {
    bails: [
      "Email tools unavailable — source skipped this run.",
      "Email acknowledgment primitive unavailable — items from this source are always marked ack_deferred; the orchestrator records acknowledgment in state only.",
    ],
  },
} as const

function read(name: string): string {
  return readFileSync(path.join(SOURCES_DIR, name), "utf8")
}

describe("ce-sweep source persona contract", () => {
  for (const [name, spec] of Object.entries(PERSONAS)) {
    describe(name, () => {
      const body = read(name)

      test("exposes all five exact contract section headings", () => {
        for (const heading of REQUIRED_SECTIONS) {
          expect(body).toContain(heading)
        }
      })

      test("contains the exact degrade / skip bail sentences verbatim", () => {
        for (const sentence of spec.bails) {
          expect(body).toContain(sentence)
        }
      })

      test("declares the cursor hands-off invariant with no cursor-mutation language", () => {
        // KTD7: personas report facts; the orchestrator's bundled state script
        // owns cursor advancement. Each persona must state this invariant
        // verbatim and must never instruct itself to advance a cursor.
        expect(body).toContain("You never advance cursors.")
        expect(body).not.toMatch(/advance(s|d)? the cursor|cursor-advance/i)
      })

      test("forbids posting, sending, or replying at the source", () => {
        // Writes are limited to the configured ack/close-out action only; no
        // messages, comments, replies, or sends.
        expect(body).toMatch(/never post|never send|never repl/i)
      })

      test("carries no YAML frontmatter (prompt asset, not an agent def)", () => {
        expect(body.startsWith("---")).toBe(false)
      })
    })
  }

  test("email persona is marked experimental", () => {
    expect(read("email.md").toLowerCase()).toContain("experimental")
  })
})
