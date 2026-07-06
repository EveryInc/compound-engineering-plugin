import { readFile, access } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const PLUGIN_ROOT = path.join(process.cwd(), "skills")

// The three shared cache assets are byte-duplicated into every consuming skill
// (the plugin has no cross-skill import mechanism — see AGENTS.md "File
// References in Skills"). All copies must stay identical. This grows as each
// wiring unit (U6-U11) adds its skill to CONSUMER_SKILLS.
const SHARED_CACHE_ASSETS = [
  "references/repo-profile-cache.md",
  "scripts/repo-profile-cache.py",
  "references/agents/repo-profiler.md",
]

const CONSUMER_SKILLS = [
  "ce-pov",
  "ce-plan",
  "ce-optimize",
  "ce-ideate",
  "ce-brainstorm",
  "ce-code-review",
  "ce-compound",
  "ce-debug",
  "ce-explain",
]

describe("repo-profile-cache shared-asset parity", () => {
  for (const asset of SHARED_CACHE_ASSETS) {
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
})
