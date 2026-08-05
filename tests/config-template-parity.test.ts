import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

// The ce-setup config template is byte-duplicated into the committed example
// copy at the repo root (the plugin has no cross-skill import mechanism — see
// AGENTS.md "Plugin Maintenance"). Both copies must stay identical.
const TEMPLATE_PATH = path.join(
  process.cwd(),
  "skills",
  "ce-setup",
  "references",
  "config-template.yaml",
)
const EXAMPLE_PATH = path.join(
  process.cwd(),
  ".compound-engineering",
  "config.local.example.yaml",
)

const QUALITY_SUBKEYS = ["test", "lint", "typecheck", "build"]

describe("config template/example parity", () => {
  test("template and example copy are byte-identical", async () => {
    const [template, example] = await Promise.all([
      readFile(TEMPLATE_PATH),
      readFile(EXAMPLE_PATH),
    ])
    expect(example.equals(template)).toBe(true)
  })

  test("quality_commands block exists in the canonical template with all four sub-keys", async () => {
    const canonical = await readFile(TEMPLATE_PATH, "utf8")
    expect(canonical).toContain("quality_commands:")
    for (const key of QUALITY_SUBKEYS) {
      // Sub-keys ship as commented examples: `#   test: "..."`.
      expect(canonical).toMatch(new RegExp(`^#\\s+${key}:`, "m"))
    }
  })

  test("shipped quality_commands lines are all commented — defaults must be unset", async () => {
    const canonical = await readFile(TEMPLATE_PATH, "utf8")
    // An active (uncommented) `quality_commands:` map or sub-key would make the
    // shipped template set real defaults; only commented documentation ships.
    expect(canonical).not.toMatch(/^\s*quality_commands:/m)
    for (const key of QUALITY_SUBKEYS) {
      expect(canonical).not.toMatch(new RegExp(`^\\s+${key}:`, "m"))
    }
  })
})
