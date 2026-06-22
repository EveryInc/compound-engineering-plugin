import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import path from "path"

const skillPath = path.join(
  import.meta.dir,
  "..",
  "..",
  "skills",
  "ce-compound",
  "SKILL.md",
)

describe("ce-compound enhancement phase", () => {
  test("keeps code simplification review read-only", () => {
    const skill = readFileSync(skillPath, "utf8")
    const phase3 = skill.slice(
      skill.indexOf("### Phase 3: Optional Enhancement"),
      skill.indexOf("### Lightweight Mode"),
    )

    expect(phase3).toContain("read-only documentation review")
    expect(phase3).toContain("do not mutate product code")
    expect(phase3).toContain("Do **not** invoke `ce-simplify-code`")
    expect(phase3).not.toContain("run `ce-simplify-code`")
    expect(phase3).not.toContain("invoking the `ce-simplify-code` skill")
  })
})
