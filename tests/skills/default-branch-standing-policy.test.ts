import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import path from "path"

// #2071: these sites encoded this repo's own workflow (protected main, PR for
// everything, origin as truth) as universal, so a user whose standing
// instruction says to commit on local main, never push, or use a named browser
// driver had it silently overridden. Each site must let that instruction decide.
const read = (rel: string) =>
  readFileSync(path.join(import.meta.dir, "..", "..", rel), "utf8")

describe("standing instructions decide default-branch, push, and driver policy (#2071)", () => {
  test("ce-commit commits on the default branch when a standing instruction says to", () => {
    const body = read("skills/ce-commit/SKILL.md")
    // Detached HEAD still branches: a commit there is orphaned whatever the policy.
    expect(body).toMatch(/standing instruction[^\n]*\(not detached\)|\(not detached\)[^\n]*standing instruction/i)
  })

  test("ce-debug and ce-work honor a standing default-branch or no-push instruction", () => {
    const debug = read("skills/ce-debug/SKILL.md")
    expect(debug).toMatch(/Branch\.\*\*[^\n]*standing instruction/)
    expect(debug).toMatch(/Contextual override[^\n]*standing/)
    expect(read("skills/ce-debug/references/post-fix-handoff.md")).toMatch(
      /Contextual overrides come first\.\*\*[^\n]*standing/,
    )
    expect(read("skills/ce-work/references/workspace-setup.md")).toMatch(
      /commit on the default branch only when[^\n]*standing instruction/,
    )
    // The always-loaded body must agree, or a literal reader obeys it over the reference.
    expect(read("skills/ce-work/SKILL.md")).toMatch(
      /never write on the real default branch unless[^\n]*standing instruction/,
    )
  })

  test("ce-worktree keeps unpushed local commits in a new worktree's base", () => {
    const body = read("skills/ce-worktree/SKILL.md")
    expect(body).toMatch(/commits `origin\/<from-branch>` lacks/)
  })

  test("browser skills honor a named driver and do not hardcode main", () => {
    const browser = read("skills/ce-test-browser/SKILL.md")
    const dogfood = read("skills/ce-dogfood/SKILL.md")
    for (const body of [browser, dogfood]) {
      expect(body).toMatch(/standing instruction[^\n]*(browser|driver)/i)
    }
    expect(browser).not.toContain("main...")
  })
})
