import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

const root = path.join(import.meta.dir, "..", "..")
const read = (file: string) => readFileSync(path.join(root, file), "utf8")

describe("ce-babysit-pr review convergence contract", () => {
  test("persists resolver-owned invariant rounds and stops before a third fix", () => {
    const skill = read("skills/ce-babysit-pr/SKILL.md")
    const tick = read("skills/ce-babysit-pr/references/tick.md")
    const resolver = read("skills/ce-resolve-pr-feedback/references/pipeline-mode.md")

    expect(skill).toContain("persist resolver-classified fixed invariant keys by pushed head")
    expect(tick).toContain("--review-invariant-key <key> --review-invariant-head <sha>")
    expect(resolver).toContain("fixed_invariant_keys")
    expect(resolver).toContain("this is the third round")
  })

  test("approval:codex remains opt-in, current-head bound, and incompatible with pipeline mode", () => {
    const skill = read("skills/ce-babysit-pr/SKILL.md")
    const settle = read("skills/ce-babysit-pr/references/settle.md")
    const guide = read("docs/guides/ce-babysit-pr.md")

    expect(skill).toContain("[approval:codex]")
    expect(skill).toContain("Reject this token in `mode:pipeline`")
    expect(settle).toContain("posted after the current-head review request")
    expect(guide).toContain("current-head Codex thumbs-up")
  })
})
