import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

// Regression guard: ce-noslop is the single source for anti-slop prose rules.
// Siblings invoke it at their composition point instead of carrying their own
// STE paragraph or hedge word list. The defended regressions are a sibling
// losing its invocation line, a removed generic block creeping back in, and
// the kernel growing past the bound that keeps it cheap to load on every
// composing run.

const SKILL_DIR = path.join(process.cwd(), "skills/ce-noslop")
const KERNEL_BYTE_LIMIT = 4096
const INVOCATION_TOKEN = "through the `ce-noslop` skill"

function readRepoFile(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8")
}

/** Byte size as a Windows checkout with CRLF line endings would inject it. */
function crlfByteSize(contents: string): number {
  const lf = contents.replace(/\r\n/g, "\n")
  return Buffer.byteLength(lf, "utf8") + (lf.match(/\n/g)?.length ?? 0)
}

// Siblings that compose prose and write it through ce-noslop at that point.
const CONSOLIDATION_SET = [
  "skills/ce-commit-push-pr/references/pr-description-writing.md",
  "skills/ce-code-review/references/finish-review.md",
  "skills/ce-plan/references/plan-sections.md",
  "skills/ce-brainstorm/references/brainstorm-sections.md",
  "skills/ce-promote/SKILL.md",
  "skills/ce-resolve-pr-feedback/references/evaluation-rubric.md",
]

// Siblings that own a presentation contract and keep it, with a pointer to ce-noslop.
const PRESENTATION_CONTRACTS = [
  "skills/ce-doc-review/references/rendering-floor.md",
  "skills/ce-pov/references/method.md",
  "skills/lfg/references/shipping.md",
  "skills/ce-babysit-pr/references/report.md",
]

// Generic blocks deleted from the consolidation set. Domain rules in the same
// files (commit subject form, value-first lead, severity vocabulary, per-channel
// register) stay and are pinned by each sibling's own contract test.
const REMOVED_SUBSTRINGS: Array<[string, string[]]> = [
  [
    "ASD-STE100",
    [
      "skills/ce-commit-push-pr/references/pr-description-writing.md",
      "skills/ce-code-review/references/finish-review.md",
      "skills/ce-plan/references/plan-sections.md",
      "skills/ce-brainstorm/references/brainstorm-sections.md",
      "skills/ce-doc-review/references/rendering-floor.md",
    ],
  ],
  ["thrilled/excited to announce", ["skills/ce-promote/SKILL.md"]],
  [
    '"Critically", "deliberately", "explicitly"',
    [
      "skills/ce-plan/references/plan-sections.md",
      "skills/ce-brainstorm/references/brainstorm-sections.md",
    ],
  ],
]

describe("ce-noslop kernel", () => {
  test(`SKILL.md stays under ${KERNEL_BYTE_LIMIT} bytes (CRLF-adjusted)`, () => {
    const size = crlfByteSize(readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8"))
    expect(size).toBeLessThan(KERNEL_BYTE_LIMIT)
  })

  test("patterns.md rule numbers are strictly increasing with no duplicates", () => {
    const catalog = readFileSync(path.join(SKILL_DIR, "references/patterns.md"), "utf8")
    const numbers = [...catalog.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]))
    expect(numbers.length).toBeGreaterThan(0)
    for (let i = 1; i < numbers.length; i++) {
      expect(
        numbers[i],
        `rule ${numbers[i]} follows rule ${numbers[i - 1]}; numbers are stable ids and must only increase`,
      ).toBeGreaterThan(numbers[i - 1])
    }
  })
})

describe("ce-noslop distribution", () => {
  for (const rel of CONSOLIDATION_SET) {
    test(`${rel} invokes ce-noslop at its composition point`, () => {
      expect(readRepoFile(rel)).toContain(INVOCATION_TOKEN)
    })
  }

  for (const rel of PRESENTATION_CONTRACTS) {
    test(`${rel} points to ce-noslop`, () => {
      expect(readRepoFile(rel)).toContain(INVOCATION_TOKEN)
    })
  }

  for (const [needle, files] of REMOVED_SUBSTRINGS) {
    for (const rel of files) {
      test(`${rel} no longer carries the generic block: ${needle}`, () => {
        expect(readRepoFile(rel)).not.toContain(needle)
      })
    }
  }
})
