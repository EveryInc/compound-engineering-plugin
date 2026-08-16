import { describe, expect, test } from "bun:test"
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from "fs"
import path from "path"

// The repo-local `ce-skill-work` skill is how the skill lifecycle (author / edit /
// review / respond) is delivered to agents working in this checkout. It is not
// part of the distributed plugin (plugin skills live under `skills/`), so none
// of the plugin-facing tests see it. This guard pins the three facts the
// AGENTS.md pointer depends on: the skill exists at the Claude Code path, the
// Codex path is a symlink to the same copy (one source of truth), and AGENTS.md
// still routes skill work to it.

const ROOT = process.cwd()
const CLAUDE_SKILL = path.join(ROOT, ".claude", "skills", "ce-skill-work")
const CODEX_SKILL = path.join(ROOT, ".agents", "skills", "ce-skill-work")

describe("repo-local ce-skill-work skill", () => {
  test("exists at the Claude Code project-skill path with trigger-only frontmatter", () => {
    const skill = readFileSync(path.join(CLAUDE_SKILL, "SKILL.md"), "utf8")
    expect(skill).toMatch(/^---\nname: ce-skill-work\ndescription: "Use when /)
    for (const ref of ["new-skill", "edit-skill", "review-skill", "respond-to-review", "evaluate"]) {
      expect(existsSync(path.join(CLAUDE_SKILL, "references", `${ref}.md`))).toBe(true)
      expect(skill).toContain(`references/${ref}.md`)
    }
  })

  test("Codex path is a symlink to the single Claude Code copy", () => {
    expect(lstatSync(CODEX_SKILL).isSymbolicLink()).toBe(true)
    expect(readlinkSync(CODEX_SKILL)).toBe(path.join("..", "..", ".claude", "skills", "ce-skill-work"))
    expect(realpathSync(CODEX_SKILL)).toBe(realpathSync(CLAUDE_SKILL))
  })

  test("SKILL.md maps each of the four modes to its reference and shapes the report per mode", () => {
    const skill = readFileSync(path.join(CLAUDE_SKILL, "SKILL.md"), "utf8")
    expect(skill).toMatch(/Creating a new skill \| `references\/new-skill\.md`/)
    expect(skill).toMatch(/Changing an existing skill \| `references\/edit-skill\.md`/)
    expect(skill).toMatch(/Reviewing a skill change \| `references\/review-skill\.md`/)
    expect(skill).toMatch(/Acting on review feedback for a skill \| `references\/respond-to-review\.md`/)
    expect(skill).toMatch(/\*\*Review mode:\*\*[^\n]*no changed-block entries/)
  })

  test("AGENTS.md routes all four activities to the skill and keeps the reviewer rules bots read", () => {
    const agents = readFileSync(path.join(ROOT, "AGENTS.md"), "utf8")
    expect(agents).toMatch(/Before creating, editing, reviewing, or acting on review feedback for anything under `skills\/\*\*`, invoke the repo-local `ce-skill-work` skill/)
    expect(agents).toContain(".claude/skills/ce-skill-work/")
    expect(agents).toContain(".agents/skills/ce-skill-work")
    expect(agents).toMatch(/### Reviewing a skill change \(bots and humans\)/)
    expect(agents).toMatch(/A case a stated condition already covers is not a finding/)
  })
})
