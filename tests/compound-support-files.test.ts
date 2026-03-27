import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const PLUGIN_ROOT = path.join(process.cwd(), "plugins", "compound-engineering", "skills")

/** Canonical copies live in ce-compound; mirrors must stay identical. */
const SHARED_SUPPORT_FILES = [
  "references/schema.yaml",
  "references/yaml-schema.md",
  "assets/resolution-template.md",
]

const SKILLS_WITH_COPIES = ["ce-compound", "ce-compound-refresh"]

describe("ce:compound support file drift", () => {
  for (const file of SHARED_SUPPORT_FILES) {
    test(`${file} is identical across ${SKILLS_WITH_COPIES.join(", ")}`, async () => {
      const contents = await Promise.all(
        SKILLS_WITH_COPIES.map((skill) =>
          readFile(path.join(PLUGIN_ROOT, skill, file), "utf8"),
        ),
      )

      for (let i = 1; i < contents.length; i++) {
        expect(contents[i]).toBe(contents[0])
      }
    })
  }
})
