import { readFile, access } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const PLUGIN_ROOT = path.join(process.cwd(), "skills")

// factory-gates.py is byte-duplicated into every consuming skill (the plugin has no
// cross-skill import mechanism — see AGENTS.md "File References in Skills"). ce-work
// holds the canonical copy; all copies must stay identical. Adding a consumer is one
// line here plus the duplicated file in that skill.
const SHARED_ASSETS = ["scripts/factory-gates.py"]

const CONSUMER_SKILLS = ["ce-work", "lfg", "ce-code-review"]

describe("factory-gates shared-script parity", () => {
  for (const asset of SHARED_ASSETS) {
    test(`${asset} exists in every consumer and is byte-identical`, async () => {
      const contents = await Promise.all(
        CONSUMER_SKILLS.map(async (skill) => {
          const p = path.join(PLUGIN_ROOT, skill, asset)
          await access(p) // fails the test if a consumer is missing the copy
          return readFile(p, "utf8")
        }),
      )
      for (let i = 1; i < contents.length; i++) {
        expect(contents[i]).toBe(contents[0])
      }
    })
  }

  test("the canonical copy pins all six subcommand surfaces", async () => {
    const canonical = await readFile(
      path.join(PLUGIN_ROOT, CONSUMER_SKILLS[0], SHARED_ASSETS[0]),
      "utf8",
    )
    // Byte-parity alone would let every copy drop a gate together; pin the
    // subcommand tokens on the canonical copy.
    expect(canonical).toContain('add_parser("artifacts"')
    expect(canonical).toContain('add_parser("diff-claims"')
    expect(canonical).toContain('add_parser("verdict"')
    expect(canonical).toContain('"--acceptance"')
    expect(canonical).toContain('add_parser("validate"')
    expect(canonical).toContain('add_parser("journal"')
  })
})
