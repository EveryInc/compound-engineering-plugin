import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import path from "path"

// #2083: learnings cited code by `file:line` from the working tree, so refresh
// rewrote line numbers every time code moved, and a workspace holding other
// unmerged branches produced numbers that were wrong on the base branch.
const refs = path.join(import.meta.dir, "..", "..", "skills", "ce-compound", "references")
const read = (...parts: string[]) => readFileSync(path.join(refs, ...parts), "utf8")

describe("ce-compound code citations", () => {
  test("capture cites code by name and keeps line numbers as the fallback", () => {
    const research = read("research.md")
    expect(research).not.toContain("cite `file:line`")
    expect(research).toMatch(/function, class, or config key[^\n]*line number only when no name identifies the spot/)
  })

  test("grounding verifies code claims against the tree the learning merges with", () => {
    const grounding = read("grounding-validation.md")
    expect(grounding).not.toContain("verify against the **local working tree**")
    expect(grounding).toContain("the code the learning will merge with")
    expect(grounding).toContain("the tree to verify code against")
  })

  test("refresh judges citations against the default branch", () => {
    // overview.md is always read; a main-thread refresh may never open investigate.md.
    expect(read("refresh", "overview.md")).toMatch(
      /Judge a learning's code citations against the repository's default branch[^\n]*matches the default branch has not drifted/,
    )
    expect(read("refresh", "investigate.md")).toMatch(
      /> Check the learning's code citations against the repository's default branch[^\n]*matches the default branch has not drifted/,
    )
  })
})
