import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_DIR = path.join(process.cwd(), "skills/ce-ideate")
const SKILL_BODY = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8")
const POST_IDEATION_BODY = readFileSync(
  path.join(SKILL_DIR, "references/post-ideation-workflow.md"),
  "utf8",
)
const UNIVERSAL_BODY = readFileSync(
  path.join(SKILL_DIR, "references/universal-ideation.md"),
  "utf8",
)

// Issue #1626: ideation HTML landed untracked in the user's docs tree with no
// stated lifecycle. The artifact is read-once (unlike durable plans and
// solutions), so the skill must say so and must keep the directory out of
// git status in repo mode.
describe("ce-ideate ideation artifact lifecycle", () => {
  test("SKILL.md states the read-once, not-committed lifecycle", () => {
    expect(SKILL_BODY).toMatch(/read-once/)
    expect(SKILL_BODY).toMatch(/not meant to be committed/)
    expect(SKILL_BODY).toMatch(/gitignored/)
  })

  test("the Phase 4.1 write step gitignores the ideation directory in repo mode", () => {
    expect(POST_IDEATION_BODY).toMatch(/lifecycle/i)
    expect(POST_IDEATION_BODY).toMatch(/\.gitignore/)
    // Composed from the resolved root, never a literal docs/ path (docs-root-literals).
    expect(POST_IDEATION_BODY).toMatch(/`<root>\/ideation\/`/)
    expect(POST_IDEATION_BODY).not.toMatch(/docs\/ideation/)
  })

  test("the gitignore edit is part of the write, not a silent side effect", () => {
    expect(POST_IDEATION_BODY).toMatch(/do not skip it silently/i)
    expect(POST_IDEATION_BODY).toMatch(/summary line/)
  })

  test("universal-ideation points at the owning gitignore step", () => {
    expect(UNIVERSAL_BODY).toMatch(/read-once/)
    expect(UNIVERSAL_BODY).toMatch(/Phase 4\.1 owns the gitignore step/)
  })
})
