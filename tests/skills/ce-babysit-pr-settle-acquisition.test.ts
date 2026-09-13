import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SETTLE_BODY = readFileSync(
  path.join(process.cwd(), "skills/ce-babysit-pr/references/settle.md"),
  "utf8",
)

// Issue #1618: the review-still-coming gate rests on a four-surface lookup
// (PR-body reactions, top-level comments, check runs, reviews) whose
// acquisition rules were unstated - the eval cells cover the reasoning from
// prepared data, so these contract tests pin the mechanical acquisition rules
// themselves. Direction per the issue: option (b), deterministic coverage in
// bun test, no live-fixture eval cell.
describe("ce-babysit-pr settle.md review-gate acquisition rules", () => {
  test("identity correlation: bot logins differ across REST and GraphQL and must be normalized", () => {
    expect(SETTLE_BODY).toMatch(/cursor\[bot\]/)
    expect(SETTLE_BODY).toMatch(/chatgpt-codex-connector\[bot\]/)
    expect(SETTLE_BODY).toMatch(/strip a trailing `\[bot\]` and lowercase/)
    expect(SETTLE_BODY).toMatch(/keep the actor kind attached/)
    expect(SETTLE_BODY).toMatch(/cross-kind match is inconclusive/)
    expect(SETTLE_BODY).toMatch(/[Nn]ever correlate a reviewer across surfaces on the raw login/)
  })

  test("head attribution: PR-scoped surfaces carry no commit identity", () => {
    expect(SETTLE_BODY).toMatch(/PR-scoped.*no commit identity|PR-scoped - they carry no commit identity/)
    expect(SETTLE_BODY).toMatch(/[Cc]heck runs and reviews are commit-scoped/)
    expect(SETTLE_BODY).toMatch(/if the head moved after the announcement/)
    expect(SETTLE_BODY).toMatch(/current.*head before clearing the wait/)
  })

  test("pagination: every surface paginates and all pages must be fetched", () => {
    expect(SETTLE_BODY).toMatch(/[Ee]very surface paginates/)
    expect(SETTLE_BODY).toMatch(/[Ff]etch all pages/)
    expect(SETTLE_BODY).toMatch(/truncated/)
  })

  test("probe failure: a failed or partial lookup is inconclusive, never all-clear", () => {
    expect(SETTLE_BODY).toMatch(/[Pp]robe failure/)
    expect(SETTLE_BODY).toMatch(/inconclusive/)
    expect(SETTLE_BODY).toMatch(/never read a failed or partial lookup as "no review coming/)
  })
})
