import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const REF_DIR = path.join(process.cwd(), "skills/ce-code-review/references")
const FINISH_BODY = readFileSync(path.join(REF_DIR, "finish-review.md"), "utf8")
const TEMPLATE_BODY = readFileSync(path.join(REF_DIR, "subagent-template.md"), "utf8")

// Issue #1612 follow-ups (the halves #1614 did not cover): a synthetic or
// reconciled reviewer return preserves a verified adversarial peer's
// independence at the finding level, and dependency/import findings must be
// verified under the project's own interpreter before filing.
describe("ce-code-review synthetic return and evidence discipline", () => {
  test("finish-review requires finding-level independence preservation for verified adversarial peers", () => {
    expect(FINISH_BODY).toMatch(/keep that peer in the finding's `reviewers`/)
    expect(FINISH_BODY).toMatch(/`independence_verified: true`.*add it to the finding's `independent_reviewers`/s)
    expect(FINISH_BODY).toMatch(/derives a synthetic return's independence solely from that finding-level list/)
    expect(FINISH_BODY).toMatch(/return-level flag is ignored/)
  })

  test("subagent-template requires interpreter-aware dependency verification before filing", () => {
    expect(TEMPLATE_BODY).toMatch(/[Dd]ependency or import mismatches verified under the wrong interpreter/)
    expect(TEMPLATE_BODY).toMatch(/interpreter the project actually uses/)
    expect(TEMPLATE_BODY).toMatch(/Requires-Dist/)
    expect(TEMPLATE_BODY).toMatch(/host's default/)
  })
})
