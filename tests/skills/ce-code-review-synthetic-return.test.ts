import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const REF_DIR = path.join(process.cwd(), "skills/ce-code-review/references")
const FINISH_BODY = readFileSync(path.join(REF_DIR, "finish-review.md"), "utf8")
const TEMPLATE_BODY = readFileSync(path.join(REF_DIR, "subagent-template.md"), "utf8")

// Issue #1612 follow-ups (the halves #1614 did not cover): a synthetic or
// reconciled reviewer return must carry the peer's independence_verified in
// the return entry itself, and dependency/import findings must be verified
// under the project's own interpreter before filing.
describe("ce-code-review synthetic return and evidence discipline", () => {
  test("finish-review requires copying independence_verified into the synthetic return entry", () => {
    expect(FINISH_BODY).toMatch(/copy `independence_verified: true`.*on-disk artifact.*return entry/s)
    expect(FINISH_BODY).toMatch(/helper reads the field only from the return entry/)
    expect(FINISH_BODY).toMatch(/artifact alone/)
  })

  test("subagent-template requires interpreter-aware dependency verification before filing", () => {
    expect(TEMPLATE_BODY).toMatch(/[Dd]ependency or import mismatches verified under the wrong interpreter/)
    expect(TEMPLATE_BODY).toMatch(/interpreter the project actually uses/)
    expect(TEMPLATE_BODY).toMatch(/Requires-Dist/)
    expect(TEMPLATE_BODY).toMatch(/host's default/)
  })
})
