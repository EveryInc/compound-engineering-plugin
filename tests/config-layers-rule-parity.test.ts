import { readFile, access } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const REPO_ROOT = path.join(import.meta.dir, "..")
const FIXTURE = path.join(REPO_ROOT, "tests", "fixtures", "ce-config-layers-rule.md")

// Ordinary-key cascade is byte-duplicated into every independent reader
// (skills cannot import siblings). Canonical text lives once in the fixture.
const CONSUMERS = [
  "skills/ce-plan/references/output-mode.md",
  "skills/ce-brainstorm/SKILL.md",
  "skills/ce-ideate/SKILL.md",
  "skills/ce-product-pulse/SKILL.md",
  "skills/ce-sweep/SKILL.md",
  // ce-commit-push-pr resolves the ordinary keys at Step 4, in the reference
  // the body mandates before composition.
  "skills/ce-commit-push-pr/references/compose.md",
  // The Step 5 babysit handoff is a separate reader: `auto_babysit` is consumed
  // there, and a run that reached the gate on Step 4's memory alone handed off
  // against a standing `auto_babysit: false` (#1601).
  "skills/ce-commit-push-pr/references/apply-and-handoff.md",
  // ce-work resolves the ordinary engine keys inside the reference its route-resolution
  // gate mandates before any implementation write.
  "skills/ce-work/references/execution-engines.md",
  "skills/ce-promote/references/spiral-cli.md",
  "skills/ce-code-review/references/cross-model-review.md",
  "skills/ce-doc-review/references/cross-model-review.md",
]

const START = "<!-- ce-config-layers:start -->"
const END = "<!-- ce-config-layers:end -->"

async function canonicalBlock(): Promise<string> {
  const fixture = await readFile(FIXTURE, "utf8")
  const start = fixture.indexOf(START)
  const end = fixture.indexOf(END)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return fixture.slice(start, end + END.length)
}

describe("config-layers rule shared-asset parity", () => {
  test("the fixture defines a single delimited block", async () => {
    const block = await canonicalBlock()
    expect(block.startsWith(START)).toBe(true)
    expect(block.endsWith(END)).toBe(true)
    const fixture = await readFile(FIXTURE, "utf8")
    expect(fixture.split(START).length).toBe(2)
    expect(fixture.split(END).length).toBe(2)
  })

  test("every independent reader contains the canonical block verbatim", async () => {
    const block = await canonicalBlock()
    for (const rel of CONSUMERS) {
      const p = path.join(REPO_ROOT, rel)
      await access(p)
      const content = await readFile(p, "utf8")
      expect(content, `${rel} is missing the config-layers block`).toContain(block)
    }
  })

  test("the canonical block pins its load-bearing clauses", async () => {
    const block = await canonicalBlock()
    expect(block).toContain("config.local.yaml")
    expect(block).toContain("config.yaml")
    expect(block).toContain("Gitignore does not change resolution")
    expect(block).toContain("invalid value continues to the next layer")
    expect(block).toContain("including an empty list or map")
    expect(block).toContain("Do not** use this rule for `docs_root`")
  })

  test("cross-model peer resolution continues past an invalid local scalar", async () => {
    for (const rel of [
      "skills/ce-code-review/references/cross-model-review.md",
      "skills/ce-doc-review/references/cross-model-review.md",
    ]) {
      const content = await readFile(path.join(REPO_ROOT, rel), "utf8")
      expect(content, rel).toContain("invalid value continues to the next layer")
      expect(content, rel).not.toContain("first active value wins")
    }
  })

  test("pulse and sweep first-run on key-unset, not file-missing", async () => {
    const pulse = await readFile(path.join(REPO_ROOT, "skills/ce-product-pulse/SKILL.md"), "utf8")
    const sweep = await readFile(path.join(REPO_ROOT, "skills/ce-sweep/SKILL.md"), "utf8")
    expect(pulse).toContain("`pulse_product_name` is unset after cascade")
    expect(pulse).not.toContain("or config file missing")
    expect(sweep).toContain("`feedback_sources` unset after cascade")
    expect(sweep).not.toContain("Config file missing")
  })
})
