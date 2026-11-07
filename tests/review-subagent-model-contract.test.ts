import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const repoRoot = path.join(import.meta.dir, "..")
const read = (relative: string) => readFile(path.join(repoRoot, relative), "utf8")

const RULE_COPIES = [
  "skills/ce-code-review/references/subagent-model.md",
  "skills/ce-doc-review/references/subagent-model.md",
]

const POINTER = "`references/subagent-model.md`"

const SPAWN_SITE_POINTERS: Record<string, number> = {
  "skills/ce-code-review/references/dispatch-reviewers.md": 1,
  "skills/ce-code-review/references/scope.md": 1,
  "skills/ce-code-review/references/finish-input.md": 2,
  "skills/ce-doc-review/references/dispatch.md": 1,
}

describe("review subagent model rule", () => {
  test("both review skills carry the same rule", async () => {
    const [code, doc] = await Promise.all(RULE_COPIES.map(read))
    expect(code).toBe(doc)
  })

  test("the rule names the Codex default and the config key", async () => {
    const rule = await read(RULE_COPIES[0])
    expect(rule).toContain("`spawn_agent`")
    expect(rule).toContain("`gpt-6.1-terra` with reasoning effort `high`")
    expect(rule).toContain("`review_subagents`")
    expect(rule).toContain("so it inherits the session model")
  })

  test("every spawn site points at the rule once per kind of subagent it spawns", async () => {
    const sites = Object.entries(SPAWN_SITE_POINTERS)
    const contents = await Promise.all(sites.map(([site]) => read(site)))
    sites.forEach(([site, expected], i) => {
      expect(contents[i].split(POINTER).length - 1, site).toBeGreaterThanOrEqual(expected)
    })
  })

  test("the config template documents the key", async () => {
    const template = await read("skills/ce-setup/references/config-template.yaml")
    expect(template).toContain("# review_subagents:")
  })
})
