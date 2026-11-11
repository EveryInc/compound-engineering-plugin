import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const PLUGIN_ROOT = path.join(process.cwd(), "skills")

// The session-history scripts are byte-duplicated into every consuming skill
// (the plugin has no cross-skill import mechanism — see AGENTS.md "File
// References in Skills"). Behavior tests run against the ce-compound copy, so
// all copies must stay identical.
const SCRIPTS = [
  "discover-sessions.sh",
  "extract-metadata.py",
  "extract-skeleton.py",
  "extract-errors.py",
]

const CONSUMER_SKILLS = ["ce-compound", "ce-retro"]

describe("session-history shared-script parity", () => {
  for (const script of SCRIPTS) {
    test(`${script} exists in every consumer and is byte-identical`, async () => {
      const contents = await Promise.all(
        CONSUMER_SKILLS.map((skill) =>
          readFile(path.join(PLUGIN_ROOT, skill, "scripts/session-history", script)),
        ),
      )
      for (let i = 1; i < contents.length; i++) {
        expect(contents[i].equals(contents[0])).toBe(true)
      }
    })
  }
})
