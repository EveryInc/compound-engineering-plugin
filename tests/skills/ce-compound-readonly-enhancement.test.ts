import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import path from "path"

// The enhancement phase moved out of the always-loaded body into the reference
// the body names at that step; the read-only invariant moved with it.
const phase3Path = path.join(
  import.meta.dir,
  "..",
  "..",
  "skills",
  "ce-compound",
  "references",
  "enhancement.md",
)

describe("ce-compound enhancement phase", () => {
  test("keeps code simplification review read-only", () => {
    const phase3 = readFileSync(phase3Path, "utf8")

    expect(phase3).toContain("read-only documentation review")
    expect(phase3).toContain("do not mutate product code")
    expect(phase3).toContain("Do **not** invoke `ce-simplify-code`")
    expect(phase3).not.toContain("run `ce-simplify-code`")
    expect(phase3).not.toContain("invoking the `ce-simplify-code` skill")
  })
})
