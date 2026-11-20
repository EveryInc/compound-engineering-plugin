import { readFileSync } from "fs"
import path from "path"
import { Glob } from "bun"
import { describe, expect, test } from "bun:test"
import { load } from "js-yaml"

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8")

const STALE_FIELDS = ["status", "stale_reason", "stale_date"]

const RESEARCHERS = [
  ...new Glob("skills/*/references/**/learnings-researcher.md").scanSync({ cwd: process.cwd() }),
].sort()

describe("refresh's stale mark has a schema entry and readers", () => {
  test("refresh still writes the fields the readers check", () => {
    const modes = read("skills/ce-compound/references/refresh/modes.md")
    for (const field of STALE_FIELDS) expect(modes).toContain(`\`${field}`)
  })

  test("schema.yaml defines the stale mark and the template's title and category as optional", () => {
    const schema = load(read("skills/ce-compound/references/schema.yaml")) as {
      required_fields: Record<string, unknown>
      optional_fields: Record<string, { description?: string }>
    }
    for (const field of [...STALE_FIELDS, "title", "category"]) {
      expect(schema.optional_fields[field]?.description, field).toBeTruthy()
      expect(schema.required_fields[field], field).toBeUndefined()
    }
  })

  test("every learnings researcher copy is checked", () => {
    expect(RESEARCHERS.length).toBeGreaterThanOrEqual(4)
  })

  test.each(RESEARCHERS)("%s reads the stale mark and does not present a stale learning as current", (rel) => {
    const body = read(rel)
    expect(body).toMatch(/^- \*\*status\*\*/m)
    expect(body).toMatch(/^A learning whose frontmatter has `status: stale`.*do not present it as current guidance/m)
    expect(body).toMatch(/^- \*\*Stale\*\*: .*stale_reason/m)
  })

  test("a later refresh that settles a stale-marked doc clears the mark", () => {
    const investigate = read("skills/ce-compound/references/refresh/investigate.md")
    expect(investigate).toContain("`status: stale`")
    for (const field of STALE_FIELDS) expect(investigate).toContain(`\`${field}\``)
  })
})
