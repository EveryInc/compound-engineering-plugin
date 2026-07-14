import { readFile, access } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const PLUGIN_ROOT = path.join(process.cwd(), "skills")

// The peer-job runner is byte-duplicated into every consuming review skill
// (the plugin has no cross-skill import mechanism — see AGENTS.md "File
// References in Skills"). All copies must stay identical.
const RUNNER_ASSETS = ["scripts/peer-job-runner.py"]

const CONSUMER_SKILLS = ["ce-doc-review", "ce-code-review"]

describe("peer-job-runner shared-asset parity", () => {
  for (const asset of RUNNER_ASSETS) {
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
