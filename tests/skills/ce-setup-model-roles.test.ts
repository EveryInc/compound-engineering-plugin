import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"
import { parseFrontmatter } from "../../src/utils/frontmatter"

// ce-setup's model role flow is the one place setup writes a `model_roles` map,
// and the one place it may write the personal `config.local.yaml`. These guards
// pin the contract across its surfaces: the SKILL.md trigger, the procedure
// reference it points at, the Phase 2 sentence that used to forbid the personal
// file outright, and the guides. They pin tokens, not sentences. Whether a run
// actually offers reachable models and holds the write for approval is a judged
// conversation eval, not a string test.
//
// The body's size is not asserted here: tests/codex-skill-prompt-budget.test.ts
// already fails any SKILL.md over the 8,000-byte bound, ce-setup included.

const REPO = process.cwd()
const read = (rel: string) => readFileSync(path.join(REPO, rel), "utf8")

const SKILL = read("skills/ce-setup/SKILL.md")
const REFERENCE_PATH = "skills/ce-setup/references/model-roles-setup.md"

describe("ce-setup model role flow contract", () => {
  test("SKILL.md names the models trigger and routes to the reference", () => {
    expect(parseFrontmatter(SKILL).data["argument-hint"]).toContain("models")

    const start = SKILL.indexOf("## Model Roles")
    expect(start, "## Model Roles section").toBeGreaterThan(-1)
    const section = SKILL.slice(start, SKILL.indexOf("\n## ", start + 1))
    expect(section).toContain("`models`")
    expect(section).toContain("references/model-roles-setup.md")
    expect(section).toMatch(/in place of Phases 1-2/)
    expect(section).toMatch(/only after the user approves/)
  })

  test("the reference states both targets and their reach, the marker, and the write gates", () => {
    const reference = read(REFERENCE_PATH)
    // Current state comes from the bundled resolver, never from re-parsing the files by hand.
    expect(reference).toMatch(/model-role-resolve\.py" --all/)
    // R17: both targets, each with its reach.
    expect(reference).toContain(".compound-engineering/config.yaml")
    expect(reference).toContain("config.local.yaml")
    expect(reference).toMatch(/every worktree, clone, and cloud session/)
    expect(reference).toMatch(/this checkout only/)
    // R19: a model the flow could not confirm is written marked, and `inherit` is always offered.
    expect(reference).toContain("# unconfirmed")
    expect(reference).toContain("`inherit`")
    // The two gates the skill-level done bar cannot protect.
    expect(reference).toMatch(/Write only on approval/)
    expect(reference).toMatch(/non-interactive[^.]*(wrote nothing|writes nothing)/)
    expect(reference).toMatch(/unrelated setting/)
    // Creating the personal file reuses the gitignore rule Phase 2 already owns.
    expect(reference).toContain("references/repo-fixes.md")
  })

  test("Phase 2 scopes its never-create rule to its own step and names the flow that may write the file", () => {
    const fixes = read("skills/ce-setup/references/repo-fixes.md")
    // The bare sentence was true only while no part of setup wrote the personal file.
    expect(fixes).not.toMatch(/^Do not create `config\.local\.yaml`\.$/m)
    expect(fixes).toContain("Do not create `config.local.yaml` in this step")
    expect(fixes).toContain("references/model-roles-setup.md")
  })

  test("the guides document the flow and no longer say setup never creates the personal file", () => {
    const guide = read("docs/guides/ce-setup.md")
    expect(guide).toContain("## Set model roles")
    expect(guide).toContain("/ce-setup models")
    expect(guide).not.toMatch(/never creates the local override|never the override|or create `config\.local\.yaml`/)

    const config = read("docs/guides/configuration.md")
    expect(config).not.toContain("Setup does not create `config.local.yaml`")
    const roles = config.slice(config.indexOf("## Model roles"), config.indexOf("## Implementation routing"))
    expect(roles).toContain("/ce-setup models")
  })
})
