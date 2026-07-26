import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const read = (relativePath: string): string =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8")

const CONSUMERS = [
  {
    path: "skills/ce-plan/SKILL.md",
    keys: ["plan_output", "plan_skip_scoping_confirm"],
  },
  { path: "skills/ce-brainstorm/SKILL.md", keys: ["brainstorm_output"] },
  { path: "skills/ce-ideate/SKILL.md", keys: ["ideate_output"] },
  {
    path: "skills/ce-commit-push-pr/SKILL.md",
    keys: ["pr_teaching_section", "pr_teaching_archive", "auto_babysit"],
  },
  { path: "skills/ce-product-pulse/SKILL.md", keys: ["pulse_product_name"] },
  { path: "skills/ce-sweep/SKILL.md", keys: ["feedback_sources"] },
  {
    path: "skills/ce-promote/references/spiral-cli.md",
    keys: ["ce_promote_spiral_optout"],
  },
]

const PROJECT_WRITERS = [
  ["skills/ce-product-pulse/SKILL.md", "ce-product-pulse"],
  ["skills/ce-sweep/references/interview.md", "ce-sweep"],
  ["skills/ce-promote/references/spiral-cli.md", "ce-promote"],
] as const

describe("non-routing settings consumer contract", () => {
  test.each(CONSUMERS)(
    "$path reads the effective resolver view",
    ({ path: relativePath, keys }) => {
      const body = read(relativePath)

      expect(body).toContain("references/execution-routing.md")
      expect(body).toContain("python3 -I -S")
      expect(body).toContain("$SKILL_DIR/scripts/ce-routing.py")
      expect(body).toMatch(/`inspect` request/)
      expect(body).toContain("settings.effective")
      expect(body).toContain("settings.provenance")
      for (const key of keys) {
        expect(body).toContain(`settings.effective.${key}`)
      }
      expect(body).not.toMatch(
        /read[^\n]*config\.local\.yaml[^\n]*native file-read|cat[^\n]*config\.local\.yaml|config file read above|contents have an?[^\n]*uncommented/i,
      )
    },
  )

  test.each(PROJECT_WRITERS)("%s patches only project source", (relativePath, writer) => {
    const body = read(relativePath)

    expect(body).toContain("patch_source")
    expect(body).toMatch(/layer[^\n]*project/i)
    expect(body).toContain("sources.project.revision")
    expect(body).toContain("expected_revision")
    expect(body).toMatch(new RegExp(`writer[^\\n]*${writer}`))
    expect(body).toContain("remove: []")
    expect(body).toMatch(/never[^\n]*(copy|materialize)[^\n]*inherited/i)
    expect(body).not.toMatch(/native file-(write|edit)/i)
  })

  test("ce-setup identifies itself for project and explicit-global patches", () => {
    const body = read("skills/ce-setup/SKILL.md")

    expect(body).toContain("patch_source")
    expect(body).toMatch(/writer[^\n]*ce-setup/)
    expect(body).toMatch(/global layer only when the user explicitly asks/i)
  })

  test("central documentation covers global settings and routing semantics", () => {
    const body = read("docs/skills/configuration.md")

    expect(body).toContain("COMPOUND_ENGINEERING_HOME")
    expect(body).toContain("XDG_CONFIG_HOME")
    expect(body).toContain("routing")
    expect(body).toContain("ce-default")
    expect(body).toMatch(/explicit `?null`?/i)
    expect(body).toMatch(/trusted[^\n]*authority|authority[^\n]*trusted/i)
    expect(body).toContain("settings.effective")
    expect(body).toMatch(/project-local[^\n]*writer|writers[^\n]*project/i)
    expect(body).toMatch(/`require`[^\n]*block[^\n]*without prompting/i)
    expect(body).not.toMatch(/`require`[^\n]*asks before/i)
  })
})
