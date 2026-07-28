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

  // Narrow guard: the legacy "fable" token must not return to an always-loaded
  // SKILL.md. Model choice now arrives from config or the prompt at runtime, so a
  // hardcoded model name in a SKILL.md hook is a regression — the engine and its
  // model examples live in the reference, not the always-loaded body. This is NOT
  // a general model-agnosticism proof: a single-token search cannot verify that,
  // and "fable" is a substring of the ordinary word "diffable" — so this checks
  // exactly that these hooks did not reintroduce the retired model name.
  test("no consumer SKILL.md reintroduces the retired model name", async () => {
    for (const skill of CONSUMER_SKILLS) {
      const skillMd = await readFile(path.join(PLUGIN_ROOT, skill, "SKILL.md"), "utf8")
      expect(skillMd.toLowerCase()).not.toContain("fable")
    }
  })
})
