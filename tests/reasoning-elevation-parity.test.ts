import { readFile, access } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const PLUGIN_ROOT = path.join(process.cwd(), "skills")

// The reasoning-elevation engine is byte-duplicated into every consuming skill
// (the plugin has no cross-skill import mechanism — see AGENTS.md "File
// References in Skills"). All copies must stay identical; editing one without the
// other fails this test. Add a skill to CONSUMER_SKILLS when it gains a copy.
const ELEVATION_ASSET = "references/reasoning-elevation.md"

const CONSUMER_SKILLS = ["ce-plan", "ce-brainstorm"]

describe("reasoning-elevation engine parity", () => {
  test(`${ELEVATION_ASSET} exists in every consumer and is byte-identical`, async () => {
    const contents = await Promise.all(
      CONSUMER_SKILLS.map(async (skill) => {
        const p = path.join(PLUGIN_ROOT, skill, ELEVATION_ASSET)
        await access(p) // fails the test if a consumer is missing the copy
        return readFile(p, "utf8")
      }),
    )
    for (let i = 1; i < contents.length; i++) {
      expect(contents[i]).toBe(contents[0])
    }
  })

  // The always-loaded SKILL.md must carry NO token that names the elevated model,
  // in any casing — not the model name, not the gated reference's old model-named
  // filename, not a config key that contains it. The silent no-op on non-Claude
  // harnesses depends on the model-bearing engine living only in the Claude-gated
  // reference; the stub names a model-neutral reference file and no model or key.
  // A blanket "fable" token check (rather than a couple of exact substrings) is
  // what makes this guarantee real: a filename or config-key mention would leak
  // into non-Claude context and this catches it.
  test("no consumer SKILL.md mentions the elevated model by any token", async () => {
    for (const skill of CONSUMER_SKILLS) {
      const skillMd = await readFile(path.join(PLUGIN_ROOT, skill, "SKILL.md"), "utf8")
      expect(skillMd.toLowerCase()).not.toContain("fable")
    }
  })
})
