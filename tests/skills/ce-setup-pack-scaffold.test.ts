import { spawnSync } from "child_process"
import { existsSync, readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"
import { load } from "js-yaml"

// ce-setup's pack scaffold exists because a first pack authored by hand put its
// decision records under research/ and nothing was ever discovered. These guards
// pin the contract across the three surfaces: the SKILL.md trigger, the procedure
// reference it points at, and the bundled rule template the reference writes from.
// The template must itself be what the resolver discovers as a rule, so a
// scaffolded pack publishes before the author replaces a single placeholder.

const REPO = process.cwd()
const read = (rel: string) => readFileSync(path.join(REPO, rel), "utf8")

const SKILL = read("skills/ce-setup/SKILL.md")
const REFERENCE_PATH = "skills/ce-setup/references/pack-scaffold.md"
const TEMPLATE_PATH = "skills/ce-setup/assets/pack-rule-template.md"
const RESOLVER = path.join(REPO, "skills/ce-setup/scripts/packs-resolve.py")

function frontmatter(body: string): Record<string, unknown> {
  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  expect(match, "frontmatter block").not.toBeNull()
  return load(match![1]) as Record<string, unknown>
}

describe("ce-setup pack scaffold contract", () => {
  test("SKILL.md names the pack:<id> trigger as a condition and routes to the reference", () => {
    const fm = frontmatter(SKILL)
    expect(fm["argument-hint"]).toContain("pack:<id>")
    expect(fm.description).toContain("pack:<id>")

    const section = SKILL.slice(SKILL.indexOf("## Pack Scaffold"), SKILL.indexOf("## Artifact Root Resolution"))
    expect(section).toMatch(/names a Compound Pack to add, create, or scaffold/)
    expect(section).toContain("`pack:<id>`")
    expect(section).toContain("references/pack-scaffold.md")
    expect(section).toMatch(/only after the user approves/)
  })

  test("the reference names the template, the default directory, the config append, and the health check", () => {
    const reference = read(REFERENCE_PATH)
    expect(reference).toContain("assets/pack-rule-template.md")
    expect(reference).toContain("compound-packs/<id>/")
    expect(reference).toContain("- source: compound-packs/<id>")
    expect(reference).toMatch(/`packs:` (list|key)/)
    expect(reference).toContain(".compound-engineering/config.yaml")
    expect(reference).toContain("scripts/check-health")
    // The two fragile gates the skill-level done bar cannot protect.
    expect(reference).toMatch(/exists and is not empty/)
    expect(reference).toMatch(/non-interactive[^.]*(wrote nothing|writes nothing)/)
    // The rule the scaffold exists to teach, stated for the author.
    expect(reference).toMatch(/top-level `\.md` with `title` and `applies_when`/)
    expect(reference).toContain("https://everyinc.github.io/compound-engineering-plugin/guides/packs/")
  })

  test("the template exists, is a rule the resolver discovers, and shows two applies_when situations", () => {
    expect(existsSync(path.join(REPO, TEMPLATE_PATH))).toBe(true)
    const template = read(TEMPLATE_PATH)
    const fm = frontmatter(template)
    expect(typeof fm.title).toBe("string")
    expect(Array.isArray(fm.applies_when)).toBe(true)
    expect((fm.applies_when as unknown[]).length).toBe(2)
    expect(Array.isArray(fm.tags)).toBe(true)

    const probe = spawnSync(
      "python3",
      ["-c", `
import importlib.util, sys
spec = importlib.util.spec_from_file_location("pr", ${JSON.stringify(RESOLVER)})
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sys.exit(0 if m._is_knowledge_file(${JSON.stringify(path.join(REPO, TEMPLATE_PATH))}) else 3)
`],
      { encoding: "utf8" },
    )
    expect(probe.status, probe.stderr).toBe(0)

    // The body carries the layout reminder as prose the author is told to delete,
    // not as an HTML comment, so it reads the same on every host.
    const body = template.slice(template.indexOf("\n---", 4) + 4)
    expect(body).toMatch(/top-level `\.md` files with `title` and `applies_when`/)
    expect(body).toMatch(/subfolders are storage/)
    expect(body).not.toContain("<!--")
  })

  test("the guides lead with the scaffold and no longer list a pack-authoring skill as unbuilt", () => {
    const packs = read("docs/guides/packs.md")
    const create = packs.slice(packs.indexOf("## Create your first pack"), packs.indexOf("## Pack layout"))
    expect(create).toContain("`/ce-setup pack:house-rules`")
    expect(packs.slice(packs.indexOf("## Not built"))).not.toMatch(/pack-authoring/)
    expect(read("docs/guides/ce-setup.md")).toContain("## Scaffold a Compound Pack")
  })
})
