import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

const SKILL = readFileSync(
  path.join(
    process.cwd(),
    "plugins/compound-engineering/skills/ce-compound/SKILL.md"
  ),
  "utf8"
)

describe("ce-compound Phase 1 artifact contract", () => {
  test("research subagents write scratch artifacts instead of returning long prose inline", () => {
    expect(SKILL).toContain("/tmp/compound-engineering/ce-compound/<run-id>/")
    expect(SKILL).toContain("printf 'ce-compound scratch dir: %s\\n' \"$SCRATCH_DIR\"")
    expect(SKILL).toContain("Do not pass the literal `$SCRATCH_DIR` variable")
    expect(SKILL).toContain("Return exactly one line: Artifact: <artifact-path>")
    expect(SKILL).toContain("<scratch-dir>/context-analyzer.md")
    expect(SKILL).toContain("<scratch-dir>/solution-extractor.md")
    expect(SKILL).toContain("<scratch-dir>/related-docs-finder.md")
    expect(SKILL).toContain("file-write capability enabled")
    expect(SKILL).toContain("read each artifact")
    expect(SKILL).not.toContain("Phase 1 subagents return TEXT DATA")
    expect(SKILL).not.toContain("They must NOT use Write")
    expect(SKILL).not.toContain("Subagents return text data")
  })
})
